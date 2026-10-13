import React, { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api.js";
import { GLOSSARY_LIMITS, GLOSSARY_MESSAGES } from "../voice.js";
import { IMPORT_LIMITS, countShortSlang, parseTermRows, planGlossaryImport } from "../glossaryImport.js";
import { downloadTemplate, downloadTerms, readTermFile } from "../glossaryFile.js";

// 관리자 "용어 DB" 탭의 "엑셀로 한꺼번에 올리기" 카드.
// 엑셀(.xlsx)·CSV 파일을 고르면 → 읽어서 → 표에 어떻게 반영되는지(추가·고침·그대로·건너뜀)를 먼저 보여 주고 → 확인하면 반영한다.
// 관리자 화면은 한국어만 쓰므로 문구를 번역 사전(i18n)이 아니라 여기에 바로 적었다.
// props: terms(지금 표), adminName, busy/setBusy(다른 저장과 겹치지 않게 부모와 함께 쓰는 표시), onApplied(저장된 최신 표), onReload(표를 다시 불러오기), notify

const LIST_LIMIT = 100; // 목록은 앞쪽만 보여 준다(숫자는 항상 전체)
const OPEN_ADD_MAX = 8; // 새로 들어갈 용어는 이 개수까지만 처음부터 펼쳐 둔다(고치거나 지우는 것·건너뛰는 줄은 늘 펼친다)

// 파일을 읽고 나면 미리보기가 화면 아래쪽에 생길 수 있다(특히 휴대폰). 카드 윗부분이 이미 잘 보이면 그대로 두고, 아니면 카드가 위에 붙어 있는 제목줄(topbar) 바로 밑에 오도록 스크롤한다.
function showCard(el) {
  if (!el || typeof window.scrollTo !== "function") return;
  const bar = document.querySelector(".topbar");
  const barH = bar ? bar.getBoundingClientRect().height : 0;
  const top = el.getBoundingClientRect().top;
  if (top >= barH && top < window.innerHeight * 0.45) return;
  const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, window.scrollY + top - barH - 12), behavior: calm ? "auto" : "smooth" });
}

function errorText(err) {
  const code = err && err.code ? String(err.code) : "";
  if ((code.startsWith("glossary/") || code.startsWith("import/")) && code !== "glossary/timeout" && err.message) return err.message;
  if (code === "glossary/timeout") return "저장이 오래 걸려 멈췄어요. 연결을 확인하고 다시 시도해 주세요.";
  return "올리지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
}

function Chip({ kind, label, n }) {
  return (
    <span className={`gl-chip gl-chip-${kind}${n === 0 ? " is-zero" : ""}`} data-testid={`gl-import-chip-${kind}`}>
      {label} <b>{n}</b>개
    </span>
  );
}

function ListBox({ id, title, count, open, children }) {
  if (!count) return null;
  return (
    <details className="gl-details" open={open} data-testid={`gl-import-list-${id}`}>
      <summary>
        {title} <b>{count}</b>개
      </summary>
      <ul className="gl-list">
        {children}
        {count > LIST_LIMIT && <li className="gl-list-more">…외 {count - LIST_LIMIT}개</li>}
      </ul>
    </details>
  );
}

function Row({ n, testid, children }) {
  return (
    <li data-testid={testid}>
      {n ? <span className="gl-list-row">{n}행</span> : null}
      {children}
    </li>
  );
}

