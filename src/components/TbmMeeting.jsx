import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./UI.jsx";
import FoldToggle, { useFolded } from "./FoldToggle.jsx";
import TbmFieldsEditor from "./TbmFields.jsx";
import * as api from "../api.js";
import { getSpeechRecognition } from "../voice.js";
import { createLongRecognizer, appendTranscript, clockHM, longSpeechErrorText, longSpeechStopText, LONG_SPEECH_LIMITS } from "../longSpeech.js";
import { summarizeTbm, hasTbmFields, TBM_EXAMPLE, TBM_EXAMPLE_TEXT, TBM_TEXT_MAX } from "../paperwork/tbmSummary.js";
import { fieldsForEdit, hashText, emptyDraft, loadTbmDraft, saveTbmDraft, clearTbmDraft, purgeOldTbmDrafts, isEmptyDraft, isUnsavedDraft, draftSig } from "../paperwork/tbmDraft.js";
import { dayKeyOf, longDate, hhmm } from "../paperwork/dayTools.js";

// TBM(작업 전 안전점검회의) 회의 녹음 화면 - 공종별 QR을 스캔해 들어간 하도급사 화면에서 '작업 보고' 옆의 'TBM 회의'로 열린다(VoiceInspection.jsx의 기록 종류 전환).
//   1) 회의를 말하면(약 5분, 최대 20분) 글로 받아 적고  2) 규칙으로 읽어 일지의 칸별 값으로 나누고  3) 사람이 칸마다 확인·고친 뒤  4) '서버에 저장'을 누른다.
// 저장한 회의는 사무실 PC의 서류 탭(Paperwork.jsx · TbmPicker.jsx)에서 그 날의 회의로 나타나 TBM 일지(.docx)의 칸을 채운다.
// 말을 글로 바꾸는 일은 휴대폰 브라우저의 음성 인식이 하고, 글을 칸으로 나누는 일은 이 브라우저 안에서 규칙으로 한다(인공지능 서비스에 보내지 않는다).
// 사람이 하는 일을 대신하는 요약이 아니라 "말한 낱말을 칸에 나누어 적는" 정도라서, 못 찾은 칸은 비워 두고 알리며 모든 칸은 저장하기 전에 고칠 수 있다.
// 녹음한 소리는 저장하지 않는다. 서버에 올라가는 것은 받아 적은 글과 칸 값뿐이다.
// 받아 적은 글과 칸 값(draft)은 고칠 때마다 이 기기에 날짜별로 임시로 남아(paperwork/tbmDraft.js), 서버에 저장하기 전에 화면을 닫아도 그 날 다시 열면 이어진다.

const MIN_AUTO_CHARS = 30; // 공백을 뺀 글자 수가 이보다 짧으면 칸을 자동으로 채우지 않는다
const FLUSH_MS = 3000; // 녹음하는 동안 받아 적은 글을 임시 저장하는 간격
const LIVE_TAIL = 500; // 녹음 중 화면에 보여 주는 글의 끝부분 글자 수
const MAX_MINUTES = Math.round(LONG_SPEECH_LIMITS.maxMs / 60000);

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const nonBlank = (s) => String(s || "").replace(/\s+/g, "").length;

// 서버에 저장하지 못했을 때 알려 주는 글(내용은 이 휴대폰에 남아 있다는 말을 늘 곁들인다)
export function saveErrorText(e) {
  const keep = "내용은 이 휴대폰에 남아 있어요.";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return `인터넷에 연결되어 있지 않아 저장하지 못했어요. 연결된 곳에서 다시 눌러 주세요. ${keep}`;
  if (e && e.code === "tbm/timeout") return `연결이 느려서 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요. ${keep}`;
  if (e && e.code === "permission-denied") return `서버가 저장을 허락하지 않았어요. 관리자에게 알려 주세요. ${keep}`;
  return `저장하지 못했어요. 잠시 뒤 다시 눌러 주세요. ${keep}`;
}

