import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api.js";
import { GLOSSARY_MESSAGES, checkTerm } from "../voice.js";
import {
  SAMPLE_ACCEPT,
  SAMPLE_LIMITS,
  SAMPLE_MESSAGES,
  checkSampleFile,
  cleanSampleName,
  fillLabels,
  formatBytes,
  formatDuration,
  judgeHeard,
  sampleMime,
  splitSpeech,
  summarizeResults,
  toSegments,
} from "../audioSamples.js";
import {
  MIN_CHROME_FOR_TRACK,
  RECOGNITION_ERROR_TEXT,
  audioSupported,
  closeAudioContext,
  createAudioContext,
  decodeAudio,
  isFatalRecognitionError,
  playSegment,
  resumeAudioContext,
  startRecognition,
  trackRecognitionSupported,
} from "../sampleRecognizer.js";

// 관리자 "용어 DB" 탭의 "음성 샘플로 인식 점검하기" 카드.
// 현장 은어·사투리를 말해서 녹음한 파일을 최대 5개까지 올려 두면, 말 구간을 쉬는 곳 기준으로 나누고 →
// 구간마다 관리자가 "정답(그 구간에서 말한 표준 용어)"을 적고 → 크롬 음성 인식이 그 구간을 어떻게 듣는지 확인해서 →
// 잘못 들린 말은 "이렇게 들리면 이 말"로 용어 표에 바로 등록한다. (음성 인식 자체를 학습시키는 기능은 아니다 - 표를 채우고 점검하는 기능이다)
// 관리자 화면은 한국어만 쓰므로 문구를 번역 사전(i18n)이 아니라 여기에 바로 적었다.
// props: terms(지금 용어 표), adminName, busy/setBusy(다른 저장과 겹치지 않게 부모와 함께 쓰는 표시), onTermAdded(저장된 최신 표), notify

function errorText(err) {
  const code = err && err.code ? String(err.code) : "";
  if (code === "sample/timeout" || code === "glossary/timeout") return "저장이 오래 걸려 멈췄어요. 연결을 확인하고 다시 시도해 주세요.";
  if (code.startsWith("sample/") && SAMPLE_MESSAGES[code.slice(7)]) return SAMPLE_MESSAGES[code.slice(7)];
  if (code.startsWith("glossary/") && err.message) return err.message;
  return "처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
}

function termMessage(check) {
  if (check.code === "duplicate" && check.existing) {
    return `이미 표에 있는 은어예요 (${check.existing.slang} → ${check.existing.standard}). 아래 용어 표에서 그 줄을 고쳐 주세요.`;
  }
  return GLOSSARY_MESSAGES[check.code] || "입력한 값을 확인해 주세요.";
}

function shortHint(value) {
  return Array.from(String(value || "").replace(/\s+/g, "")).length === 1;
}

const BADGE = { idle: "점검 전", pass: "맞음", near: "후보에 있음", fail: "못 맞춤", nolabel: "정답 필요", none: "들은 말 없음" };
const SILENCE_CHOICES = [
  { value: "0.4", label: "짧게 (0.4초)" },
  { value: "0.7", label: "보통 (0.7초)" },
  { value: "1.2", label: "길게 (1.2초)" },
];

function segKey(list) {
  return JSON.stringify((list || []).map((s) => [s.id, s.start, s.end, s.label]));
}

function seconds(v) {
  return `${(Math.round(v * 10) / 10).toFixed(1)}`;
}