export default function GlossaryImport({ terms, adminName, busy, setBusy, onApplied, onReload, notify }) {
  const [phase, setPhase] = useState("idle"); // idle | reading | review | applying | done
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null); // 고른 파일 정보 { name, kind, sheetName, sheetCount, truncated }
  const [parsed, setParsed] = useState(null); // parseTermRows 결과
  const [mode, setMode] = useState("merge"); // merge | replace
  const [result, setResult] = useState(null); // 반영한 결과 { plan, changed, total }
  const input = useRef(null);
  const card = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase === "review" || phase === "done") showCard(card.current);
  }, [phase]);

  // 지금 표와 견준 결과. 표가 바뀌면(다른 관리자가 고치는 등) 미리보기도 따라서 바뀐다.
  const plans = useMemo(() => {
    if (!parsed) return null;
    return { merge: planGlossaryImport(parsed.entries, terms, "merge"), replace: planGlossaryImport(parsed.entries, terms, "replace") };
  }, [parsed, terms]);
  const canChoose = terms.length > 0; // 표가 비어 있으면 "더하기"와 "바꾸기"가 같다
  const way = canChoose ? mode : "merge";
  const plan = plans ? plans[way] : null;

  function reset() {
    setPhase("idle");
    setError("");
    setInfo(null);
    setParsed(null);
    setResult(null);
    setMode("merge");
  }

  async function onPick(e) {
    const el = e.target;
    const file = el.files && el.files[0];
    el.value = ""; // 같은 파일을 다시 골라도 반응하도록
    if (!file || busy) return;
    setError("");
    setResult(null);
    setPhase("reading");
    try {
      const table = await readTermFile(file);
      if (!mounted.current) return;
      setParsed(parseTermRows(table.rows, table.rowOffset));
      setInfo({ name: file.name, kind: table.kind, sheetName: table.sheetName, sheetCount: table.sheetCount, truncated: table.truncated });
      setMode("merge");
      setPhase("review");
    } catch (err) {
      if (!mounted.current) return;
      setParsed(null);
      setInfo(null);
      setError(errorText(err));
      setPhase("idle");
    }
  }

  async function apply() {
    if (busy || phase !== "review" || !plan || plan.blocked || plan.changes === 0) return;
    setPhase("applying");
    setBusy("import");
    setError("");
    try {
      const res = await api.importGlossaryTerms(parsed.entries, way, adminName);
      if (!mounted.current) return;
      onApplied(res.terms);
      setResult({ plan: res.plan, changed: res.changed, total: res.terms.length });
      setPhase("done");
      const bits = [];
      if (res.plan.add.length) bits.push(`추가 ${res.plan.add.length}개`);
      if (res.plan.update.length) bits.push(`고침 ${res.plan.update.length}개`);
      if (res.plan.remove.length) bits.push(`지움 ${res.plan.remove.length}개`);
      notify(res.changed ? `엑셀에서 용어를 올렸습니다: ${bits.join(" · ")}` : "표에 이미 같은 내용이 들어 있어 바뀐 게 없습니다");
    } catch (err) {
      if (!mounted.current) return;
      setError(errorText(err));
      setPhase("review");
      if (err && err.code === "glossary/full") onReload(); // 그 사이 다른 관리자가 용어를 넣어 한도를 넘은 경우: 최신 표로 다시 견준다
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  function download(make) {
    setError("");
    try {
      make();
    } catch {
      setError("파일을 만들지 못했어요. 다시 시도해 주세요.");
    }
  }

  const working = phase === "reading" || phase === "applying";
  const showSkipped = parsed ? parsed.skipped : [];
  const shortCount = plan ? countShortSlang([...plan.add, ...plan.update]) : 0;

  // ---------------- 화면 ----------------
  return (
    <section ref={card} className="card card-pad gl-import" data-testid="gl-import">
      <div className="section-head">
        <div className="section-title">엑셀로 한꺼번에 올리기</div>
        <span className="eyebrow">EXCEL</span>
      </div>

      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv,.tsv,.txt"
        className="gl-sr"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPick}
        data-testid="gl-import-file"
      />

      {(phase === "idle" || phase === "reading") && (
        <p className="gl-import-desc">
          엑셀(.xlsx)이나 CSV 파일을 올리면 첫 번째 시트의 <strong>두 열(현장 은어 · 표준 용어)</strong>을 읽어요. 맨 위의 제목 줄은 알아서 건너뛰고, 표에 넣기 전에 어떻게 바뀌는지 먼저 보여 드려요.
        </p>
      )}

      {phase !== "review" && phase !== "applying" && phase !== "done" && (
        <div className="gl-import-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => input.current && input.current.click()}
            disabled={!!busy || working}
            data-testid="gl-import-pick"
          >
            {phase === "reading" ? "파일 읽는 중…" : "엑셀 파일 올리기"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(downloadTemplate)} disabled={working} data-testid="gl-import-template">
            양식 받기
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(() => downloadTerms(terms))} disabled={working} data-testid="gl-import-export">
            현재 표 받기
          </button>
        </div>
      )}

      {error && (
        <div className="gl-error gl-import-msg" role="alert" data-testid="gl-import-error">
          {error}
        </div>
      )}

      {(phase === "review" || phase === "applying") && parsed && plan && (
        <div className="gl-import-review" data-testid="gl-import-review">
          <div className="gl-import-file" data-testid="gl-import-file-info">
            <strong>{info.name}</strong>
            <span>
              {info.kind === "sheet" ? `시트 ‘${info.sheetName}’` : "텍스트(CSV) 파일"} · {parsed.read}줄 읽음
            </span>
          </div>
          <div className="gl-import-note" data-testid="gl-import-header-note">
            {parsed.header
              ? `제목 줄(${parsed.header.row}행)을 찾아 건너뛰었어요 — ‘${parsed.header.slang || "?"}’ 열은 현장 은어로, ‘${parsed.header.standard || "?"}’ 열은 표준 용어로 읽었어요.`
              : "제목 줄이 없어서 첫 줄부터 읽었어요 (첫째 열 = 현장 은어, 둘째 열 = 표준 용어)."}
            {info.kind === "sheet" && info.sheetCount > 1 ? " 다른 시트는 읽지 않았어요." : ""}
            {info.truncated ? ` 파일이 길어서 앞쪽 일부만 읽었어요 (약 ${IMPORT_LIMITS.maxRows}줄까지).` : ""}
          </div>

          <div className="gl-chips" data-testid="gl-import-chips">
            <Chip kind="add" label="추가" n={plan.add.length} />
            <Chip kind="update" label="고침" n={plan.update.length} />
            <Chip kind="same" label="그대로" n={plan.same.length} />
            <Chip kind="skip" label="건너뜀" n={parsed.skipped.length} />
            {way === "replace" && <Chip kind="remove" label="지움" n={plan.remove.length} />}
          </div>

          {canChoose && (
            <fieldset className="gl-modes" disabled={phase === "applying"}>
              <legend>반영 방식</legend>
              <label className={`gl-mode${way === "merge" ? " is-on" : ""}`}>
                <input type="radio" name="gl-import-mode" checked={way === "merge"} onChange={() => setMode("merge")} data-testid="gl-import-mode-merge" />
                <span>
                  <b>지금 표에 더하기</b>
                  <small>같은 은어는 파일의 표준 용어로 고치고, 파일에 없는 기존 용어는 그대로 둬요.</small>
                </span>
              </label>
              <label className={`gl-mode${way === "replace" ? " is-on" : ""}`}>
                <input type="radio" name="gl-import-mode" checked={way === "replace"} onChange={() => setMode("replace")} data-testid="gl-import-mode-replace" />
                <span>
                  <b>표 전체를 파일로 바꾸기</b>
                  <small>파일에 없는 기존 용어는 지워져요{plans.replace.remove.length > 0 ? ` (지금 ${plans.replace.remove.length}개)` : ""}.</small>
                </span>
              </label>
            </fieldset>
          )}

          {way === "replace" && plan.remove.length > 0 && !plan.blocked && (
            <div className="gl-warn" role="note" data-testid="gl-import-warn">
              지금 표에만 있는 용어 {plan.remove.length}개가 지워져요. 되돌릴 수 없으니 먼저 ‘현재 표 받기’로 백업해 두세요.
            </div>
          )}
          {plan.blocked === "full" && (
            <div className="gl-error gl-import-msg" role="alert" data-testid="gl-import-blocked">
              표에는 용어를 {GLOSSARY_LIMITS.max}개까지 넣을 수 있는데, 올리면 {plan.total}개가 돼요. 파일의 줄 수를 줄여 주세요.
            </div>
          )}
          {plan.blocked === "no-rows" && (
            <div className="gl-error gl-import-msg" role="alert" data-testid="gl-import-blocked">
              {GLOSSARY_MESSAGES["no-rows"]}
            </div>
          )}
          {!plan.blocked && plan.changes === 0 && (
            <div className="gl-import-note" data-testid="gl-import-nochange">
              {parsed.entries.length === 0
                ? "올릴 수 있는 용어 줄이 없어요. 파일의 내용과 열 순서를 확인해 주세요."
                : "표에 이미 모두 같은 내용이 들어 있어서 바뀌는 게 없어요."}
            </div>
          )}
          {shortCount > 0 && (
            <div className="gl-hint gl-import-msg" data-testid="gl-import-short-warn">
              한 글자짜리 은어 {shortCount}개가 들어 있어요. 다른 낱말 속에서도 바뀌니, 올린 뒤 위의 ‘바꿔 보기’로 확인해 보세요.
            </div>
          )}

          <ListBox id="add" title="새로 들어갈 용어" count={plan.add.length} open={plan.add.length <= OPEN_ADD_MAX}>
            {plan.add.slice(0, LIST_LIMIT).map((a, i) => (
              <Row key={`${a.row}-${i}`} n={a.row} testid="gl-import-add-item">
                <b>{a.slang}</b> → {a.standard}
              </Row>
            ))}
          </ListBox>
          <ListBox id="update" title="표준 용어가 고쳐질 용어" count={plan.update.length} open>
            {plan.update.slice(0, LIST_LIMIT).map((u, i) => (
              <Row key={`${u.row}-${i}`} n={u.row} testid="gl-import-update-item">
                <b>{u.slang}</b>: {u.from} → <b>{u.to}</b>
              </Row>
            ))}
          </ListBox>
          {way === "replace" && (
            <ListBox id="remove" title="지워질 용어" count={plan.remove.length} open>
              {plan.remove.slice(0, LIST_LIMIT).map((t) => (
                <Row key={t.id} testid="gl-import-remove-item">
                  <b>{t.slang}</b> → {t.standard}
                </Row>
              ))}
            </ListBox>
          )}
          <ListBox id="skip" title="건너뛰는 줄" count={showSkipped.length} open>
            {showSkipped.slice(0, LIST_LIMIT).map((s, i) => (
              <Row key={`${s.row}-${i}`} n={s.row} testid="gl-import-skip-item">
                <b>{s.slang || "(비어 있음)"}</b> → {s.standard || "(비어 있음)"}
                <span className="gl-list-why">{s.reason}</span>
              </Row>
            ))}
          </ListBox>

          <div className="gl-import-foot">
            <button
              type="button"
              className={`btn btn-sm ${way === "replace" && plan.remove.length > 0 ? "btn-fail" : "btn-primary"}`}
              onClick={apply}
              disabled={!!busy || phase === "applying" || !!plan.blocked || plan.changes === 0}
              data-testid="gl-import-apply"
            >
              {phase === "applying" ? "반영하는 중…" : way === "replace" ? "표를 이 파일로 바꾸기" : "표에 반영하기"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={phase === "applying"} data-testid="gl-import-cancel">
              취소
            </button>
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <div className="gl-import-done" role="status" data-testid="gl-import-done">
          <div className="gl-import-done-title">{result.changed ? "표에 반영했어요" : "바뀐 내용이 없었어요"}</div>
          <div data-testid="gl-import-done-text">
            {result.changed
              ? `추가 ${result.plan.add.length}개 · 고침 ${result.plan.update.length}개${result.plan.mode === "replace" ? ` · 지움 ${result.plan.remove.length}개` : ""} — 표는 이제 모두 ${result.total}개예요.`
              : "그 사이 표에 이미 같은 내용이 들어 있었어요."}
          </div>
          <ListBox id="skip" title="건너뛴 줄" count={showSkipped.length}>
            {showSkipped.slice(0, LIST_LIMIT).map((s, i) => (
              <Row key={`${s.row}-${i}`} n={s.row} testid="gl-import-skip-item">
                <b>{s.slang || "(비어 있음)"}</b> → {s.standard || "(비어 있음)"}
                <span className="gl-list-why">{s.reason}</span>
              </Row>
            ))}
          </ListBox>
          <div className="gl-import-foot">
            <button type="button" className="btn btn-primary btn-sm" onClick={reset} data-testid="gl-import-close">
              닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
