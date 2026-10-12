import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, EmptyState } from "./UI.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { formatDateTime } from "../data.js";
import * as api from "../api.js";
import {
  VOICE_TRADES,
  VOICE_LIMITS,
  ELEM_SUGGESTIONS,
  getTrade,
  normalizeSlang,
  buildSummary,
  getSpeechRecognition,
  floorChoices,
  buildZone,
} from "../voice.js";

// 하도급사 전용 "음성 검측" 탭 (시안 index.html의 기능).
// 공종을 고르고 위치(동·층·부재)를 정한 뒤 마이크로 말하면 → 음성 인식 → 현장 은어를 표준 용어로 바꾸고 → 공종별 요약 문장을 만들어 → 저장한다.
// 음성 인식이 안 되는 기기(앱 안의 브라우저 등)를 위해 직접 입력으로도 같은 과정을 거치게 했다.
// 화면 문구는 하도급사가 외국인 근로자일 수 있어 번역 사전(voice.*)을 쓴다. 저장되는 발화 원문·요약은 말한 그대로(한국어)다.

const STORAGE_KEY = "voiceInspectionSelection";
const PAGE_SIZE = 20;

function readSaved() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeSaved(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 선택을 기억해 두지 못해도 보고를 남기는 데에는 영향이 없다.
  }
}

// 음성 인식이 돌려주는 오류 코드를 안내 문구 키로 바꾼다. "aborted"(우리가 멈춘 경우)는 안내가 필요 없다.
function errorKey(code) {
  if (code === "not-allowed" || code === "service-not-allowed") return "voice.err.permission";
  if (code === "no-speech") return "voice.err.noSpeech";
  if (code === "audio-capture") return "voice.err.noMic";
  if (code === "network") return "voice.err.network";
  if (code === "aborted") return null;
  return "voice.err.generic";
}

