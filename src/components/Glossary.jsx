import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "./UI.jsx";
import GlossaryImport from "./GlossaryImport.jsx";
import GlossaryReapply from "./GlossaryReapply.jsx";
import GlossarySamples from "./GlossarySamples.jsx";
import * as api from "../api.js";
import { setGlossaryTerms, setGlossaryMode, adoptGlossary } from "../glossaryStore.js";
import { GLOSSARY_LIMITS, GLOSSARY_MESSAGES, applyGlossary, applyGlossaryOnly, checkTerm, slangKey } from "../voice.js";

// 관리자 "용어 DB" 탭: 현장 은어 → 표준 용어 표를 보고 고치는 화면.
// 하도급사의 "음성 검측"(탭과 호실 QR 화면)은 말한 내용을 이 표대로 바꿔서 저장한다. 표는 Firestore 문서 1개(meta/glossary)에 들어 있다.
// 같은 문서에 변환 방식도 들어 있다: '용어 DB에 있는 단어만 남기기'(기본 켜짐) - 켜면 은어는 표준 용어로 바꾸고 표에 없는 말은 변환된 문장에서 뺀다.
// 관리자 화면은 한국어만 쓰므로 문구를 번역 사전(i18n)이 아니라 여기에 바로 적었다.

// 검사 결과(checkTerm)나 저장소 오류를 사람이 읽는 문장으로 바꾼다.
function messageFor(check) {
  if (check.code === "duplicate" && check.existing) {
    return `이미 표에 있는 은어예요 (${check.existing.slang} → ${check.existing.standard}). 그 줄을 고쳐 주세요.`;
  }
  return GLOSSARY_MESSAGES[check.code] || "입력한 값을 확인해 주세요.";
}

function errorText(err) {
  const code = err && err.code ? String(err.code) : "";
  if (code.startsWith("glossary/") && code !== "glossary/timeout" && err.message) return err.message;
  if (code === "glossary/timeout") return "저장이 오래 걸려 멈췄어요. 연결을 확인하고 다시 시도해 주세요.";
  return "저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
}

// 글자가 한 개뿐인 은어는 다른 낱말 속에서도 바뀐다 - 입력 중에 미리 알려 준다.
function shortHint(value) {
  return Array.from(String(value || "").replace(/\s+/g, "")).length === 1;
}

const SHORT_HINT = "글자 수가 적은 은어는 다른 낱말 속에서도 바뀝니다. 아래 ‘바꿔 보기’로 확인해 보세요.";

function Marked({ parts }) {
  return parts.map((p, i) =>
    p.from !== undefined ? (
      <mark key={i} className="vl-mark" title={p.from}>
        {p.text}
      </mark>
    ) : (
      <React.Fragment key={i}>{p.text}</React.Fragment>
    )
  );
}

