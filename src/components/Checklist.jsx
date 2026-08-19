import React, { useState } from "react";
import { CATEGORIES, ROLES, itemsForCategory, DEFAULT_ITEMS_BY_CATEGORY } from "../data.js";
import { Icon } from "./UI.jsx";

// 안전/환경은 별도 "안전 현황" 탭에서 다루므로 이 탭에서는 제외
const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "safety");

export default function Checklist({ role, items, onCreateItem, onDeleteItem, onResetCategory, notify }) {
  const [openId, setOpenId] = useState(VISIBLE_CATEGORIES[0].id);
  const [newText, setNewText] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetConfirmId, setResetConfirmId] = useState(null);
  const canEdit = role === ROLES.SUPER;

  async function handleAdd(e) {
    e.preventDefault();
    if (!newText.trim()) return;
    setBusy(true);
    try {
      await onCreateItem({ categoryId: openId, text: newText.trim() });
      setNewText("");
      notify("체크리스트 항목을 추가했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    setBusy(true);
    try {
      await onDeleteItem(id);
      notify("체크리스트 항목을 삭제했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(categoryId) {
    setBusy(true);
    try {
      await onResetCategory(categoryId, DEFAULT_ITEMS_BY_CATEGORY[categoryId] || []);
      notify("체크리스트를 기본값으로 초기화했습니다.");
    } finally {
      setBusy(false);
      setResetConfirmId(null);
    }
  }

  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        {VISIBLE_CATEGORIES.map((c) => {
          const count = itemsForCategory(items, c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => {
                setOpenId(c.id);
                setResetConfirmId(null);
              }}
              className="card"
              style={{
                padding: "16px 16px",
                textAlign: "left",
                cursor: "pointer",
                borderColor: openId === c.id ? c.color : undefined,
                borderWidth: openId === c.id ? 2 : 1,
                boxShadow: openId === c.id ? `0 0 0 3px ${c.color}22` : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color, display: "inline-block" }} />
                <span className="eyebrow">{count}개 항목</span>
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{c.description}</div>
            </button>
          );
        })}
      </div>

      {VISIBLE_CATEGORIES.filter((c) => c.id === openId).map((c) => {
        const catItems = itemsForCategory(items, c.id);
        return (
          <div className="card card-pad" key={c.id}>
            <div className="section-head">
              <div className="section-title">
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: "inline-block" }} />
                {c.name} 표준 체크리스트
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="eyebrow mono">TEMPLATE · {c.id.toUpperCase()}</span>
                {canEdit && DEFAULT_ITEMS_BY_CATEGORY[c.id] && (
                  resetConfirmId === c.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: "var(--fail)" }}>현재 항목을 모두 지우고 기본값으로 바꿀까요?</span>
                      <button className="btn btn-fail btn-sm" disabled={busy} onClick={() => handleReset(c.id)}>확인</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setResetConfirmId(null)}>취소</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setResetConfirmId(c.id)}>
                      기본값으로 초기화
                    </button>
                  )
                )}
              </div>
            </div>
            {catItems.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--ink-faint)", padding: "10px 4px" }}>등록된 항목이 없습니다.</div>
            ) : (
              <div className="grid grid-2">
                {catItems.map((item, i) => (
                  <div
                    key={item.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid var(--line)" }}
                  >
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ fontSize: 13.5, flex: 1 }}>{item.text}</span>
                    {canEdit && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: 5, flexShrink: 0 }}
                        disabled={busy}
                        onClick={() => handleDelete(item.id)}
                        aria-label="삭제"
                      >
                        <Icon.Trash width="13" height="13" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
              <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <input
                  className="input"
                  placeholder={`${c.name}에 새 항목 추가`}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary btn-sm" disabled={busy || !newText.trim()}>
                  <Icon.Plus width="14" height="14" />
                  추가
                </button>
              </form>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "flex-start", color: "var(--ink-soft)", fontSize: 12.5 }}>
        <Icon.Bell width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          이 템플릿은 검측관리 탭에서 검측 요청을 작성할 때 자동으로 불러와 항목별로 체크할 수 있습니다. 안전/환경 공종은 "안전 현황" 탭에서 별도로 관리합니다.
          {canEdit ? " 항목 추가·삭제는 감리단/소장만 가능합니다." : ""}
        </span>
      </div>
    </div>
  );
}