export default function VoiceInspection({ buildings, userName, notify }) {
  const { t } = useLanguage();
  const [initial] = useState(readSaved);
  const [tradeId, setTradeId] = useState(() => (VOICE_TRADES.some((x) => x.id === initial.tradeId) ? initial.tradeId : VOICE_TRADES[0].id));
  const [buildingId, setBuildingId] = useState(() => (buildings.some((b) => b.id === initial.buildingId) ? initial.buildingId : ""));
  const [floor, setFloor] = useState(() => (Number.isInteger(initial.floor) && initial.floor !== 0 ? initial.floor : 1));
  const [elem, setElem] = useState(() => (typeof initial.elem === "string" ? initial.elem.slice(0, VOICE_LIMITS.elem) : ""));

  const [supported] = useState(() => !!getSpeechRecognition());
  const [status, setStatus] = useState("idle"); // idle | listening | stopping | saving
  const [message, setMessage] = useState(null); // { kind: "error" | "ok", key }
  const [result, setResult] = useState(null); // 방금 보낸 보고 { id, rawText, summary, ..., state: saving | saved | error }
  const [showText, setShowText] = useState(!supported);
  const [textValue, setTextValue] = useState("");

  const [reports, setReports] = useState([]);
  const [feedState, setFeedState] = useState("loading"); // loading | ready | error
  const [visible, setVisible] = useState(PAGE_SIZE);

  // 선택한 값들로 위치를 계산한다. 저장해 둔 동이 없어졌거나 층이 그 동에 없으면 안전한 값으로 대체한다.
  const trade = getTrade(tradeId);
  const building = buildings.find((b) => b.id === buildingId) || buildings[0] || null;
  const floors = building ? floorChoices(building.floors) : [];
  const activeFloor = floors.includes(floor) ? floor : 1;
  const zone = building ? buildZone(building.name, activeFloor) : "";
  const canRecord = !!building && elem.trim().length > 0;
  const busy = status !== "idle";

  // 음성 인식 이벤트 처리기는 한 번만 만들어 두므로, 최신 값은 ref로 읽는다.
  const latest = useRef({});
  latest.current = { tradeId, building, floor: activeFloor, elem, userName, zone, t, notify };
  const mounted = useRef(true);
  const recRef = useRef(null);
  const gotResult = useRef(false);
  const gotError = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const rec = recRef.current;
      if (rec) {
        rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
        try {
          rec.abort();
        } catch {
          // 이미 멈춘 상태면 무시
        }
      }
    };
  }, []);

  useEffect(() => {
    writeSaved({ tradeId, buildingId: building ? building.id : "", floor: activeFloor, elem });
  }, [tradeId, building, activeFloor, elem]);

  // 말을 끝냈다고 눌렀는데 브라우저가 끝났다는 신호를 끝내 보내지 않는 경우에도 화면이 멈춰 있지 않도록 안전장치를 둔다.
  useEffect(() => {
    if (status !== "stopping") return undefined;
    const timer = setTimeout(() => {
      setStatus((s) => (s === "stopping" ? "idle" : s));
      setMessage({ kind: "error", key: "voice.err.generic" });
    }, 8000);
    return () => clearTimeout(timer);
  }, [status]);

  // ---------------- 최근 보고 목록 ----------------
  const loadReports = useCallback(async (targetZone) => {
    if (!targetZone) {
      setReports([]);
      setFeedState("ready");
      return;
    }
    setFeedState("loading");
    try {
      const list = await api.fetchVoiceReports(targetZone);
      if (!mounted.current || latest.current.zone !== targetZone) return; // 그 사이 다른 위치로 바꿨으면 버린다
      setReports(list);
      setFeedState("ready");
    } catch {
      if (mounted.current && latest.current.zone === targetZone) setFeedState("error");
    }
  }, []);

  useEffect(() => {
    setVisible(PAGE_SIZE);
    setResult(null);
    setMessage(null);
    loadReports(zone);
  }, [zone, loadReports]);

  // ---------------- 보고 만들기·저장 ----------------
  async function sendReport(entry) {
    setResult({ ...entry, state: "saving" });
    setStatus("saving");
    setMessage(null);
    try {
      const saved = await api.createVoiceReport(entry);
      if (!mounted.current) return;
      setResult({ ...entry, state: "saved" });
      setMessage({ kind: "ok", key: "voice.status.done" });
      if (latest.current.zone === entry.zone) setReports((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
      latest.current.notify(latest.current.t("voice.sent"));
    } catch {
      if (!mounted.current) return;
      setResult({ ...entry, state: "error" });
      setMessage({ kind: "error", key: "voice.err.save" });
    } finally {
      if (mounted.current) setStatus("idle");
    }
  }

  // 말한(또는 입력한) 내용 하나를 보고로 만든다: 은어 변환 → 공종별 요약 → 저장.
  function handleTranscript(raw, via) {
    const cur = latest.current;
    if (!cur.building) return;
    const rawText = String(raw || "").trim().slice(0, VOICE_LIMITS.rawText);
    if (!rawText) {
      setStatus("idle");
      setMessage({ kind: "error", key: "voice.err.noSpeech" });
      return;
    }
    const normalized = normalizeSlang(rawText);
    sendReport({
      id: api.newVoiceReportId(),
      trade: cur.tradeId,
      author: cur.userName,
      buildingId: cur.building.id,
      buildingName: cur.building.name,
      floor: cur.floor,
      zone: cur.zone,
      elem: cur.elem.trim(),
      rawText,
      normalized,
      summary: buildSummary(cur.tradeId, normalized),
      via,
    });
  }

  // ---------------- 음성 인식 ----------------
  function ensureRecognition() {
    if (recRef.current) return recRef.current;
    const SR = getSpeechRecognition();
    if (!SR) return null;
    const rec = new SR();
    rec.lang = "ko-KR";
    rec.continuous = false; // 한 번 말하면 끝나도록(끊김 방지)
    rec.interimResults = false;
    rec.onresult = (event) => {
      gotResult.current = true;
      const transcript = event && event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
      handleTranscript(transcript, "voice");
    };
    rec.onerror = (event) => {
      gotError.current = true;
      const key = errorKey(event && event.error);
      if (key) setMessage({ kind: "error", key });
      if (event && (event.error === "not-allowed" || event.error === "service-not-allowed")) setShowText(true); // 마이크를 못 쓰면 직접 입력으로 이어갈 수 있게
    };
    rec.onend = () => {
      // 결과도 오류도 없이 끝난 경우(아무 말도 안 했거나 바로 멈춘 경우)에도 안내를 남긴다.
      if (!gotResult.current && !gotError.current) setMessage({ kind: "error", key: "voice.err.noSpeech" });
      setStatus((s) => (s === "listening" || s === "stopping" ? "idle" : s));
    };
    recRef.current = rec;
    return rec;
  }

  function toggleMic() {
    if (!canRecord) return;
    if (status === "listening") {
      // 말을 끝냈다는 표시 - 지금까지 들은 내용을 결과로 넘겨 달라고 요청한다.
      setStatus("stopping");
      setMessage(null);
      try {
        recRef.current && recRef.current.stop();
      } catch {
        setStatus("idle");
      }
      return;
    }
    if (status !== "idle") return;
    const rec = ensureRecognition();
    if (!rec) return;
    gotResult.current = false;
    gotError.current = false;
    setMessage(null);
    // 지난 보고의 '저장 완료' 결과는 새 녹음을 시작하면 치운다(저장에 실패한 결과는 다시 보내기 전까지 남겨 둔다).
    setResult((r) => (r && r.state === "saved" ? null : r));
    setStatus("listening");
    try {
      rec.start();
    } catch {
      // 이미 시작된 상태 등으로 실패하면 한 번 멈췄다가 다시 시작해 본다.
      try {
        rec.stop();
      } catch {
        // 무시
      }
      setTimeout(() => {
        if (!mounted.current) return;
        try {
          rec.start();
        } catch {
          setStatus("idle");
          setMessage({ kind: "error", key: "voice.err.generic" });
        }
      }, 200);
    }
  }

  function submitText(e) {
    e.preventDefault();
    const value = textValue.trim();
    if (!canRecord || busy || !value) return;
    setTextValue("");
    handleTranscript(value, "text");
  }

  // ---------------- 화면 ----------------
  const floorText = (f) => (f < 0 ? t("voice.loc.basementOption", { n: -f }) : t("voice.loc.floorOption", { n: f }));
  const locationLabel = (r) => (r.buildingName && Number.isInteger(r.floor) && r.floor !== 0 ? `${r.buildingName} ${floorText(r.floor)}` : r.zone);

  let micLabel = t("voice.mic.idle");
  if (status === "listening") micLabel = t("voice.mic.listening");
  else if (status === "stopping" || status === "saving") micLabel = t("voice.status.sending");

  let statusText = t("voice.status.idle");
  let statusKind = "";
  if (message) {
    statusText = t(message.key);
    statusKind = message.kind;
  } else if (!canRecord) statusText = t("voice.needLocation");
  else if (status === "listening") statusText = t("voice.status.listening");
  else if (status === "stopping" || status === "saving") statusText = t("voice.status.sending");

  const elemOptions = [...new Set([...reports.map((r) => r.elem).filter(Boolean), ...ELEM_SUGGESTIONS])];
  const shown = reports.slice(0, visible);
  const themeStyle = { "--vl": trade.color, "--vl-tint": `${trade.color}1c` };

  return (
    <div className="vl-page" data-testid="vl-page">
      <section className="card card-pad">
        <div className="vl-section-label">{t("voice.trade.label")}</div>
        <div className="vl-trades" role="group" aria-label={t("voice.trade.label")}>
          {VOICE_TRADES.map((tr) => (
            <button
              key={tr.id}
              type="button"
              className={`vl-trade${tr.id === tradeId ? " is-active" : ""}`}
              style={{ "--vl": tr.color, "--vl-tint": `${tr.color}1c` }}
              aria-pressed={tr.id === tradeId}
              disabled={busy}
              onClick={() => {
                setTradeId(tr.id);
                setResult(null);
                setMessage(null);
              }}
              data-testid={`vl-trade-${tr.id}`}
            >
              <span className="vl-trade-dot" />
              <span>{t(`voice.trade.${tr.id}`)}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="vl-grid">
        <section className="card vl-recorder" style={themeStyle} data-testid="vl-recorder" data-trade={trade.id}>
          <header className="vl-rec-head">
            <h2 data-testid="vl-title">{t(`voice.title.${trade.id}`)}</h2>
            <span className="vl-badge">{trade.badge}</span>
          </header>

          <div className="vl-rec-body">
            <div className="vl-loc">
              <div className="vl-loc-title">
                <Icon.Pin width="15" height="15" /> {t("voice.loc.title")}
              </div>
              {!building ? (
                <div className="vl-note" data-testid="vl-no-buildings">
                  {t("voice.loc.noBuildings")}
                </div>
              ) : (
                <div className="vl-loc-fields">
                  <div className="field">
                    <label htmlFor="vl-building">{t("voice.loc.building")}</label>
                    <select
                      id="vl-building"
                      className="input"
                      value={building.id}
                      disabled={busy}
                      onChange={(e) => setBuildingId(e.target.value)}
                      data-testid="vl-building"
                    >
                      {buildings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="vl-floor">{t("voice.loc.floor")}</label>
                    <select id="vl-floor" className="input" value={activeFloor} disabled={busy} onChange={(e) => setFloor(Number(e.target.value))} data-testid="vl-floor">
                      {floors.map((f) => (
                        <option key={f} value={f}>
                          {floorText(f)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field vl-elem">
                    <label htmlFor="vl-elem">{t("voice.loc.elem")}</label>
                    <input
                      id="vl-elem"
                      className="input"
                      list="vl-elem-list"
                      maxLength={VOICE_LIMITS.elem}
                      placeholder={t("voice.loc.elemPlaceholder")}
                      value={elem}
                      disabled={busy}
                      onChange={(e) => setElem(e.target.value)}
                      data-testid="vl-elem"
                    />
                    <datalist id="vl-elem-list">
                      {elemOptions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                </div>
              )}
            </div>

            <p className="vl-guide" data-testid="vl-guide">
              {t(`voice.guide.${trade.id}`)}
            </p>

            {!supported && (
              <div className="vl-note" data-testid="vl-unsupported">
                {t("voice.unsupported")}
              </div>
            )}

            <div className="vl-mic-wrap">
              <button
                type="button"
                className={`vl-mic${status === "listening" ? " is-listening" : ""}`}
                onClick={toggleMic}
                disabled={!supported || !canRecord || status === "stopping" || status === "saving"}
                aria-pressed={status === "listening"}
                data-testid="vl-mic"
              >
                <Icon.Mic width="40" height="40" />
                <span data-testid="vl-mic-text">{micLabel}</span>
              </button>
              <div className={`vl-status${statusKind ? ` is-${statusKind}` : ""}`} role="status" aria-live="polite" data-testid="vl-status">
                {statusText}
              </div>
              {/* 저장에 실패했을 때의 '다시 보내기'는 안내 문구 바로 아래에 둔다(휴대폰에서 결과 상자까지 스크롤하지 않아도 보이도록) */}
              {result && result.state === "error" && (
                <button type="button" className="btn btn-primary vl-retry" onClick={() => sendReport(result)} data-testid="vl-retry">
                  {t("voice.result.retry")}
                </button>
              )}
            </div>

            {result && (
              <div className={`vl-result${result.state === "error" ? " is-error" : ""}`} data-testid="vl-result">
                <h3>{t("voice.result.raw")}</h3>
                <div className="vl-result-raw" data-testid="vl-raw">
                  "{result.rawText}"
                </div>
                <div className="vl-result-sep" />
                <h3>{t("voice.result.summary")}</h3>
                <div className="vl-result-summary" data-testid="vl-summary">
                  {result.summary}
                </div>
                {result.state !== "error" && (
                  <div className="vl-result-foot">
                    {result.state === "saving" && <span className="vl-saving">{t("voice.status.sending")}</span>}
                    {result.state === "saved" && (
                      <span className="vl-saved" data-testid="vl-saved">
                        <Icon.Check width="14" height="14" /> {t("voice.result.saved")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="vl-text">
              {supported && (
                <button type="button" className="vl-text-toggle" onClick={() => setShowText((v) => !v)} aria-expanded={showText} data-testid="vl-text-toggle">
                  {t("voice.text.toggle")}
                </button>
              )}
              {showText && (
                <form className="vl-text-form" onSubmit={submitText}>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={VOICE_LIMITS.typedText}
                    placeholder={t("voice.text.placeholder")}
                    value={textValue}
                    disabled={!canRecord || busy}
                    onChange={(e) => setTextValue(e.target.value)}
                    data-testid="vl-text"
                  />
                  <button className="btn btn-primary" disabled={!canRecord || busy || !textValue.trim()} data-testid="vl-text-send">
                    {t("voice.text.send")}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>

        <section className="card vl-feed" data-testid="vl-feed">
          <div className="vl-feed-head">
            <div className="section-title">{t("voice.feed.title")}</div>
            <span className="vl-feed-count" data-testid="vl-feed-count">
              {t("voice.feed.count", { n: reports.length })}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadReports(zone)} disabled={!zone || feedState === "loading"} data-testid="vl-refresh">
              {t("voice.feed.refresh")}
            </button>
          </div>
          <div className="vl-feed-zone">{building ? `${building.name} ${floorText(activeFloor)}` : ""}</div>

          {feedState === "error" ? (
            <div className="vl-note" data-testid="vl-feed-error">
              {t("voice.feed.loadError")}
            </div>
          ) : feedState === "loading" && reports.length === 0 ? (
            <div className="vl-feed-loading">{t("voice.feed.loading")}</div>
          ) : reports.length === 0 ? (
            <EmptyState message={t("voice.feed.empty")} />
          ) : (
            <div className="vl-feed-list">
              {shown.map((r) => {
                const tr = VOICE_TRADES.find((x) => x.id === r.trade);
                return (
                  <article key={r.id} className="vl-card" style={{ "--vl": (tr || trade).color }} data-testid="vl-card">
                    <header className="vl-card-head">
                      {tr && <span className="vl-card-trade">{t(`voice.trade.${tr.id}`)}</span>}
                      <strong>{r.author || "-"}</strong>
                      {r.via === "text" && <span className="vl-card-via">{t("voice.card.viaText")}</span>}
                      <time className="vl-card-time">{formatDateTime(r.createdAt)}</time>
                    </header>
                    <div className="vl-card-loc">
                      <Icon.Pin width="13" height="13" /> {locationLabel(r)} · {r.elem}
                    </div>
                    <div className="vl-card-raw">"{r.rawText}"</div>
                    <div className="vl-card-summary">{r.summary}</div>
                  </article>
                );
              })}
              {reports.length > visible && (
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setVisible((v) => v + PAGE_SIZE)} data-testid="vl-more">
                  {t("voice.feed.more")}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
