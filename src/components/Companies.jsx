import React, { useMemo, useState } from "react";
import { itemsForCategory } from "../data.js";
import { Icon } from "./UI.jsx";
import { COMPANY_LIMITS, checkCompanyDraft, describeCompanyTrades, tradeChoices } from "../companies.js";

/**
 * "6. 검측·NCR·표준 공종 → 업체·담당 공종" - 관리자가 협력업체 이름과 그 업체가 맡은 공종을 등록하는 화면(관리자 전용이라 한국어로만 적는다).
 *   등록한 업체는 검측 · NCR · 표준 공종 화면에 담당 업체로 보이고, 녹음에서 그 업체 이름을 말하면(companies.js가 읽는다)
 *   그 업체의 담당 공종과 이어져 작업일보 · TBM 일지 · 검측요청서에 업체명과 공종이 함께 적힌다.
 * 공종은 공종 전체를 맡았는지, 표준 공종의 세부 공종(도배·바닥마감처럼 항목 글)만 맡았는지 고른다. 세부 공종은 항목 id가 아니라 글로 저장한다
 *   ('기본값으로 초기화'하면 표준 공종 항목 id가 새로 만들어지지만 글은 그대로이기 때문이다).
 */

function emptyForm() {
  return { id: "", name: "", aliases: "", trades: {} };
}

function formFrom(company) {
  const trades = {};
  for (const t of company.trades) trades[t.id] = { mode: t.items.length ? "items" : "all", items: t.items.slice() };
  return { id: company.id, name: company.name, aliases: company.aliases.join(", "), trades };
}

