import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./UI.jsx";
import FoldToggle, { useFolded } from "./FoldToggle.jsx";
import { getSpeechRecognition } from "../voice.js";
import { createLongRecognizer, appendTranscript, clockHM, longSpeechErrorText, longSpeechStopText, LONG_SPEECH_LIMITS } from "../longSpeech.js";
import {
  summarizeTbm,
  tbmMissing,
  hasTbmFields,
  TBM_EXAMPLE,
  TBM_EXAMPLE_TEXT,
  TBM_MISSING_HINTS,
  CHECK_KEYS,
  CHECK_LABELS,
  TBM_LIMITS,
  TBM_RISK_MAX,
  TBM_NOTES_MAX,
  TBM_TEXT_MAX,
} from "../paperwork/tbmSummary.js";
import { fieldsForEdit, hashText } from "../paperwork/tbmDraft.js";

// TBM(작업 전 안전점검회의) 일지의 "회의 녹음으로 채우기" 부분.
//   1) 회의를 말하면(약 5분, 최대 20분) 글로 받아 적고  2) 규칙으로 읽어 서류의 칸별 값으로 나누고  3) 사람이 칸마다 확인·고친다.
// 서버나 인공지능 서비스에 보내지 않고 이 브라우저 안에서만 처리한다. 사람이 하는 일을 대신하는 요약이 아니라 "말한 낱말을 칸에 나누어 적는" 정도라서,
// 못 찾은 칸은 비워 두고 알리며, 모든 칸은 서류를 만들기 전에 고칠 수 있다.
// 받아 적은 글과 칸 값(draft)은 부모(Paperwork)가 날짜별로 쥐고 이 기기에 임시로 남긴다.

const MIN_AUTO_CHARS = 30; // 공백을 뺀 글자 수가 이보다 짧으면 칸을 자동으로 채우지 않는다
const FLUSH_MS = 3000; // 녹음하는 동안 받아 적은 글을 부모(임시 저장)에 넘기는 간격
const LIVE_TAIL = 500; // 녹음 중 화면에 보여 주는 글의 끝부분 글자 수
const MAX_MINUTES = Math.round(LONG_SPEECH_LIMITS.maxMs / 60000);

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const nonBlank = (s) => String(s || "").replace(/\s+/g, "").length;

// 비어 있는 칸을 알릴 목록(작업 장소와 작업 내용이 둘 다 비면 한 줄로 묶는다)
export function missingItems(fields) {
  const keys = tbmMissing(fields);
  const has = (k) => keys.includes(k);
  const out = [];
  if (has("site")) out.push({ key: "site", ...TBM_MISSING_HINTS.site });
  if (has("leader")) out.push({ key: "leader", ...TBM_MISSING_HINTS.leader });
  if (has("headcount")) out.push({ key: "headcount", ...TBM_MISSING_HINTS.headcount });
  if (has("place") && has("work")) out.push({ key: "work", label: "작업 장소·작업 내용", example: TBM_MISSING_HINTS.work.example });
  else if (has("place")) out.push({ key: "place", ...TBM_MISSING_HINTS.place });
  else if (has("work")) out.push({ key: "work", ...TBM_MISSING_HINTS.work });
  if (has("risks")) out.push({ key: "risks", ...TBM_MISSING_HINTS.risks });
  else if (has("measures")) out.push({ key: "measures", ...TBM_MISSING_HINTS.measures, note: "대책을 말하지 않은 위험요인이 있어요" });
  return out;
}