// props: adminName(저장한 사람으로 남길 이름), notify
export default function Glossary({ adminName, notify }) {
  const [terms, setTerms] = useState([]);
  const [load, setLoad] = useState("loading"); // loading | ready | error
  const [busy, setBusy] = useState(""); // "" | "add" | "edit" | "delete" | "import" | "sample" | "mode" - 저장하는 동안 다른 조작을 막는다
  const [onlyDb, setOnlyDb] = useState(true); // 용어 DB에 있는 단어만 남기는 변환 방식인지
  const [modeError, setModeError] = useState("");

  const [newSlang, setNewSlang] = useState("");
  const [newStandard, setNewStandard] = useState("");
  const [addError, setAddError] = useState("");

  const [query, setQuery] = useState("");
  const [previewText, setPreviewText] = useState("");

  const [editId, setEditId] = useState("");
  const [editSlang, setEditSlang] = useState("");
  const [editStandard, setEditStandard] = useState("");
  const [editError, setEditError] = useState("");

  const [deleteId, setDeleteId] = useState("");
  const [rowError, setRowError] = useState(""); // 삭제 중 생긴 오류(표 위에 보여 준다)

  const [flashId, setFlashId] = useState(""); // 방금 추가·수정한 줄을 잠깐 표시한다(정렬되어 위치가 바뀌기 때문)

  const mounted = useRef(true);
  const slangInput = useRef(null);
  const refocus = useRef(false);
  const flashRow = useRef(null);
  const flashTimer = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(flashTimer.current);
    };
  }, []);

  // 추가가 끝나 입력칸이 다시 풀리면 "현장 은어" 칸으로 커서를 돌려 이어서 넣을 수 있게 한다.
  useEffect(() => {
    if (!busy && refocus.current) {
      refocus.current = false;
      if (slangInput.current) slangInput.current.focus();
    }
  }, [busy]);

  useEffect(() => {
    if (flashId && flashRow.current && flashRow.current.scrollIntoView) flashRow.current.scrollIntoView({ block: "nearest" });
  }, [flashId]);

  function flash(id) {
    setFlashId(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(""), 2600);
  }

  // silent: 표를 지우지 않고 뒤에서 다시 읽는다(다른 관리자가 먼저 고친 줄을 눌렀을 때 목록만 바꿔 준다).
  const loadTerms = useCallback(async (silent = false) => {
    if (!silent) setLoad("loading");
    try {
      const res = await api.fetchGlossary();
      adoptGlossary(res); // 읽어 온 최신 표를 이 기기의 음성 검측용 복사본에도 맞춰 둔다
      if (!mounted.current) return;
      setTerms(res.terms);
      setOnlyDb(res.onlyDb !== false);
      setLoad("ready");
    } catch {
      if (!mounted.current) return;
      if (silent) setRowError("목록을 새로 불러오지 못했습니다. 연결을 확인해 주세요.");
      else setLoad("error");
    }
  }, []);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  // 저장이 끝난 최신 표를 화면과 음성 검측(같은 화면에서 "하도급사로 보기"를 눌렀을 때)에 함께 반영한다.
  function commit(nextTerms) {
    setTerms(nextTerms);
    setGlossaryTerms(nextTerms);
    setRowError("");
  }

  // 엑셀로 올린 결과를 반영한다. 열려 있던 수정·삭제 확인은 닫고(올린 내용에 따라 그 줄이 바뀌거나 사라질 수 있다), 찾기 글자도 지워 새 줄이 가려지지 않게 한다.
  function applyImported(nextTerms) {
    commit(nextTerms);
    setEditId("");
    setDeleteId("");
    setQuery("");
  }

  // 그 사이 다른 관리자가 지웠거나 바꾼 줄이면 알려 주고 목록을 새로 불러온다.
  function handleStale(err) {
    if (err && err.code === "glossary/not-found") {
      setEditId("");
      setDeleteId("");
      setRowError(GLOSSARY_MESSAGES["not-found"]);
      loadTerms(true);
    }
  }

  const sorted = useMemo(() => [...terms].sort((a, b) => a.slang.localeCompare(b.slang, "ko")), [terms]);
  const needle = slangKey(query);
  const rows = needle ? sorted.filter((t) => slangKey(t.slang).includes(needle) || slangKey(t.standard).includes(needle)) : sorted;
  const preview = useMemo(() => (onlyDb ? applyGlossaryOnly(previewText, terms) : applyGlossary(previewText, terms)), [previewText, terms, onlyDb]);
  const previewHits = preview.hits.reduce((sum, h) => sum + h.count, 0);
  const previewKept = onlyDb ? preview.kept : [];
  const previewDropped = onlyDb ? preview.dropped : [];

  // ---------------- 변환 방식 (용어 DB에 있는 단어만 남기기) ----------------
  async function toggleMode(next) {
    if (busy || next === onlyDb) return;
    setBusy("mode");
    setModeError("");
    try {
      const saved = await api.setGlossaryOnlyDb(next, adminName);
      if (!mounted.current) return;
      setOnlyDb(saved);
      setGlossaryMode(saved); // 같은 화면의 음성 검측("하도급사로 보기")에도 바로 쓰이게 한다
      notify(saved ? "이제 용어 DB에 있는 단어만 남겨요." : "이제 은어만 바꾸고 나머지 말은 그대로 둬요.");
    } catch (err) {
      if (!mounted.current) return;
      setModeError(errorText(err));
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  // ---------------- 추가 ----------------
  async function submitAdd(e) {
    e.preventDefault();
    if (busy) return;
    const check = checkTerm({ slang: newSlang, standard: newStandard }, terms);
    if (check.code !== "ok") {
      setAddError(messageFor(check));
      return;
    }
    setBusy("add");
    setAddError("");
    try {
      const res = await api.addGlossaryTerm({ slang: newSlang, standard: newStandard }, adminName);
      if (!mounted.current) return;
      commit(res.terms);
      setNewSlang("");
      setNewStandard("");
      setQuery(""); // 찾기 글자가 남아 있으면 방금 넣은 줄이 가려질 수 있다
      flash(res.term.id);
      refocus.current = true;
      notify(`용어를 추가했습니다: ${res.term.slang} → ${res.term.standard}`);
    } catch (err) {
      if (!mounted.current) return;
      setAddError(errorText(err));
      if (err && err.code === "glossary/duplicate") loadTerms(true); // 그 사이 다른 관리자가 같은 은어를 넣은 경우: 최신 표를 보여 준다
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  // ---------------- 수정 ----------------
  function startEdit(t) {
    setEditId(t.id);
    setEditSlang(t.slang);
    setEditStandard(t.standard);
    setEditError("");
    setDeleteId("");
    setRowError("");
  }

  function cancelEdit() {
    setEditId("");
    setEditError("");
  }

  async function saveEdit() {
    if (busy || !editId) return;
    const check = checkTerm({ slang: editSlang, standard: editStandard }, terms, editId);
    if (check.code !== "ok") {
      setEditError(messageFor(check));
      return;
    }
    const id = editId;
    setBusy("edit");
    setEditError("");
    try {
      const res = await api.updateGlossaryTerm(id, { slang: editSlang, standard: editStandard }, adminName);
      if (!mounted.current) return;
      commit(res.terms);
      setEditId("");
      flash(id);
      notify(`용어를 고쳤습니다: ${check.slang} → ${check.standard}`);
    } catch (err) {
      if (!mounted.current) return;
      setEditError(errorText(err));
      handleStale(err);
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  function onEditKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  // ---------------- 삭제 (한 번 더 물어본다) ----------------
  function askDelete(t) {
    setDeleteId(t.id);
    setEditId("");
    setRowError("");
  }

  async function confirmDelete(t) {
    if (busy) return;
    setBusy("delete");
    setRowError("");
    try {
      const res = await api.deleteGlossaryTerm(t.id, adminName);
      if (!mounted.current) return;
      commit(res.terms);
      setDeleteId("");
      notify(`용어를 삭제했습니다: ${t.slang}`);
    } catch (err) {
      if (!mounted.current) return;
      setRowError(errorText(err));
      handleStale(err);
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  const countText = needle ? `${rows.length} / ${terms.length}개` : `${terms.length}개`;

  return (
    <div className="gl-page" data-testid="gl-page">
      <section className="card card-pad gl-intro">
        <div className="section-head">
          <div className="section-title">현장 은어 → 표준 용어 표</div>
          <span className="eyebrow" data-testid="gl-count">
            {load === "ready" ? countText : ""}
          </span>
        </div>
        <p>
          하도급사의 <strong>음성 검측</strong>(탭과 호실 QR 화면)에서 말하거나 입력한 내용이 이 표대로 표준 용어로 바뀌어 저장됩니다.
        </p>
        <p className="gl-note">표를 고치면 그 뒤에 저장하는 보고부터 바로 적용돼요. 이미 저장된 보고에도 적용하려면 아래 ‘저장된 음성 기록에 다시 적용’을 눌러 주세요.</p>
        {load === "ready" && (
          <div className="gl-onlydb" data-testid="gl-mode">
            <label className="gl-onlydb-switch" htmlFor="gl-mode-toggle">
              <input
                id="gl-mode-toggle"
                type="checkbox"
                role="switch"
                checked={onlyDb}
                disabled={!!busy}
                onChange={(e) => toggleMode(e.target.checked)}
                data-testid="gl-mode-toggle"
              />
              <span className="gl-onlydb-label">용어 DB에 있는 단어만 남기기</span>
              <span className={`gl-onlydb-state${onlyDb ? " is-on" : ""}`} data-testid="gl-mode-state">
                {busy === "mode" ? "저장 중…" : onlyDb ? "켜짐" : "꺼짐"}
              </span>
            </label>
            <p className="gl-onlydb-desc" data-testid="gl-mode-desc">
              {onlyDb
                ? "음성을 글로 바꿀 때 현장 은어는 표준 용어로 바꾸고, 표에 없는 말(예: “했어요”)은 변환된 문장에서 뺍니다. 표의 표준 용어를 직접 말했으면 그대로 남아요. 원문은 그대로 저장되고, 호실 진행도 계산에도 영향이 없어요."
                : "은어만 표준 용어로 바꾸고 나머지 말은 그대로 둡니다."}
            </p>
            {modeError && (
              <div className="gl-error gl-onlydb-msg" role="alert" data-testid="gl-mode-error">
                {modeError}
              </div>
            )}
          </div>
        )}
      </section>

      {load === "loading" && (
        <div className="card card-pad gl-state" data-testid="gl-loading">
          표를 불러오는 중…
        </div>
      )}

      {load === "error" && (
        <div className="card card-pad gl-state" data-testid="gl-load-error">
          <div>용어 표를 불러오지 못했습니다. 연결을 확인해 주세요.</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => loadTerms()} data-testid="gl-retry">
            다시 불러오기
          </button>
        </div>
      )}

      {load === "ready" && (
        <>
          <section className="card card-pad gl-preview" data-testid="gl-preview">
            <div className="section-head">
              <div className="section-title">바꿔 보기</div>
              <span className="eyebrow">PREVIEW</span>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="gl-preview-input">문장을 넣으면 이 표대로 바뀐 결과를 바로 보여 줘요 (저장되지 않습니다)</label>
              <input
                id="gl-preview-input"
                className="input"
                placeholder="예: 공구리 치고 오사마리 했어요"
                value={previewText}
                maxLength={300}
                onChange={(e) => setPreviewText(e.target.value)}
                data-testid="gl-preview-input"
              />
            </div>
            <div className="gl-preview-out" data-testid="gl-preview-out" aria-live="polite">
              {!previewText.trim() ? (
                <span className="gl-muted">바뀐 결과가 여기에 나옵니다.</span>
              ) : onlyDb ? (
                preview.text ? (
                  <Marked parts={preview.parts} />
                ) : (
                  <span className="gl-muted" data-testid="gl-preview-none">
                    표에 있는 단어가 없어서 결과가 비어 있어요.
                  </span>
                )
              ) : previewHits === 0 ? (
                <span className="gl-muted" data-testid="gl-preview-none">
                  바뀌는 용어가 없어요: {previewText}
                </span>
              ) : (
                <>
                  <Marked parts={preview.parts} />
                </>
              )}
            </div>
            {previewHits > 0 && (
              <div className="gl-preview-meta" data-testid="gl-preview-meta">
                {previewHits}곳 바뀜 · {preview.hits.map((h) => `${h.slang} → ${h.standard}`).join(", ")}
                {previewKept.length > 0 ? ` · 표준 용어 그대로 ${previewKept.length}곳` : ""}
              </div>
            )}
            {previewHits === 0 && previewKept.length > 0 && (
              <div className="gl-preview-meta" data-testid="gl-preview-meta">
                표준 용어 그대로 {previewKept.length}곳 · {previewKept.join(", ")}
              </div>
            )}
            {previewDropped.length > 0 && (
              <div className="gl-preview-meta" data-testid="gl-preview-dropped">
                표에 없어서 뺀 말: {previewDropped.slice(0, 8).join(", ")}
                {previewDropped.length > 8 ? " …" : ""}
              </div>
            )}
          </section>

          <GlossaryImport terms={terms} adminName={adminName} busy={busy} setBusy={setBusy} onApplied={applyImported} onReload={() => loadTerms(true)} notify={notify} />

          <GlossarySamples terms={terms} adminName={adminName} busy={busy} setBusy={setBusy} onTermAdded={(nextTerms) => commit(nextTerms)} notify={notify} />

          <GlossaryReapply terms={terms} onlyDb={onlyDb} adminName={adminName} busy={busy} setBusy={setBusy} notify={notify} />

          <section className="card gl-table-card">
            <div className="gl-table-head">
              <div className="section-title">용어 표</div>
              <input
                className="input gl-search"
                type="search"
                placeholder="은어·표준 용어 찾기"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="용어 찾기"
                data-testid="gl-search"
              />
            </div>

            <form className="gl-add" onSubmit={submitAdd} data-testid="gl-add-form" noValidate>
              <div className="field">
                <label htmlFor="gl-new-slang">현장 은어</label>
                <input
                  id="gl-new-slang"
                  ref={slangInput}
                  className="input"
                  placeholder="현장에서 쓰는 말"
                  maxLength={GLOSSARY_LIMITS.slang}
                  value={newSlang}
                  disabled={!!busy}
                  onChange={(e) => {
                    setNewSlang(e.target.value);
                    setAddError("");
                  }}
                  autoComplete="off"
                  data-testid="gl-new-slang"
                />
              </div>
              <div className="field">
                <label htmlFor="gl-new-standard">표준 용어</label>
                <input
                  id="gl-new-standard"
                  className="input"
                  placeholder="바꿔 적을 표준 용어"
                  maxLength={GLOSSARY_LIMITS.standard}
                  value={newStandard}
                  disabled={!!busy}
                  onChange={(e) => {
                    setNewStandard(e.target.value);
                    setAddError("");
                  }}
                  autoComplete="off"
                  data-testid="gl-new-standard"
                />
              </div>
              <button className="btn btn-primary gl-add-btn" disabled={!!busy || !newSlang.trim() || !newStandard.trim()} data-testid="gl-add">
                {busy === "add" ? "추가 중…" : "추가"}
              </button>
              {addError ? (
                <div className="gl-error gl-add-msg" role="alert" data-testid="gl-add-error">
                  {addError}
                </div>
              ) : shortHint(newSlang) ? (
                <div className="gl-hint gl-add-msg" data-testid="gl-add-hint">
                  {SHORT_HINT}
                </div>
              ) : null}
            </form>

            {rowError && (
              <div className="gl-error gl-row-error" role="alert" data-testid="gl-row-error">
                {rowError}
              </div>
            )}

            {terms.length === 0 ? (
              <div data-testid="gl-empty">
                <EmptyState message="표가 비어 있어요. 위에서 용어를 추가하면 음성 검측에 바로 쓰입니다. (표가 비어 있으면 아무것도 바뀌지 않습니다)" />
              </div>
            ) : rows.length === 0 ? (
              <div className="gl-state" data-testid="gl-no-match">
                ‘{query.trim()}’에 맞는 용어가 없어요.
              </div>
            ) : (
              <div className="gl-table-wrap">
                <table className="gl-table" data-testid="gl-table">
                  <thead>
                    <tr>
                      <th className="gl-col-slang">현장 은어</th>
                      <th className="gl-col-standard">표준 용어</th>
                      <th className="gl-col-act">
                        <span className="gl-sr">작업</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) =>
                      editId === t.id ? (
                        <tr key={t.id} className="gl-row is-editing" data-testid="gl-row">
                          <td colSpan={3}>
                            <div className="gl-edit">
                              <div className="field">
                                <label htmlFor={`gl-edit-slang-${t.id}`}>현장 은어</label>
                                <input
                                  id={`gl-edit-slang-${t.id}`}
                                  className="input"
                                  value={editSlang}
                                  maxLength={GLOSSARY_LIMITS.slang}
                                  disabled={busy === "edit"}
                                  onChange={(e) => {
                                    setEditSlang(e.target.value);
                                    setEditError("");
                                  }}
                                  onKeyDown={onEditKey}
                                  autoComplete="off"
                                  autoFocus
                                  data-testid="gl-edit-slang"
                                />
                              </div>
                              <div className="field">
                                <label htmlFor={`gl-edit-standard-${t.id}`}>표준 용어</label>
                                <input
                                  id={`gl-edit-standard-${t.id}`}
                                  className="input"
                                  value={editStandard}
                                  maxLength={GLOSSARY_LIMITS.standard}
                                  disabled={busy === "edit"}
                                  onChange={(e) => {
                                    setEditStandard(e.target.value);
                                    setEditError("");
                                  }}
                                  onKeyDown={onEditKey}
                                  autoComplete="off"
                                  data-testid="gl-edit-standard"
                                />
                              </div>
                              <div className="gl-actions">
                                <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit} disabled={busy === "edit"} data-testid="gl-edit-save">
                                  {busy === "edit" ? "저장 중…" : "저장"}
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={busy === "edit"} data-testid="gl-edit-cancel">
                                  취소
                                </button>
                              </div>
                              {editError ? (
                                <div className="gl-error gl-edit-msg" role="alert" data-testid="gl-edit-error">
                                  {editError}
                                </div>
                              ) : shortHint(editSlang) ? (
                                <div className="gl-hint gl-edit-msg">{SHORT_HINT}</div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={t.id} ref={t.id === flashId ? flashRow : null} className={`gl-row${t.id === flashId ? " is-flash" : ""}`} data-testid="gl-row">
                          <td className="gl-slang" data-testid="gl-cell-slang">
                            {t.slang}
                          </td>
                          <td data-testid="gl-cell-standard">{t.standard}</td>
                          <td>
                            {deleteId === t.id ? (
                              <div className="gl-confirm" role="group" aria-label={`${t.slang} 삭제 확인`}>
                                <span>삭제할까요?</span>
                                <div className="gl-actions">
                                  <button type="button" className="btn btn-fail btn-sm" onClick={() => confirmDelete(t)} disabled={!!busy} data-testid="gl-delete-confirm">
                                    {busy === "delete" ? "삭제 중…" : "삭제"}
                                  </button>
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteId("")} disabled={!!busy} data-testid="gl-delete-cancel">
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="gl-actions">
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(t)} disabled={!!busy} aria-label={`${t.slang} 수정`} data-testid="gl-edit">
                                  수정
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => askDelete(t)} disabled={!!busy} aria-label={`${t.slang} 삭제`} data-testid="gl-delete">
                                  삭제
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