export default function Companies({ companies = [], checklistItems = [], onSave, notify }) {
  const [form, setForm] = useState(null); // null이면 목록만 보인다
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const choices = useMemo(() => tradeChoices(), [companies, checklistItems]); // 직접 추가한 공종은 읽어 온 뒤 등록되므로 목록이 바뀔 때 다시 읽는다
  const tradeNames = useMemo(() => Object.fromEntries(choices.map((c) => [c.id, c.name])), [choices]);
  const sorted = useMemo(() => [...companies].sort((a, b) => a.name.localeCompare(b.name, "ko")), [companies]);

  const draft = useMemo(
    () => (form ? checkCompanyDraft({ ...form, trades: Object.entries(form.trades).map(([id, v]) => ({ id, mode: v.mode, items: v.items })), tradeNames }, companies, { isNew: !form.id }) : null),
    [form, companies, tradeNames]
  );

  function openNew() {
    setError("");
    setConfirmId("");
    setForm(emptyForm());
  }
  function openEdit(c) {
    setError("");
    setConfirmId("");
    setForm(formFrom(c));
  }
  function closeForm() {
    setForm(null);
    setError("");
  }
  function patch(p) {
    setError("");
    setForm((f) => ({ ...f, ...p }));
  }
  function toggleTrade(id) {
    setError("");
    setForm((f) => {
      const trades = { ...f.trades };
      if (trades[id]) delete trades[id];
      else trades[id] = { mode: "all", items: [] };
      return { ...f, trades };
    });
  }
  function setMode(id, mode) {
    setError("");
    setForm((f) => ({ ...f, trades: { ...f.trades, [id]: { ...f.trades[id], mode } } }));
  }
  function toggleItem(id, text) {
    setError("");
    setForm((f) => {
      const cur = f.trades[id];
      const has = cur.items.includes(text);
      const items = has ? cur.items.filter((x) => x !== text) : [...cur.items, text];
      return { ...f, trades: { ...f.trades, [id]: { ...cur, items } } };
    });
  }

  async function persist(next, doneMessage) {
    setBusy(true);
    setError("");
    try {
      await onSave(next);
      if (notify) notify(doneMessage);
      return true;
    } catch {
      setError("저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!draft || !draft.ok) {
      setError(draft ? draft.error : "");
      return;
    }
    const exists = companies.some((c) => c.id === draft.company.id);
    const next = exists ? companies.map((c) => (c.id === draft.company.id ? draft.company : c)) : [...companies, draft.company];
    const done = await persist(next, exists ? `${draft.company.name} 정보를 고쳤어요.` : `${draft.company.name} 업체를 등록했어요.`);
    if (done) setForm(null);
  }

  async function remove(c) {
    const done = await persist(
      companies.filter((x) => x.id !== c.id),
      `${c.name} 업체를 삭제했어요.`
    );
    if (done) setConfirmId("");
  }

  return (
    <div data-testid="companies">
      <div className="card card-pad co-intro" data-testid="co-intro">
        <div className="section-head">
          <div className="section-title">업체 · 담당 공종</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={openNew} disabled={busy || !!form} data-testid="co-add">
            <Icon.Plus width="14" height="14" />
            업체 등록
          </button>
        </div>
        <p className="co-help">
          협력업체 이름과 그 업체가 맡은 공종을 등록해 두세요. 등록한 업체는 <strong>검측 · NCR · 표준 공종</strong> 화면에 담당 업체로 보여요. 또 <strong>녹음에서 그 업체 이름을 말하면</strong> 담당 공종과 이어서{" "}
          <strong>작업일보 · TBM 일지 · 검측요청서</strong>에 업체명과 공종을 함께 적어요.
        </p>
        <p className="co-help co-help-example">
          예) “한빛도배 소속 홍길동입니다. 101동 502호 도배 완료했어요.” — 이름을 조금 다르게 알아들어도 5글자 이상 이름은 가장 비슷한 업체로 이어 줘요. 이름이 짧거나 공종 이름과 같으면 ‘소속’을 붙여 말해야 정확해요.
        </p>
      </div>

      {form && (
        <form className="card card-pad co-form" onSubmit={submit} data-testid="co-form">
          <div className="section-head">
            <div className="section-title">{form.id ? "업체 정보 고치기" : "새 업체 등록"}</div>
          </div>
          <div className="grid grid-2 co-fields">
            <div className="field">
              <label htmlFor="co-name">업체 이름</label>
              <input
                id="co-name"
                className="input"
                value={form.name}
                maxLength={COMPANY_LIMITS.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="예: 한빛도배"
                autoComplete="off"
                data-testid="co-name"
              />
            </div>
            <div className="field">
              <label htmlFor="co-aliases">줄여 부르는 이름 (선택)</label>
              <input
                id="co-aliases"
                className="input"
                value={form.aliases}
                onChange={(e) => patch({ aliases: e.target.value })}
                placeholder="예: 한빛 (쉼표로 나눠 5개까지)"
                autoComplete="off"
                data-testid="co-aliases"
              />
            </div>
          </div>

          <div className="co-trades-title">담당 공종 (선택)</div>
          <div className="co-trades" data-testid="co-trades">
            {choices.map((c) => {
              const on = form.trades[c.id];
              const standard = itemsForCategory(checklistItems, c.id).map((i) => i.text);
              const picked = on ? on.items : [];
              const extra = picked.filter((x) => !standard.includes(x)); // 표준 공종 항목에서 지워진 글도 보여 줘서 뺄 수 있게 한다
              const options = [...standard, ...extra];
              return (
                <div key={c.id} className={`co-trade${on ? " is-on" : ""}`} data-testid={`co-trade-${c.id}`}>
                  <label className="co-trade-head">
                    <input type="checkbox" checked={!!on} onChange={() => toggleTrade(c.id)} data-testid={`co-trade-check-${c.id}`} />
                    <span className="co-dot" style={{ background: c.color }} />
                    <span className="co-trade-name">{c.name}</span>
                    {c.custom && <span className="co-tag">추가 공종</span>}
                  </label>
                  {on && options.length > 0 && (
                    <div className="co-trade-body">
                      <div className="co-mode">
                        <label>
                          <input type="radio" name={`co-mode-${c.id}`} checked={on.mode === "all"} onChange={() => setMode(c.id, "all")} data-testid={`co-mode-all-${c.id}`} /> 공종 전체
                        </label>
                        <label>
                          <input type="radio" name={`co-mode-${c.id}`} checked={on.mode === "items"} onChange={() => setMode(c.id, "items")} data-testid={`co-mode-items-${c.id}`} /> 세부 공종만
                        </label>
                      </div>
                      {on.mode === "items" && (
                        <div className="co-items" data-testid={`co-items-${c.id}`}>
                          {options.map((text) => (
                            <button
                              key={text}
                              type="button"
                              className={`co-item${picked.includes(text) ? " is-on" : ""}${standard.includes(text) ? "" : " is-gone"}`}
                              aria-pressed={picked.includes(text)}
                              onClick={() => toggleItem(c.id, text)}
                              title={standard.includes(text) ? undefined : "표준 공종 항목에서 지워진 글이에요"}
                              data-testid={`co-item-${c.id}`}
                            >
                              {text}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {draft && draft.ok && draft.warnings.length > 0 && (
            <div className="co-warn" role="status" data-testid="co-warn">
              {draft.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}
          {(error || (form.name.trim() && draft && !draft.ok)) && (
            <div className="co-error" role="alert" data-testid="co-error">
              {error || draft.error}
            </div>
          )}
          <div className="co-form-foot">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft || !draft.ok} data-testid="co-save">
              <Icon.Check width="14" height="14" />
              {form.id ? "저장" : "등록"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={closeForm} disabled={busy} data-testid="co-cancel">
              취소
            </button>
          </div>
        </form>
      )}

      <div className="card card-pad co-list-card" data-testid="co-list">
        <div className="section-head">
          <div className="section-title">
            등록한 업체 <span className="eyebrow mono">{sorted.length}곳</span>
          </div>
        </div>
        {error && !form && (
          <div className="co-error" role="alert" data-testid="co-list-error">
            {error}
          </div>
        )}
        {sorted.length === 0 ? (
          <div className="co-empty" data-testid="co-empty">
            아직 등록한 업체가 없어요. ‘업체 등록’을 눌러 업체 이름과 맡은 공종을 입력해 주세요.
          </div>
        ) : (
          <div>
            {sorted.map((c) => {
              const trades = describeCompanyTrades(c);
              return (
                <div className="co-row" key={c.id} data-testid="co-row" data-company={c.name}>
                  <div className="co-main">
                    <div className="co-name">
                      <span data-testid="co-row-name">{c.name}</span>
                      {c.aliases.length > 0 && <span className="co-alias">줄임말 {c.aliases.join(", ")}</span>}
                    </div>
                    <div className={`co-row-trades${trades ? "" : " is-none"}`} data-testid="co-row-trades">
                      {trades || "담당 공종 없음 (이름만 등록)"}
                    </div>
                  </div>
                  <div className="co-actions">
                    {confirmId === c.id ? (
                      <>
                        <span className="co-confirm">삭제할까요?</span>
                        <button type="button" className="btn btn-fail btn-sm" disabled={busy} onClick={() => remove(c)} data-testid="co-delete-yes">
                          삭제
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmId("")} data-testid="co-delete-no">
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !!form} onClick={() => openEdit(c)} data-testid="co-edit">
                          고치기
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: 5 }}
                          disabled={busy || !!form}
                          onClick={() => setConfirmId(c.id)}
                          aria-label={`${c.name} 삭제`}
                          data-testid="co-delete"
                        >
                          <Icon.Trash width="13" height="13" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