function TextField({ id, label, value, onChange, max, placeholder, wide, suffix, inputMode, testId }) {
  return (
    <div className={`tbm-f${wide ? " tbm-f-wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="tbm-f-box">
        <input
          id={id}
          className="input"
          value={value}
          maxLength={max}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
        />
        {suffix && <span className="tbm-f-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

// props
//   draft            { text, fields(화면에서 고치는 값), summarized, edited, sumHash }
//   onDraft(patch)   부모가 draft에 합쳐 저장한다(patch는 객체이거나 이전 draft를 받아 patch를 돌려주는 함수)
//   onReset()        초안 전체 지우기
//   onRecordingChange(true|false)  녹음 중에는 부모가 날짜 바꾸기 등을 막는다
//   fallbackPlace / fallbackWork   칸을 비워 두면 서류에 들어갈, 그 날 음성 기록에서 읽은 값(안내용)
export default function TbmMeeting({ draft, onDraft, onReset, onRecordingChange, fallbackPlace = "", fallbackWork = "" }) {
  const supported = useMemo(() => !!getSpeechRecognition(), []);
  const [snap, setSnap] = useState(null); // 녹음기의 마지막 상태(녹음 중이거나 방금 끝났을 때)
  const [info, setInfo] = useState(""); // 녹음·요약 뒤의 안내 글
  const [confirm, setConfirm] = useState(""); // "" | "resummary" | "reset"
  const [manual, setManual] = useState(false); // 녹음 없이 칸을 직접 적겠다고 연 것
  const [editFolded, setEditFolded] = useState(false); // 칸별 확인 영역을 접어 둔 것(새로 요약하면 다시 펼친다)
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [guideFolded, toggleGuide] = useFolded("tbm-guide");

  const recRef = useRef(null);
  const baseRef = useRef(""); // 이번 녹음을 시작할 때 이미 있던 글
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const snapRef = useRef(null);
  const propsRef = useRef({ onDraft, onRecordingChange });
  propsRef.current = { onDraft, onRecordingChange };
  const liveRef = useRef(null);

  const listening = !!snap && snap.state !== "idle";
  const fields = draft.fields;
  const filled = hasTbmFields(fields);
  const showEditor = draft.summarized || filled || manual;
  const stale = draft.summarized && hashText(draft.text) !== draft.sumHash;

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
        propsRef.current.onDraft({ text: combined, fields: { ...d.fields, from, to } });
      } else if (d.edited) {
        notes.push("직접 고친 칸이 있어서 칸은 그대로 두었어요. 새로 받아 적은 글로 다시 채우려면 '다시 요약'을 눌러 주세요.");
        propsRef.current.onDraft({ text: combined, fields: { ...d.fields, from, to } });
      } else {
        const r = summarizeTbm(combined, { from, to });
        propsRef.current.onDraft({ text: combined, fields: fieldsForEdit(r.fields), summarized: true, edited: false, sumHash: hashText(combined) });
        notes.push("받아 적은 글을 읽어 칸을 채웠어요. 아래에서 확인하고 고쳐 주세요.");
      }
    }
    setInfo(notes.join(" "));
    setSnap(s);
    propsRef.current.onRecordingChange(false);
  };

  const handleSnap = (s) => {
    snapRef.current = s;
    setSnap(s);
    if (s.state === "idle") finish(s);
  };

  const start = () => {
    if (recRef.current || !supported) return;
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
    propsRef.current.onRecordingChange(true);
    if (!rec.start()) {
      // 시작하지 못했다: 이유는 snapshot의 error에 있다
      const s = rec.snapshot();
      recRef.current = null;
      rec.dispose();
      setInfo(longSpeechErrorText(s.error) || longSpeechErrorText("start-failed"));
      propsRef.current.onRecordingChange(false);
    }
  };

  const stop = () => {
    const rec = recRef.current;
    if (rec) rec.stop();
  };

  // 녹음하는 동안 받아 적은 글을 주기적으로 임시 저장하게 넘긴다(브라우저가 갑자기 닫혀도 대부분 남게)
  useEffect(() => {
    if (!listening) return undefined;
    const id = setInterval(() => {
      const s = snapRef.current;
      if (!s || s.state === "idle" || !recRef.current) return;
      const text = appendTranscript(baseRef.current, s.text).slice(0, TBM_TEXT_MAX);
      if (text !== draftRef.current.text) propsRef.current.onDraft({ text });
    }, FLUSH_MS);
    return () => clearInterval(id);
  }, [listening]);

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
        propsRef.current.onDraft({ text });
        propsRef.current.onRecordingChange(false);
      } catch {
        // 남기지 못해도 화면은 닫힌다
      }
    },
    []
  );

  // ---------------------------------------------------------------- 요약 · 고치기
  const doSummary = () => {
    const d = draftRef.current;
    const r = summarizeTbm(d.text, { from: d.fields.from, to: d.fields.to });
    onDraft({ fields: fieldsForEdit(r.fields), summarized: true, edited: false, sumHash: hashText(d.text) });
    setEditFolded(false);
    setConfirm("");
    setInfo(r.stats.sentences === 0 ? "읽을 글이 없어요." : "받아 적은 글을 읽어 칸을 채웠어요. 아래에서 확인하고 고쳐 주세요.");
  };
  const askSummary = () => {
    if (draft.edited) setConfirm("resummary");
    else doSummary();
  };
  const tryExample = () => {
    const r = summarizeTbm(TBM_EXAMPLE_TEXT);
    onDraft({ text: TBM_EXAMPLE_TEXT, fields: fieldsForEdit(r.fields), summarized: true, edited: false, sumHash: hashText(TBM_EXAMPLE_TEXT) });
    setInfo("예문으로 채워 본 시험 내용이에요. 실제 서류에 쓰려면 '처음부터 다시'로 지우고 회의를 녹음해 주세요.");
  };
  const doReset = () => {
    setConfirm("");
    setInfo("");
    setManual(false);
    setSnap(null);
    onReset();
  };

  const setField = (key, value) => onDraft((d) => ({ fields: { ...d.fields, [key]: value }, edited: true }));
  const setCheck = (key, value) => onDraft((d) => ({ fields: { ...d.fields, checks: { ...d.fields.checks, [key]: value } }, edited: true }));
  const setRisk = (i, key, value) =>
    onDraft((d) => ({ fields: { ...d.fields, risks: d.fields.risks.map((r, j) => (j === i ? { ...r, [key]: value } : r)) }, edited: true }));
  const addRisk = () =>
    onDraft((d) => (d.fields.risks.length >= TBM_RISK_MAX ? {} : { fields: { ...d.fields, risks: [...d.fields.risks, { hazard: "", measure: "" }] }, edited: true }));
  const delRisk = (i) => onDraft((d) => ({ fields: { ...d.fields, risks: d.fields.risks.filter((_, j) => j !== i) }, edited: true }));

  // ---------------------------------------------------------------- 화면
  const finalPart = listening && snap ? appendTranscript(baseRef.current, snap.text) : "";
  const tail = finalPart.length > LIVE_TAIL ? `…${finalPart.slice(-LIVE_TAIL)}` : finalPart;
  const heardChars = listening && snap ? nonBlank(snap.text) : 0;
  const elapsed = listening && snap ? nowMs - snap.startedAt : 0;
  const missing = draft.summarized ? missingItems(fields) : [];
  const anyCheck = CHECK_KEYS.some((k) => fields.checks[k]);
  const noteLines = fields.notes.split("\n").filter((l) => l.trim());
  const notesOver = noteLines.length > TBM_NOTES_MAX || noteLines.some((l) => l.trim().length > TBM_LIMITS.note);
  const isExample = draft.text === TBM_EXAMPLE_TEXT;
  const summaryLabel = !draft.summarized ? "이 글로 칸 채우기" : stale ? "글이 바뀌었어요 · 칸 다시 채우기" : "다시 요약";

  return (
    <section className="tbm-meet" data-testid="tbm-meeting" aria-label="회의 녹음으로 칸 채우기">
      <div className="tbm-head">
        <h3 className="tbm-title">회의를 녹음해서 칸 채우기</h3>
        <p className="tbm-sub">
          약 5분 길이의 회의를 그대로 말하면 글로 받아 적고, 서류의 알맞은 칸에 나눠 넣어요. 한 번에 최대 {MAX_MINUTES}분까지 받아 적어요.
        </p>
      </div>

      {/* ---- 녹음 ---- */}
      <div className="tbm-rec">
        {!supported && (
          <div className="tbm-alert" role="status" data-testid="tbm-unsupported">
            {longSpeechErrorText("unsupported")}
          </div>
        )}
        <div className="tbm-rec-row">
          {listening ? (
            <button type="button" className="btn btn-fail tbm-rec-btn" onClick={stop} disabled={snap.state === "stopping"} data-testid="tbm-stop">
              <span className="tbm-stop-sq" aria-hidden="true" />
              {snap.state === "stopping" ? "마무리하는 중…" : "녹음 끝내기"}
            </button>
          ) : (
            <button type="button" className="btn btn-primary tbm-rec-btn" onClick={start} disabled={!supported} data-testid="tbm-rec">
              <Icon.Mic width="18" height="18" />
              {draft.text.trim() ? "이어서 녹음하기" : "회의 녹음 시작"}
            </button>
          )}
          {listening && (
            <span className="tbm-timer" data-testid="tbm-timer" aria-label="녹음한 시간">
              <span className="tbm-dot" aria-hidden="true" />
              {mmss(elapsed)}
            </span>
          )}
        </div>
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
                {snap.interim && <span className="tbm-interim">{tail ? " " : ""}{snap.interim}</span>}
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
            onChange={(e) => onDraft({ text: e.target.value })}
            data-testid="tbm-text"
          />
          {isExample && (
            <div className="tbm-alert" data-testid="tbm-example-note">
              예문으로 채운 시험 내용이에요. 실제 서류에는 쓰지 마세요.
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
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirm("reset")}
              disabled={!draft.text && !draft.summarized && !filled && !manual}
              data-testid="tbm-reset"
            >
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
              <span>받아 적은 글과 칸에 넣은 내용을 모두 지워요. 그래도 지울까요?</span>
              <span className="tbm-confirm-btns">
                <button type="button" className="btn btn-fail btn-sm" onClick={doReset} data-testid="tbm-reset-yes">
                  모두 지우기
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm("")} data-testid="tbm-reset-no">
                  취소
                </button>
              </span>
            </div>
          )}
          <p className="tbm-local">받아 적은 글과 고친 칸은 이 기기의 브라우저에만 임시로 남고, 서버로 보내지 않아요.</p>
        </div>
      )}

      {/* ---- 칸별 확인 · 고치기 ---- */}
      {!listening && showEditor && (
        <div className="tbm-edit" data-testid="tbm-edit">
          <div className="tbm-edit-head">
            <h4 className="tbm-edit-title">칸별로 확인하고 고치기</h4>
            <FoldToggle folded={editFolded} onToggle={() => setEditFolded((f) => !f)} label="칸별로 확인하고 고치기" controls="tbm-edit-body" testId="tbm-edit-fold" />
          </div>
          {missing.length > 0 && (
            <div className="tbm-missing" role="status" data-testid="tbm-missing">
              <div className="tbm-missing-title">회의 내용에서 못 찾은 칸이 있어요</div>
              <p className="tbm-missing-lead">아래 칸에 직접 적거나, 빠진 내용만 이어서 녹음해 주세요. 못 찾은 칸은 서류에도 비워 둬요.</p>
              <ul className="tbm-missing-list">
                {missing.map((m) => (
                  <li key={m.key} data-testid={`tbm-missing-${m.key}`}>
                    <strong>{m.label}</strong>
                    {m.note && <span className="tbm-missing-note">{m.note}</span>}
                    <span className="tbm-missing-eg">예) {m.example}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {draft.summarized && missing.length === 0 && (
            <div className="tbm-okbox" role="status" data-testid="tbm-nomissing">
              현장명·진행자·참석 인원·작업·위험요인과 대책을 모두 찾았어요.
            </div>
          )}

          {!editFolded && (
            <div id="tbm-edit-body" className="tbm-edit-body">
              <div className="tbm-grid">
                <TextField id="tbm-f-site" label="현장명" value={fields.site} onChange={(v) => setField("site", v)} max={TBM_LIMITS.site} placeholder="예) OO아파트 신축공사" testId="tbm-field-site" />
                <TextField id="tbm-f-leader" label="진행자" value={fields.leader} onChange={(v) => setField("leader", v)} max={TBM_LIMITS.leader} placeholder="예) OO건설 홍길동 소장" testId="tbm-field-leader" />
                <TextField
                  id="tbm-f-headcount"
                  label="참석 인원"
                  value={fields.headcount}
                  onChange={(v) => setField("headcount", v.replace(/[^\d]/g, ""))}
                  max={4}
                  inputMode="numeric"
                  suffix="명"
                  placeholder="예) 12"
                  testId="tbm-field-headcount"
                />
                <div className="tbm-f">
                  <label htmlFor="tbm-f-from">회의 시간</label>
                  <div className="tbm-f-box tbm-time">
                    <input id="tbm-f-from" type="time" className="input" value={fields.from} onChange={(e) => setField("from", e.target.value)} aria-label="시작 시각" data-testid="tbm-field-from" />
                    <span aria-hidden="true">~</span>
                    <input id="tbm-f-to" type="time" className="input" value={fields.to} onChange={(e) => setField("to", e.target.value)} aria-label="끝난 시각" data-testid="tbm-field-to" />
                  </div>
                </div>
                <TextField
                  id="tbm-f-place"
                  label="작업 장소"
                  wide
                  value={fields.place}
                  onChange={(v) => setField("place", v)}
                  max={TBM_LIMITS.place}
                  placeholder={fallbackPlace ? `비워 두면 이 날 음성 기록의 장소가 들어가요: ${fallbackPlace}` : "예) 101동 3층, 102동 지하 1층"}
                  testId="tbm-field-place"
                />
                <TextField
                  id="tbm-f-work"
                  label="작업 내용"
                  wide
                  value={fields.work}
                  onChange={(v) => setField("work", v)}
                  max={TBM_LIMITS.work}
                  placeholder={fallbackWork ? `비워 두면 이 날 음성 기록의 공종이 들어가요: ${fallbackWork}` : "예) 도배, 방수"}
                  testId="tbm-field-work"
                />
              </div>

              <div className="tbm-risks" data-testid="tbm-risks">
                <div className="tbm-label-row">
                  <span className="tbm-label">오늘의 위험요인과 대책</span>
                  <span className="tbm-count">
                    {fields.risks.length}/{TBM_RISK_MAX}줄
                  </span>
                </div>
                {fields.risks.length === 0 && <p className="tbm-empty">위험요인을 찾지 못했어요. 아래 '줄 추가'로 직접 적을 수 있어요.</p>}
                {fields.risks.map((r, i) => (
                  <div className="tbm-risk" key={i} data-testid={`tbm-risk-${i}`}>
                    <span className="tbm-no">{i + 1}</span>
                    <div className="tbm-risk-cells">
                      <label>
                        <span>위험요인 (어디서, 무엇 때문에)</span>
                        <textarea
                          className="input"
                          rows={2}
                          maxLength={TBM_LIMITS.hazard}
                          value={r.hazard}
                          onChange={(e) => setRisk(i, "hazard", e.target.value)}
                          data-testid={`tbm-risk-hazard-${i}`}
                        />
                      </label>
                      <label>
                        <span>대책 (누가, 어떻게)</span>
                        <textarea
                          className="input"
                          rows={2}
                          maxLength={TBM_LIMITS.measure}
                          value={r.measure}
                          onChange={(e) => setRisk(i, "measure", e.target.value)}
                          data-testid={`tbm-risk-measure-${i}`}
                        />
                      </label>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm tbm-risk-del" onClick={() => delRisk(i)} aria-label={`${i + 1}번 줄 지우기`} data-testid={`tbm-risk-del-${i}`}>
                      <Icon.Trash width="14" height="14" />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" onClick={addRisk} disabled={fields.risks.length >= TBM_RISK_MAX} data-testid="tbm-risk-add">
                  <Icon.Plus width="14" height="14" />줄 추가
                </button>
              </div>

              <div className="tbm-checks" data-testid="tbm-checks">
                <div className="tbm-label-row">
                  <span className="tbm-label">점검 항목 (확인한 것에 표시)</span>
                </div>
                {CHECK_KEYS.map((k) => (
                  <label key={k} className={`tbm-check${fields.checks[k] ? " is-on" : ""}`}>
                    <input type="checkbox" checked={!!fields.checks[k]} onChange={(e) => setCheck(k, e.target.checked)} data-testid={`tbm-check-${k}`} />
                    <span>{CHECK_LABELS[k]}</span>
                  </label>
                ))}
                {anyCheck && <p className="tbm-tipline">표시는 회의에서 말한 내용만 보고 정했어요. 실제로 확인한 항목인지 꼭 살펴보고, 아니면 체크를 풀어 주세요.</p>}
              </div>

              <div className="tbm-notes">
                <div className="tbm-label-row">
                  <label htmlFor="tbm-f-notes" className="tbm-label">
                    교육·전달 사항 (한 줄에 하나)
                  </label>
                  <span className="tbm-count">
                    {noteLines.length}/{TBM_NOTES_MAX}줄
                  </span>
                </div>
                <textarea
                  id="tbm-f-notes"
                  className="input"
                  rows={4}
                  value={fields.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="예) 오후에 비 예보가 있으니 작업 전 기상 확인"
                  data-testid="tbm-field-notes"
                />
                {notesOver && (
                  <p className="tbm-warnline" data-testid="tbm-notes-over">
                    서류에는 {TBM_NOTES_MAX}줄까지, 한 줄에 {TBM_LIMITS.note}자까지만 들어가요. 넘치는 줄은 빠지고 긴 줄은 잘려요.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