// props
//   trade        { id, badge, color } - 이 QR의 공종(VoiceInspection의 getTrade 결과)
//   themeStyle   공종 색 CSS 변수(--vl, --vl-tint)
//   tradeId      회의에 적어 둘 공종 id   author  화면에 적은 이름(선택)   nameSlot  이름 입력 칸(작업 보고 화면과 같은 칸)
//   onBusyChange(true|false)  녹음하거나 저장하는 동안은 부모가 '작업 보고'로 바꾸는 것을 막는다
//   notify(msg)  화면 아래 알림
export default function TbmMeeting({ trade, themeStyle, tradeId, author = "", nameSlot = null, onBusyChange, notify }) {
  const supported = useMemo(() => !!getSpeechRecognition(), []);
  const dayKey = useMemo(() => dayKeyOf(), []); // 이 화면을 연 날 = 회의를 한 날
  const [draft, setDraft] = useState(() => loadTbmDraft(dayKey));
  const [snap, setSnap] = useState(null); // 녹음기의 마지막 상태(녹음 중이거나 방금 끝났을 때)
  const [recording, setRecording] = useState(false);
  const [info, setInfo] = useState(""); // 녹음·요약 뒤의 안내 글
  const [confirm, setConfirm] = useState(""); // "" | "resummary" | "reset"
  const [manual, setManual] = useState(false); // 녹음 없이 칸을 직접 적겠다고 연 것
  const [editKey, setEditKey] = useState(0); // 새로 요약하거나 새 회의를 시작하면 칸별 확인 영역을 다시 펼친다
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [saveState, setSaveState] = useState("idle"); // idle | saving | error
  const [saveMsg, setSaveMsg] = useState("");
  const [guideFolded, toggleGuide] = useFolded("tbm-guide");

  const recRef = useRef(null);
  const baseRef = useRef(""); // 이번 녹음을 시작할 때 이미 있던 글
  const draftRef = useRef(draft);
  const snapRef = useRef(null);
  const liveRef = useRef(null);
  const savingRef = useRef(false);
  const latest = useRef({});
  latest.current = { onBusyChange, notify, author, tradeId };

  const listening = !!snap && snap.state !== "idle";
  const saving = saveState === "saving";
  const fields = draft.fields;
  const filled = hasTbmFields(fields);
  const showEditor = draft.summarized || filled || manual;
  const stale = draft.summarized && hashText(draft.text) !== draft.sumHash;
  const hasContent = !isEmptyDraft(draft);
  const unsaved = isUnsavedDraft(draft);
  const savedOk = hasContent && !unsaved && draft.savedAt > 0;

  // 초안 고치기: patch는 객체이거나, 이전 초안을 받아 patch를 돌려주는 함수. 바꾼 즉시 이 기기에 남긴다.
  const updateDraft = useCallback(
    (patch) => {
      const prev = draftRef.current;
      const part = typeof patch === "function" ? patch(prev) : patch;
      if (!part || Object.keys(part).length === 0) return;
      const next = { ...prev, ...part };
      draftRef.current = next;
      setDraft(next);
      saveTbmDraft(dayKey, next);
    },
    [dayKey]
  );

  useEffect(() => {
    purgeOldTbmDrafts(dayKey);
  }, [dayKey]);

  // 녹음하거나 서버에 저장하는 동안은 부모가 화면 종류를 바꾸지 못하게 알린다
  const busy = recording || saving;
  useEffect(() => {
    if (latest.current.onBusyChange) latest.current.onBusyChange(busy);
  }, [busy]);
  useEffect(
    () => () => {
      if (latest.current.onBusyChange) latest.current.onBusyChange(false);
    },
    []
  );

  // ---------------------------------------------------------------- 녹음
  const finish = (s) => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    rec.dispose();
    const d = draftRef.current;
    const heard = nonBlank(s.text);
    const notes = [];
    const err = longSpeechErrorText(s.error);
    if (err) notes.push(err);
    const why = longSpeechStopText(s.reason);
    if (why) notes.push(why);
    if (s.gaps > 0) notes.push(`화면이 가려져 놓친 말이 있을 수 있어요(${s.gaps}번).`);
    if (heard === 0) {
      if (!err) notes.push("받아 적은 말이 없어요. 마이크를 확인하고 다시 눌러 주세요.");
    } else {
      const combined = appendTranscript(baseRef.current, s.text).slice(0, TBM_TEXT_MAX);
      const from = d.fields.from || (s.startedAt ? clockHM(s.startedAt) : "");
      const to = s.endedAt ? clockHM(s.endedAt) : d.fields.to;
      if (nonBlank(combined) < MIN_AUTO_CHARS) {
        notes.push("받아 적은 글이 짧아서 칸은 채우지 않았어요. 더 녹음하거나 글을 고친 뒤 '이 글로 칸 채우기'를 눌러 주세요.");
        updateDraft({ text: combined, fields: { ...d.fields, from, to } });
      } else if (d.edited) {
        notes.push("직접 고친 칸이 있어서 칸은 그대로 두었어요. 새로 받아 적은 글로 다시 채우려면 '다시 요약'을 눌러 주세요.");
        updateDraft({ text: combined, fields: { ...d.fields, from, to } });
      } else {
        const r = summarizeTbm(combined, { from, to });
        updateDraft({ text: combined, fields: fieldsForEdit(r.fields), summarized: true, edited: false, sumHash: hashText(combined) });
        setEditKey((k) => k + 1);
        notes.push("받아 적은 글을 읽어 칸을 채웠어요. 아래에서 확인하고 고친 뒤 맨 아래 '서버에 저장'을 눌러 주세요.");
      }
    }
    setInfo(notes.join(" "));
    setSnap(s);
    setRecording(false);
  };

  const handleSnap = (s) => {
    snapRef.current = s;
    setSnap(s);
    if (s.state === "idle") finish(s);
  };

  const start = () => {
    if (recRef.current || !supported || savingRef.current) return;
    const d = draftRef.current;
    const room = TBM_TEXT_MAX - d.text.length;
    if (room < 500) {
      setInfo("받아 적은 글이 가득 차서 더 녹음할 수 없어요. 글을 정리하거나 '처음부터 다시'를 눌러 주세요.");
      return;
    }
    setInfo("");
    setConfirm("");
    baseRef.current = d.text;
    const rec = createLongRecognizer({ maxChars: Math.min(LONG_SPEECH_LIMITS.maxChars, room - 1), onChange: handleSnap });
    recRef.current = rec;
    setRecording(true);
    if (!rec.start()) {
      // 시작하지 못했다: 이유는 snapshot의 error에 있다
      const s = rec.snapshot();
      recRef.current = null;
      rec.dispose();
      setInfo(longSpeechErrorText(s.error) || longSpeechErrorText("start-failed"));
      setRecording(false);
    }
  };

  const stop = () => {
    const rec = recRef.current;
    if (rec) rec.stop();
  };

  // 녹음하는 동안 받아 적은 글을 주기적으로 임시 저장한다(브라우저가 갑자기 닫혀도 대부분 남게)
  useEffect(() => {
    if (!listening) return undefined;
    const id = setInterval(() => {
      const s = snapRef.current;
      if (!s || s.state === "idle" || !recRef.current) return;
      const text = appendTranscript(baseRef.current, s.text).slice(0, TBM_TEXT_MAX);
      if (text !== draftRef.current.text) updateDraft({ text });
    }, FLUSH_MS);
    return () => clearInterval(id);
  }, [listening, updateDraft]);

  // 흐른 시간 표시
  useEffect(() => {
    if (!listening) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [listening]);

  // 녹음 중 글이 늘어나면 맨 아래가 보이게
  useEffect(() => {
    const el = liveRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snap]);

  // 화면을 떠날 때: 녹음 중이었다면 지금까지의 글을 남기고 정리한다
  useEffect(
    () => () => {
      const rec = recRef.current;
      if (!rec) return;
      recRef.current = null;
      const s = rec.snapshot();
      rec.dispose();
      try {
        const text = appendTranscript(baseRef.current, appendTranscript(s.text, s.interim)).slice(0, TBM_TEXT_MAX);
        const prev = draftRef.current;
        saveTbmDraft(dayKey, { ...prev, text });
      } catch {
        // 남기지 못해도 화면은 닫힌다
      }
    },
    [dayKey]
  );

  // ---------------------------------------------------------------- 요약 · 고치기
  const doSummary = () => {
    const d = draftRef.current;
    const r = summarizeTbm(d.text, { from: d.fields.from, to: d.fields.to });
    updateDraft({ fields: fieldsForEdit(r.fields), summarized: true, edited: false, sumHash: hashText(d.text) });
    setEditKey((k) => k + 1);
    setConfirm("");
    setInfo(r.stats.sentences === 0 ? "읽을 글이 없어요." : "받아 적은 글을 읽어 칸을 채웠어요. 아래에서 확인하고 고친 뒤 맨 아래 '서버에 저장'을 눌러 주세요.");
  };
  const askSummary = () => {
    if (draft.edited) setConfirm("resummary");
    else doSummary();
  };
  const tryExample = () => {
    const r = summarizeTbm(TBM_EXAMPLE_TEXT);
    updateDraft({ text: TBM_EXAMPLE_TEXT, fields: fieldsForEdit(r.fields), summarized: true, edited: false, sumHash: hashText(TBM_EXAMPLE_TEXT) });
    setEditKey((k) => k + 1);
    setInfo("예문으로 채워 본 시험 내용이에요. 실제 회의를 저장하려면 '처음부터 다시'로 지우고 회의를 녹음해 주세요.");
  };
  // 이 휴대폰의 초안을 비운다(서버에 이미 저장한 회의는 그대로 둔다). 다음 저장은 새 회의가 된다.
  const clearAll = () => {
    const next = emptyDraft();
    draftRef.current = next;
    setDraft(next);
    clearTbmDraft(dayKey);
    setConfirm("");
    setInfo("");
    setManual(false);
    setSnap(null);
    setSaveState("idle");
    setSaveMsg("");
    setEditKey((k) => k + 1);
  };

  const onFields = (update) => updateDraft((d) => ({ fields: update(d.fields), edited: true }));

  // ---------------------------------------------------------------- 서버에 저장
  const save = async () => {
    if (savingRef.current || recRef.current) return;
    const d = draftRef.current;
    if (isEmptyDraft(d)) return;
    // 문서 번호와 처음 저장한 때를 먼저 초안에 적어 둔다: 저장이 느려 다시 눌러도 같은 문서에 쓰므로 회의가 둘로 갈라지지 않는다.
    const id = d.meetingId || api.newTbmMeetingId();
    const createdMs = d.createdMs || Date.now();
    if (d.meetingId !== id || d.createdMs !== createdMs) updateDraft({ meetingId: id, createdMs });
    const sig = draftSig(d); // 지금 저장하는 내용(저장하는 동안 더 고치면 '저장 안 한 변경'으로 남는다)
    savingRef.current = true;
    setSaveState("saving");
    setSaveMsg("");
    try {
      await api.saveTbmMeeting({
        id,
        dayKey,
        trade: latest.current.tradeId,
        author: latest.current.author,
        fields: d.fields,
        text: d.text,
        summarized: d.summarized,
        edited: d.edited,
        createdMs,
      });
      updateDraft({ savedAt: Date.now(), savedSig: sig });
      setSaveState("idle");
      setInfo("서버에 저장했어요. 사무실 PC의 서류 탭에서 이 날짜의 TBM 회의로 골라 일지를 만들 수 있어요.");
      if (latest.current.notify) latest.current.notify("TBM 회의를 서버에 저장했어요.");
    } catch (e) {
      setSaveState("error");
      setSaveMsg(saveErrorText(e));
    } finally {
      savingRef.current = false;
    }
  };

  // ---------------------------------------------------------------- 화면
  const finalPart = listening && snap ? appendTranscript(baseRef.current, snap.text) : "";
  const tail = finalPart.length > LIVE_TAIL ? `…${finalPart.slice(-LIVE_TAIL)}` : finalPart;
  const heardChars = listening && snap ? nonBlank(snap.text) : 0;
  const elapsed = listening && snap ? nowMs - snap.startedAt : 0;
  const isExample = draft.text === TBM_EXAMPLE_TEXT;
  const summaryLabel = !draft.summarized ? "이 글로 칸 채우기" : stale ? "글이 바뀌었어요 · 칸 다시 채우기" : "다시 요약";
  const micText = listening ? (snap.state === "stopping" ? "마무리하는 중…" : "녹음 끝내기") : draft.text.trim() ? "이어서 녹음하기" : "회의 녹음 시작";
  const saveLabel = saving ? "저장하는 중…" : savedOk ? "저장 완료" : draft.savedAt ? "고친 내용 저장" : "서버에 저장";
  let saveStateText = "아직 서버에 저장하지 않았어요. 저장해야 사무실 서류 탭에서 이 회의를 쓸 수 있어요.";
  if (saving) saveStateText = "서버에 저장하는 중이에요…";
  else if (saveState === "error") saveStateText = saveMsg;
  else if (savedOk) saveStateText = `서버에 저장했어요 (${hhmm(draft.savedAt)}). 사무실 서류 탭에서 이 회의를 쓸 수 있어요.`;
  else if (draft.savedAt) saveStateText = "저장한 뒤에 고친 내용이 있어요. 다시 저장해야 사무실에 반영돼요.";

  return (
    <section className="card vl-recorder tbm-qr" style={themeStyle} data-testid="tbm-meeting" data-trade={trade.id} aria-label="TBM 회의 녹음">
      <header className="vl-rec-head">
        <h2 data-testid="tbm-title">TBM 회의 녹음</h2>
        <span className="vl-badge">{trade.badge}</span>
      </header>

      <div className="vl-rec-body tbm-meet">
        <p className="tbm-sub">
          약 5분 길이의 회의를 그대로 말하면 글로 받아 적고, 일지의 알맞은 칸에 나눠 넣어요. 한 번에 최대 {MAX_MINUTES}분까지 받아 적어요. {longDate(dayKey)} 회의로 저장돼요.
        </p>

        {nameSlot}

        {/* ---- 녹음 ---- */}
        {!supported && (
          <div className="tbm-alert" role="status" data-testid="tbm-unsupported">
            {longSpeechErrorText("unsupported")}
          </div>
        )}
        <div className="vl-mic-wrap">
          <button
            type="button"
            className={`vl-mic${listening ? " is-listening" : ""}`}
            onClick={listening ? stop : start}
            disabled={!supported || saving || (listening && snap.state === "stopping")}
            aria-pressed={listening}
            data-testid="tbm-mic"
          >
            <Icon.Mic width="40" height="40" />
            <span data-testid="tbm-mic-text">{micText}</span>
          </button>
          {listening && (
            <span className="tbm-timer" data-testid="tbm-timer" aria-label="녹음한 시간">
              <span className="tbm-dot" aria-hidden="true" />
              {mmss(elapsed)}
            </span>
          )}
        </div>
        <div className="tbm-rec">
          <p className="tbm-hint">
            {listening
              ? snap.wake
                ? "화면이 꺼지지 않게 해 뒀어요. 마이크 가까이에서 평소 속도로 말해 주세요."
                : "화면을 끄거나 다른 앱으로 가면 그동안의 말은 받아 적지 못해요. 화면을 켜 두고 말해 주세요."
              : "조용한 곳에서 마이크 가까이 대고, 회의 내내 화면을 켜 둬요. 다시 녹음하면 아래 글 뒤에 이어 붙어요."}
          </p>
          {listening && (
            <div className="tbm-live" ref={liveRef} data-testid="tbm-live" aria-live="off">
              {tail || snap.interim ? (
                <>
                  {tail}
                  {snap.interim && (
                    <span className="tbm-interim">
                      {tail ? " " : ""}
                      {snap.interim}
                    </span>
                  )}
                </>
              ) : (
                <span className="tbm-live-wait">듣고 있어요… 말씀해 주세요.</span>
              )}
            </div>
          )}
          {listening && (
            <div className="tbm-meter" data-testid="tbm-meter">
              받아 적은 글 {heardChars.toLocaleString()}자{snap.gaps > 0 ? ` · 놓쳤을 수 있는 구간 ${snap.gaps}번` : ""}
            </div>
          )}
          <div className="tbm-status" role="status" aria-live="polite" data-testid="tbm-status">
            {info}
          </div>
        </div>

        {/* ---- 말하기 안내 ---- */}
        <div className="tbm-guide" data-testid="tbm-guide">
          <div className="tbm-guide-head">
            <span className="tbm-guide-title">이 순서로 말하면 칸이 잘 채워져요</span>
            <FoldToggle folded={guideFolded} onToggle={toggleGuide} label="말하기 안내" controls="tbm-guide-body" testId="tbm-guide-fold" />
          </div>
          {!guideFolded && (
            <div id="tbm-guide-body">
              <ol className="tbm-guide-list">
                {TBM_EXAMPLE.map((p) => (
                  <li key={p.no}>
                    <span className="tbm-no">{p.no}</span>
                    <div className="tbm-guide-main">
                      <div className="tbm-chips">
                        {p.fills.map((f) => (
                          <span key={f} className="tbm-chip">
                            {f}
                          </span>
                        ))}
                      </div>
                      <p className="tbm-eg">{p.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="tbm-tip">
                예문을 그대로 읽을 필요는 없어요. 위험요인은 "첫 번째 위험요인은 …, 대책은 …"처럼 번호를 붙여 말하고, 말하지 않은 칸은 만들어 넣지 않고 비워 둬요.
              </p>
            </div>
          )}
        </div>

        {/* ---- 받아 적은 글 ---- */}
        {!listening && (
          <div className="tbm-text-block">
            <div className="tbm-label-row">
              <label htmlFor="tbm-text" className="tbm-label">
                받아 적은 글
              </label>
              <span className="tbm-count" data-testid="tbm-count">
                {draft.text.length.toLocaleString()}자
              </span>
            </div>
            <textarea
              id="tbm-text"
              className="input tbm-text"
              rows={6}
              maxLength={TBM_TEXT_MAX}
              value={draft.text}
              placeholder="녹음하면 여기에 글이 쌓여요. 직접 쓰거나, 휴대폰 키보드의 마이크(받아쓰기)로 말하거나, 다른 곳에서 복사해 붙여 넣어도 돼요."
              onChange={(e) => updateDraft({ text: e.target.value })}
              data-testid="tbm-text"
            />
            {isExample && (
              <div className="tbm-alert" data-testid="tbm-example-note">
                예문으로 채운 시험 내용이에요. 실제 회의로 저장하지 마세요.
              </div>
            )}
            <div className="tbm-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={askSummary} disabled={!draft.text.trim()} data-testid="tbm-summarize">
                {summaryLabel}
              </button>
              {!draft.text.trim() && !filled && !draft.summarized && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={tryExample} data-testid="tbm-example">
                  예문으로 시험해 보기
                </button>
              )}
              {!showEditor && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(true)} data-testid="tbm-manual">
                  칸을 직접 적기
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm("reset")} disabled={!hasContent && !manual} data-testid="tbm-reset">
                처음부터 다시
              </button>
            </div>
            {confirm === "resummary" && (
              <div className="tbm-confirm" role="group" aria-label="다시 요약할지 묻기" data-testid="tbm-confirm-resummary">
                <span>직접 고친 칸이 사라지고 글을 다시 읽은 값으로 바뀌어요. 그래도 다시 요약할까요?</span>
                <span className="tbm-confirm-btns">
                  <button type="button" className="btn btn-primary btn-sm" onClick={doSummary} data-testid="tbm-confirm-yes">
                    다시 요약
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm("")} data-testid="tbm-confirm-no">
                    취소
                  </button>
                </span>
              </div>
            )}
            {confirm === "reset" && (
              <div className="tbm-confirm" role="group" aria-label="처음부터 다시 할지 묻기" data-testid="tbm-confirm-reset">
                <span>
                  받아 적은 글과 칸에 넣은 내용을 이 휴대폰에서 모두 지워요.{draft.savedAt ? " 서버에 이미 저장한 회의는 그대로 남아요." : ""} 그래도 지울까요?
                </span>
                <span className="tbm-confirm-btns">
                  <button type="button" className="btn btn-fail btn-sm" onClick={clearAll} data-testid="tbm-reset-yes">
                    모두 지우기
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm("")} data-testid="tbm-reset-no">
                    취소
                  </button>
                </span>
              </div>
            )}
            <p className="tbm-local">서버에 저장하기 전까지 받아 적은 글과 고친 칸은 이 휴대폰에만 임시로 남아요. 녹음한 소리는 저장하지 않고, 받아 적은 글과 칸만 서버에 올라가요.</p>
          </div>
        )}

        {/* ---- 칸별 확인 · 고치기 ---- */}
        {!listening && showEditor && <TbmFieldsEditor key={editKey} fields={fields} onFields={onFields} summarized={draft.summarized} />}

        {/* ---- 서버에 저장 ---- */}
        {!listening && hasContent && (
          <div className={`tbm-save${savedOk ? " is-saved" : ""}${saveState === "error" ? " is-error" : ""}`} data-testid="tbm-save-bar">
            <div className="tbm-save-state" role="status" aria-live="polite" data-testid="tbm-save-state">
              {saveStateText}
            </div>
            <div className="tbm-save-btns">
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving || savedOk} data-testid="tbm-save">
                {saveLabel}
              </button>
              {savedOk && (
                <button type="button" className="btn btn-ghost" onClick={clearAll} data-testid="tbm-new">
                  새 회의 시작
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