// ====================================================================================================================
// 녹음 하나를 열었을 때: 소리를 불러와서 구간 목록, 정답 적기, 크롬 인식 점검, 용어 등록을 보여 준다.
function SamplePanel({ sample, terms, adminName, supported, busy, setBusy, onSaved, onGone, onTermAdded, notify }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [segs, setSegs] = useState(() => sample.segments);
  const [results, setResults] = useState({}); // { [구간 id]: { alternatives: [{ text, confidence }], error } } - 이 화면에서만 들고 있는 점검 결과
  const [run, setRun] = useState({ running: false, done: 0, total: 0, fatal: "" });
  const [playingId, setPlayingId] = useState("");
  const [silence, setSilence] = useState("0.7");
  const [askResplit, setAskResplit] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [listText, setListText] = useState("");
  const [listMsg, setListMsg] = useState("");
  const [reg, setReg] = useState(null); // 용어 표에 등록하려고 열어 둔 입력칸 { segId, slang, standard, error, saving }
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const mounted = useRef(true);
  const ctxRef = useRef(null);
  const audioRef = useRef(null);
  const playRef = useRef(null);
  const recRef = useRef(null);
  const stopRun = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 소리 불러오기: 저장된 조각들을 읽어 이어 붙이고 → 열어서 재생·인식에 쓸 수 있는 소리로 만든다.
  useEffect(() => {
    let live = true;
    let ctx = null;
    setStatus("loading");
    setLoadError("");
    (async () => {
      try {
        ctx = createAudioContext();
        ctxRef.current = ctx;
        const bytes = await api.fetchGlossarySampleAudio(sample);
        const audio = await decodeAudio(ctx, bytes);
        if (!live) return;
        audioRef.current = audio;
        setStatus("ready");
      } catch (err) {
        if (!live) return;
        setLoadError(errorText(err));
        setStatus("error");
        if (err && err.code === "sample/not-found") onGone();
      }
    })();
    return () => {
      live = false;
      stopRun.current = true;
      if (playRef.current) playRef.current.stop();
      if (recRef.current) recRef.current.cancel();
      playRef.current = null;
      recRef.current = null;
      audioRef.current = null;
      closeAudioContext(ctx);
    };
    // sample 객체는 정답을 저장할 때마다 바뀌지만 소리는 그대로이므로 id만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample.id, attempt]);

  const judged = useMemo(() => {
    const out = {};
    for (const s of segs) out[s.id] = results[s.id] ? judgeHeard(results[s.id].alternatives, s.label, terms) : null;
    return out;
  }, [segs, results, terms]);
  const summary = useMemo(() => summarizeResults(segs, results, terms), [segs, results, terms]);
  const score = useMemo(() => {
    let pass = 0;
    let scored = 0;
    for (const s of segs) {
      if (!results[s.id] || !s.label) continue;
      scored += 1;
      if (judged[s.id] && judged[s.id].status === "pass") pass += 1;
    }
    return { pass, scored };
  }, [segs, results, judged]);
  const dirty = segKey(segs) !== segKey(sample.segments);
  const labeled = segs.filter((s) => s.label).length;
  const standards = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const t of terms) {
      if (seen.has(t.standard)) continue;
      seen.add(t.standard);
      out.push(t.standard);
    }
    return out.slice(0, 500);
  }, [terms]);
  const listId = `gs-standards-${sample.id}`;

  // ---------------- 듣기 ----------------
  function stopPlay() {
    if (playRef.current) {
      playRef.current.stop();
      playRef.current = null;
    }
    setPlayingId("");
  }

  function play(seg) {
    const audio = audioRef.current;
    const ctx = ctxRef.current;
    if (!audio || !ctx || run.running) return;
    if (playingId === seg.id) {
      stopPlay();
      return;
    }
    stopPlay();
    resumeAudioContext(ctx);
    setPlayingId(seg.id);
    playRef.current = playSegment(ctx, audio.buffer, seg.start, seg.end, () => {
      playRef.current = null;
      if (mounted.current) setPlayingId("");
    });
  }

  // ---------------- 크롬 인식 점검 ----------------
  // 구간을 하나씩 실제 속도로 인식기에 넣는다(구간마다 몇 초씩 걸린다). only를 주면 그 구간만 다시 점검한다.
  async function runChecks(only) {
    const audio = audioRef.current;
    const ctx = ctxRef.current;
    if (!audio || !ctx || !supported || run.running) return;
    const list = only ? [only] : segs;
    if (list.length === 0) return;
    stopPlay();
    stopRun.current = false;
    setReg(null);
    setMsg("");
    setRun({ running: true, done: 0, total: list.length, fatal: "" });
    await resumeAudioContext(ctx);
    let done = 0;
    for (const seg of list) {
      if (stopRun.current || !mounted.current) break;
      const handle = startRecognition(ctx, audio.buffer, seg.start, seg.end);
      recRef.current = handle;
      const res = await handle.promise;
      recRef.current = null;
      if (!mounted.current) return;
      if (res.cancelled) break;
      if (isFatalRecognitionError(res.error) || res.error === "start-failed") {
        setRun({ running: false, done, total: list.length, fatal: RECOGNITION_ERROR_TEXT[res.error] || "음성 인식을 쓸 수 없어요." });
        return;
      }
      done += 1;
      setResults((prev) => ({ ...prev, [seg.id]: { alternatives: res.alternatives, error: res.error } }));
      setRun({ running: true, done, total: list.length, fatal: "" });
    }
    setRun({ running: false, done, total: list.length, fatal: "" });
  }

  function stopChecks() {
    stopRun.current = true;
    if (recRef.current) recRef.current.cancel();
  }

  // ---------------- 정답 적기·저장 ----------------
  function setLabel(id, value) {
    setSegs((prev) => prev.map((s) => (s.id === id ? { ...s, label: value } : s)));
    setMsg("");
  }

  function applyList() {
    const res = fillLabels(segs, listText);
    setSegs(res.segments);
    const bits = [`${res.filled}개 구간에 정답을 채웠어요`];
    if (res.extra) bits.push(`목록이 구간보다 ${res.extra}줄 많아요`);
    if (res.missing) bits.push(`정답이 없는 구간 ${res.missing}개`);
    setListMsg(bits.join(" · "));
    setMsg("");
  }

  async function saveSegments() {
    if (saving || !dirty) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await api.saveGlossarySampleSegments(sample.id, segs, adminName);
      if (!mounted.current) return;
      onSaved(res.samples);
      notify("정답을 저장했습니다");
    } catch (err) {
      if (!mounted.current) return;
      setMsg(errorText(err));
      if (err && err.code === "sample/not-found") onGone();
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  // ---------------- 구간 다시 나누기 ----------------
  function resplit() {
    const audio = audioRef.current;
    if (!audio || run.running) return;
    const ranges = splitSpeech(audio.samples, audio.sampleRate, { minSilence: Number(silence) });
    if (ranges.length === 0) {
      setMsg(SAMPLE_MESSAGES.silent);
      return;
    }
    if (ranges.length > SAMPLE_LIMITS.maxSegments) {
      setMsg(SAMPLE_MESSAGES["too-many"]);
      return;
    }
    stopPlay();
    setSegs(toSegments(ranges));
    setResults({});
    setReg(null);
    setListMsg("");
    setAskResplit(false);
    setMsg(`구간을 ${ranges.length}개로 다시 나눴어요. ‘정답 저장’을 눌러야 저장돼요.`);
  }

  function askOrResplit() {
    if (labeled > 0 || Object.keys(results).length > 0) setAskResplit(true);
    else resplit();
  }

  // ---------------- 용어 표에 등록 ----------------
  function openReg(seg, slang) {
    const r = results[seg.id];
    const first = r && r.alternatives[0] ? r.alternatives[0].text : "";
    setReg({ segId: seg.id, slang: slang !== undefined ? slang : first, standard: seg.label, error: "", saving: false });
  }

  async function submitReg(e) {
    e.preventDefault();
    if (!reg || reg.saving || busy) return;
    const check = checkTerm({ slang: reg.slang, standard: reg.standard }, terms);
    if (check.code !== "ok") {
      setReg({ ...reg, error: termMessage(check) });
      return;
    }
    const segId = reg.segId;
    setReg({ ...reg, saving: true, error: "" });
    setBusy("sample");
    try {
      const res = await api.addGlossaryTerm({ slang: reg.slang, standard: reg.standard }, adminName);
      if (!mounted.current) return;
      onTermAdded(res.terms, res.term);
      // 정답을 아직 안 적은 구간이면 방금 등록한 표준 용어를 정답으로 채워 준다
      setSegs((prev) => prev.map((s) => (s.id === segId && !s.label ? { ...s, label: res.term.standard } : s)));
      setReg(null);
      notify(`용어를 추가했습니다: ${res.term.slang} → ${res.term.standard}`);
    } catch (err) {
      if (!mounted.current) return;
      setReg((cur) => (cur ? { ...cur, saving: false, error: errorText(err) } : cur));
    } finally {
      setBusy("");
    }
  }

  // ---------------- 화면 ----------------
  const pct = score.scored > 0 ? Math.round((score.pass / score.scored) * 100) : 0;

  if (status === "loading") {
    return (
      <div className="gs-panel gl-state" data-testid="gs-audio-loading">
        녹음을 불러오는 중…
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="gs-panel gl-state" data-testid="gs-audio-error">
        <div>{loadError}</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAttempt((a) => a + 1)} data-testid="gs-audio-retry">
          다시 불러오기
        </button>
      </div>
    );
  }

  return (
    <div className="gs-panel" data-testid="gs-panel">
      <p className="gs-help">
        말 사이에 쉬는 곳을 기준으로 구간을 나눴어요. <strong>▶</strong>로 들어 보고, 그 구간에서 말한 <strong>표준 용어</strong>를 ‘정답’ 칸에 적어 주세요.
      </p>

      <div className="gs-toolbar">
        {supported ? (
          run.running ? (
            <button type="button" className="btn btn-fail btn-sm" onClick={stopChecks} data-testid="gs-stop">
              중지
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => runChecks()} disabled={segs.length === 0} data-testid="gs-run">
              크롬 인식 점검하기
            </button>
          )
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen} data-testid="gs-list-toggle">
          정답 한꺼번에 적기
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={saveSegments} disabled={!dirty || saving} data-testid="gs-save">
          {saving ? "저장 중…" : "정답 저장"}
        </button>
        {dirty && !saving && (
          <span className="gs-dirty" data-testid="gs-dirty">
            저장하지 않은 변경이 있어요
          </span>
        )}
      </div>

      {run.running && (
        <div className="gs-run-text" role="status" aria-live="polite" data-testid="gs-progress">
          {run.done + 1 > run.total ? run.total : run.done + 1} / {run.total} 구간을 크롬이 듣는 중… (구간마다 몇 초씩 걸려요)
        </div>
      )}
      {run.fatal && (
        <div className="gl-error gs-msg" role="alert" data-testid="gs-run-error">
          {run.fatal}
        </div>
      )}
      {!supported && (
        <div className="gs-notice" data-testid="gs-panel-unsupported">
          이 브라우저에서는 자동 인식 점검을 쓸 수 없어요 (PC 크롬 {MIN_CHROME_FOR_TRACK} 이상에서 가능해요). 들어 보고 정답을 적어 두거나, 아는 ‘들린 말’을 직접 적어 표에 등록할 수는 있어요.
        </div>
      )}

      {listOpen && (
        <div className="gs-list-box" data-testid="gs-list-box">
          <label htmlFor={`gs-list-text-${sample.id}`}>녹음한 순서대로 표준 용어를 한 줄에 하나씩 적어 주세요 (건너뛸 구간은 빈 줄)</label>
          <textarea
            id={`gs-list-text-${sample.id}`}
            className="input gs-list-text"
            rows={5}
            value={listText}
            placeholder={"예:\n콘크리트\n보(Beam)\n비계"}
            onChange={(e) => {
              setListText(e.target.value);
              setListMsg("");
            }}
            data-testid="gs-list-text"
          />
          <div className="gs-list-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={applyList} disabled={!listText.trim()} data-testid="gs-list-apply">
              순서대로 채우기
            </button>
            {listMsg && (
              <span className="gs-list-msg" role="status" data-testid="gs-list-msg">
                {listMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {summary.checked > 0 && (
        <div className="gs-summary" data-testid="gs-summary">
          <div className="gl-chips">
            <span className="gl-chip gl-chip-total" data-testid="gs-chip-checked">
              점검 <b>{summary.checked}</b>/{summary.total}개
            </span>
            <span className={`gl-chip gl-chip-add${summary.pass === 0 ? " is-zero" : ""}`} data-testid="gs-chip-pass">
              맞음 <b>{summary.pass}</b>
            </span>
            <span className={`gl-chip gl-chip-update${summary.near === 0 ? " is-zero" : ""}`} data-testid="gs-chip-near">
              후보에 있음 <b>{summary.near}</b>
            </span>
            <span className={`gl-chip gl-chip-skip${summary.fail + summary.none === 0 ? " is-zero" : ""}`} data-testid="gs-chip-fail">
              못 맞춤 <b>{summary.fail + summary.none}</b>
            </span>
          </div>
          {score.scored > 0 ? (
            <div className="gs-score" data-testid="gs-score">
              정답을 적은 {score.scored}개 중 <b>{score.pass}개</b>가 지금 용어 표로 맞게 바뀌어요 ({pct}%).
            </div>
          ) : (
            <div className="gs-score" data-testid="gs-score">
              정답을 적으면 몇 개가 맞는지 알려 드려요.
            </div>
          )}
        </div>
      )}

      {msg && (
        <div className="gs-info" role="status" data-testid="gs-panel-msg">
          {msg}
        </div>
      )}

      <datalist id={listId}>
        {standards.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <ol className="gs-segs" data-testid="gs-segs">
        {segs.map((seg, i) => {
          const r = results[seg.id];
          const j = judged[seg.id];
          const state = r ? j.status : "idle";
          const first = r && r.alternatives[0] ? r.alternatives[0].text : "";
          const isReg = reg && reg.segId === seg.id;
          return (
            <li key={seg.id} className={`gs-seg is-${state}`} data-testid="gs-seg" data-seg={seg.id}>
              <span className="gs-seg-no">{i + 1}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm gs-play"
                onClick={() => play(seg)}
                disabled={run.running}
                aria-label={`${i + 1}번 구간 ${playingId === seg.id ? "멈추기" : "듣기"}`}
                data-testid="gs-play"
              >
                {playingId === seg.id ? "■" : "▶"}
              </button>
              <div className="gs-seg-main">
                <div className="gs-seg-line">
                  <input
                    className="input gs-label"
                    value={seg.label}
                    placeholder="정답 (표준 용어)"
                    maxLength={SAMPLE_LIMITS.labelMax}
                    list={listId}
                    onChange={(e) => setLabel(seg.id, e.target.value)}
                    autoComplete="off"
                    aria-label={`${i + 1}번 구간 정답`}
                    data-testid="gs-label"
                  />
                  <span className={`gs-badge gs-badge-${state}`} data-testid="gs-status">
                    {BADGE[state]}
                  </span>
                </div>
                <div className="gs-seg-time">
                  {seconds(seg.start)}~{seconds(seg.end)}초
                </div>
                {r && (
                  <div className="gs-heard" data-testid="gs-heard-box">
                    {r.alternatives.length > 0 ? (
                      <>
                        <span className="gs-heard-label">크롬이 들은 말</span>
                        <span className="gs-heard-text" data-testid="gs-heard">
                          {first}
                        </span>
                        {j.converted && j.converted !== first && (
                          <span className="gs-converted" data-testid="gs-converted">
                            → {j.converted}
                          </span>
                        )}
                        {r.alternatives.length > 1 && (
                          <span className="gs-alts" data-testid="gs-alts">
                            <span className="gs-heard-label">다른 후보</span>
                            {r.alternatives.slice(1).map((a) => (
                              <button
                                type="button"
                                key={a.text}
                                className="gs-alt"
                                onClick={() => openReg(seg, a.text)}
                                disabled={!!busy}
                                title="이 후보를 ‘현장 은어’로 표에 등록"
                                data-testid="gs-alt"
                              >
                                {a.text}
                              </button>
                            ))}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="gl-muted" data-testid="gs-heard-none">
                        {r.error && r.error !== "no-speech" ? RECOGNITION_ERROR_TEXT[r.error] || "인식하지 못했어요." : "크롬이 아무 말도 듣지 못했어요."}
                      </span>
                    )}
                  </div>
                )}
                {state === "near" && (
                  <div className="gs-near" data-testid="gs-near">
                    다른 후보에는 정답이 있어요. 첫째 후보(‘{first}’)를 표에 등록하면 맞게 바뀌어요.
                  </div>
                )}
                <div className="gs-seg-actions">
                  {supported && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => runChecks(seg)} disabled={run.running} data-testid="gs-one">
                      {r ? "다시 인식" : "인식"}
                    </button>
                  )}
                  {(!r || state !== "pass") && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openReg(seg)} disabled={!!busy || run.running} data-testid="gs-reg-open">
                      표에 등록
                    </button>
                  )}
                </div>
                {isReg && (
                  <form className="gs-reg" onSubmit={submitReg} noValidate data-testid="gs-reg">
                    <div className="field">
                      <label htmlFor={`gs-reg-slang-${seg.id}`}>현장 은어 (크롬이 들은 말)</label>
                      <input
                        id={`gs-reg-slang-${seg.id}`}
                        className="input"
                        value={reg.slang}
                        maxLength={40}
                        disabled={reg.saving}
                        onChange={(e) => setReg({ ...reg, slang: e.target.value, error: "" })}
                        autoComplete="off"
                        data-testid="gs-reg-slang"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`gs-reg-standard-${seg.id}`}>표준 용어</label>
                      <input
                        id={`gs-reg-standard-${seg.id}`}
                        className="input"
                        value={reg.standard}
                        maxLength={80}
                        list={listId}
                        disabled={reg.saving}
                        onChange={(e) => setReg({ ...reg, standard: e.target.value, error: "" })}
                        autoComplete="off"
                        data-testid="gs-reg-standard"
                      />
                    </div>
                    <div className="gl-actions">
                      <button className="btn btn-primary btn-sm" disabled={reg.saving || !!busy || !reg.slang.trim() || !reg.standard.trim()} data-testid="gs-reg-save">
                        {reg.saving ? "추가 중…" : "표에 추가"}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReg(null)} disabled={reg.saving} data-testid="gs-reg-cancel">
                        취소
                      </button>
                    </div>
                    {reg.error ? (
                      <div className="gl-error gs-reg-msg" role="alert" data-testid="gs-reg-error">
                        {reg.error}
                      </div>
                    ) : shortHint(reg.slang) ? (
                      <div className="gl-hint gs-reg-msg">글자 수가 적은 은어는 다른 낱말 속에서도 바뀝니다. 등록한 뒤 위의 ‘바꿔 보기’로 확인해 보세요.</div>
                    ) : null}
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="gs-resplit" data-testid="gs-resplit">
        <label htmlFor={`gs-silence-${sample.id}`}>구간 나누기</label>
        <select id={`gs-silence-${sample.id}`} className="input" value={silence} onChange={(e) => setSilence(e.target.value)} disabled={run.running} data-testid="gs-silence">
          {SILENCE_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="gs-resplit-note">이 길이 이상 쉬면 구간을 나눠요.</span>
        {askResplit ? (
          <span className="gs-resplit-ask" role="group" aria-label="구간 다시 나누기 확인">
            <span>정답과 점검 결과가 지워져요. 다시 나눌까요?</span>
            <button type="button" className="btn btn-fail btn-sm" onClick={resplit} data-testid="gs-resplit-confirm">
              다시 나누기
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskResplit(false)} data-testid="gs-resplit-cancel">
              취소
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={askOrResplit} disabled={run.running} data-testid="gs-resplit-go">
            구간 다시 나누기
          </button>
        )}
      </div>
    </div>
  );
}

// ====================================================================================================================
export default function GlossarySamples({ terms, adminName, busy, setBusy, onTermAdded, notify }) {
  const [load, setLoad] = useState("loading"); // loading | ready | error
  const [samples, setSamples] = useState([]);
  const [upload, setUpload] = useState({ running: false, text: "" });
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(true);
  const input = useRef(null);
  const supported = useMemo(() => trackRecognitionSupported(), []);
  const canAudio = useMemo(() => audioSupported(), []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // silent: 목록을 지우지 않고 뒤에서 다시 읽는다(다른 관리자가 먼저 지운 녹음을 눌렀을 때)
  const loadSamples = useCallback(async (silent = false) => {
    if (!silent) setLoad("loading");
    try {
      const res = await api.fetchGlossarySamples();
      if (!mounted.current) return;
      setSamples(res.samples);
      setLoad("ready");
    } catch {
      if (!mounted.current) return;
      if (silent) setError("녹음 목록을 새로 불러오지 못했습니다. 연결을 확인해 주세요.");
      else setLoad("error");
    }
  }, []);

  useEffect(() => {
    loadSamples();
  }, [loadSamples]);

  function handleGone() {
    setOpenId("");
    setDeleteId("");
    setError(SAMPLE_MESSAGES["not-found"]);
    loadSamples(true);
  }

  // ---------------- 올리기 ----------------
  // 파일마다: 올려도 되는 파일인지 → 열어서 길이·말 구간 찾기 → 저장(조각으로 나눠 Firestore에). 하나가 안 돼도 나머지는 계속한다.
  async function onPick(e) {
    const el = e.target;
    const files = Array.from(el.files || []);
    el.value = ""; // 같은 파일을 다시 골라도 반응하도록
    if (files.length === 0 || upload.running || busy) return;
    setError("");
    setUpload({ running: true, text: "" });
    const notes = [];
    let count = samples.length;
    let ctx = null;
    let lastId = "";
    try {
      ctx = createAudioContext();
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const name = cleanSampleName(file.name);
        const check = checkSampleFile(file, count);
        if (check.code !== "ok") {
          notes.push(`‘${name}’: ${SAMPLE_MESSAGES[check.code]}`);
          if (check.code === "full") break;
          continue;
        }
        if (mounted.current) setUpload({ running: true, text: `‘${name}’ 여는 중… (${i + 1}/${files.length})` });
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const audio = await decodeAudio(ctx, bytes);
          if (audio.duration > SAMPLE_LIMITS.maxSeconds) throw Object.assign(new Error(SAMPLE_MESSAGES["too-long"]), { code: "sample/too-long" });
          const ranges = splitSpeech(audio.samples, audio.sampleRate);
          if (ranges.length === 0) throw Object.assign(new Error(SAMPLE_MESSAGES.silent), { code: "sample/silent" });
          if (ranges.length > SAMPLE_LIMITS.maxSegments) throw Object.assign(new Error(SAMPLE_MESSAGES["too-many"]), { code: "sample/too-many" });
          if (mounted.current) setUpload({ running: true, text: `‘${name}’ 올리는 중… (${i + 1}/${files.length})` });
          const res = await api.addGlossarySample({ name: file.name, mime: sampleMime(file), data: bytes, duration: audio.duration, segments: toSegments(ranges) }, adminName);
          if (!mounted.current) return;
          count = res.samples.length;
          lastId = res.sample.id;
          setSamples(res.samples);
          notify(`녹음을 올렸습니다: ${res.sample.name} (말 구간 ${res.sample.segments.length}개)`);
        } catch (err) {
          notes.push(`‘${name}’: ${errorText(err)}`);
          if (err && err.code === "sample/full") break;
        }
      }
    } catch (err) {
      notes.push(errorText(err));
    } finally {
      closeAudioContext(ctx);
      if (mounted.current) {
        setUpload({ running: false, text: "" });
        setError(notes.join("\n"));
        if (lastId) setOpenId(lastId); // 방금 올린 녹음을 바로 열어 준다
      }
    }
  }

  // ---------------- 지우기 (한 번 더 물어본다) ----------------
  async function confirmDelete(s) {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      const res = await api.deleteGlossarySample(s.id, adminName);
      if (!mounted.current) return;
      setSamples(res.samples);
      setDeleteId("");
      if (openId === s.id) setOpenId("");
      notify(`녹음을 지웠습니다: ${s.name}`);
    } catch (err) {
      if (!mounted.current) return;
      setError(errorText(err));
      if (err && err.code === "sample/not-found") handleGone();
    } finally {
      if (mounted.current) setDeleting(false);
    }
  }

  const full = samples.length >= SAMPLE_LIMITS.maxFiles;

  return (
    <section className="card card-pad gs-card" data-testid="gs-card" aria-busy={upload.running ? "true" : "false"}>
      <div className="section-head">
        <div className="section-title">음성 샘플로 인식 점검하기</div>
        <span className="eyebrow" data-testid="gs-count">
          {load === "ready" ? `${samples.length} / ${SAMPLE_LIMITS.maxFiles}개` : ""}
        </span>
      </div>

      <p className="gs-desc">
        현장 은어·사투리를 말해서 녹음한 파일을 올리면(최대 {SAMPLE_LIMITS.maxFiles}개), 말 하나하나를 나눠서 <strong>크롬 음성 인식이 어떻게 듣는지</strong> 확인해 줘요. 잘못 들린 말은 ‘이렇게 들리면 이 말’로 용어 표에 바로 등록할 수 있어요.
      </p>
      <p className="gs-desc gs-note">
        음성 인식 자체를 학습시키는 기능은 아니에요. 녹음은 <strong>단어나 짧은 말 하나씩, 사이를 1초쯤 쉬면서</strong> 해 주세요. 파일 하나에 여러 말을 이어서 녹음해도 돼요. (녹음에 이름이나 전화번호는 말하지 마세요)
      </p>
      {!supported && (
        <div className="gs-notice" data-testid="gs-unsupported">
          이 브라우저에서는 크롬 인식 점검을 쓸 수 없어요. PC 크롬({MIN_CHROME_FOR_TRACK} 이상)에서 열어 주세요. 녹음을 올리고 들어 보고 정답을 적어 두는 것은 지금도 가능해요.
        </div>
      )}

      <input ref={input} type="file" accept={SAMPLE_ACCEPT} multiple className="gl-sr" tabIndex={-1} aria-hidden="true" onChange={onPick} data-testid="gs-file" />

      {load === "loading" && (
        <div className="gl-state" data-testid="gs-loading">
          녹음 목록을 불러오는 중…
        </div>
      )}
      {load === "error" && (
        <div className="gl-state" data-testid="gs-load-error">
          <div>녹음 목록을 불러오지 못했습니다. 연결을 확인해 주세요.</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => loadSamples()} data-testid="gs-retry">
            다시 불러오기
          </button>
        </div>
      )}

      {load === "ready" && (
        <>
          <div className="gs-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => input.current && input.current.click()}
              disabled={!!busy || upload.running || full || !canAudio}
              data-testid="gs-pick"
            >
              {upload.running ? "올리는 중…" : full ? `가득 찼어요 (${SAMPLE_LIMITS.maxFiles}/${SAMPLE_LIMITS.maxFiles})` : "녹음 파일 올리기"}
            </button>
            <span className="gs-hint">mp3 · m4a · wav · ogg · webm, 파일당 {SAMPLE_LIMITS.maxBytes / (1024 * 1024)}MB 이하</span>
          </div>
          {!canAudio && (
            <div className="gl-error gs-msg" role="alert" data-testid="gs-no-audio">
              {SAMPLE_MESSAGES["no-audio"]}
            </div>
          )}
          {upload.running && (
            <div className="gs-run-text" role="status" aria-live="polite" data-testid="gs-upload-status">
              {upload.text || "올릴 준비 중…"}
            </div>
          )}
          {error && (
            <div className="gl-error gs-msg gs-error-lines" role="alert" data-testid="gs-error">
              {error}
            </div>
          )}

          {samples.length === 0 ? (
            <div className="gl-state" data-testid="gs-empty">
              아직 올린 녹음이 없어요.
            </div>
          ) : (
            <ul className="gs-list" data-testid="gs-list">
              {samples.map((s) => {
                const labeled = s.segments.filter((g) => g.label).length;
                const isOpen = openId === s.id;
                return (
                  <li key={s.id} className={`gs-item${isOpen ? " is-open" : ""}`} data-testid="gs-item">
                    <div className="gs-item-head">
                      <div className="gs-item-name">
                        <strong data-testid="gs-name">{s.name}</strong>
                        <span data-testid="gs-meta">
                          {formatDuration(s.duration)} · {formatBytes(s.size)} · 말 구간 {s.segments.length}개{labeled > 0 ? ` · 정답 ${labeled}개` : ""}
                        </span>
                      </div>
                      {deleteId === s.id ? (
                        <div className="gl-confirm" role="group" aria-label={`${s.name} 지우기 확인`}>
                          <span>지울까요?</span>
                          <div className="gl-actions">
                            <button type="button" className="btn btn-fail btn-sm" onClick={() => confirmDelete(s)} disabled={deleting} data-testid="gs-delete-confirm">
                              {deleting ? "지우는 중…" : "지우기"}
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteId("")} disabled={deleting} data-testid="gs-delete-cancel">
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="gl-actions">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenId(isOpen ? "" : s.id)} aria-expanded={isOpen} data-testid="gs-open">
                            {isOpen ? "닫기" : "열기"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setDeleteId(s.id);
                              setError("");
                            }}
                            disabled={upload.running}
                            aria-label={`${s.name} 지우기`}
                            data-testid="gs-delete"
                          >
                            지우기
                          </button>
                        </div>
                      )}
                    </div>
                    {isOpen && (
                      <SamplePanel
                        key={s.id}
                        sample={s}
                        terms={terms}
                        adminName={adminName}
                        supported={supported}
                        busy={busy}
                        setBusy={setBusy}
                        onSaved={setSamples}
                        onGone={handleGone}
                        onTermAdded={onTermAdded}
                        notify={notify}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
