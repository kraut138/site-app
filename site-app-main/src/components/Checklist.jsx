import React, { useState } from "react";
import { CATEGORIES, ROLES, isAdminRole, itemsForCategory, DEFAULT_ITEMS_BY_CATEGORY } from "../data.js";
import { Icon } from "./UI.jsx";
import { useLanguage } from "../LanguageContext.jsx";

// 안전/환경은 별도 "안전 현황" 탭에서 다루므로 이 탭에서는 제외
const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "safety");

export default function Checklist({ role, items, onCreateItem, onDeleteItem, onResetCategory, onReorderItems, notify }) {
  const { t } = useLanguage();
  const [openId, setOpenId] = useState(VISIBLE_CATEGORIES[0].id);
  const [newText, setNewText] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetConfirmId, setResetConfirmId] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const canEdit = isAdminRole(role);

  async function commitReorder(categoryId, newOrderItems) {
    try {
      await onReorderItems(categoryId, newOrderItems.map((i) => i.id));
    } catch (err) {
      notify(t("checklist.reorderFailed"));
    }
  }

  function handleDragStart(e, index) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (index !== dragOverIndex) setDragOverIndex(index);
  }

  function handleDrop(e, index, catItems, categoryId) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reordered = [...catItems];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    setDragIndex(null);
    setDragOverIndex(null);
    commitReorder(categoryId, reordered);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function moveItem(catItems, categoryId, index, direction) {
    const target = index + direction;
    if (target < 0 || target >= catItems.length) return;
    const reordered = [...catItems];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    commitReorder(categoryId, reordered);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!newText.trim()) return;
    setBusy(true);
    try {
      await onCreateItem({ categoryId: openId, text: newText.trim() });
      setNewText("");
      notify(t("checklist.itemAdded"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    setBusy(true);
    try {
      await onDeleteItem(id);
      notify(t("checklist.itemDeleted"));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(categoryId) {
    setBusy(true);
    try {
      await onResetCategory(categoryId, DEFAULT_ITEMS_BY_CATEGORY[categoryId] || []);
      notify(t("checklist.resetDone"));
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
                <span className="eyebrow">{t("checklist.itemCount", { count })}</span>
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{t(`category.${c.id}.name`)}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{t(`category.${c.id}.description`)}</div>
            </button>
          );
        })}
      </div>

      {VISIBLE_CATEGORIES.filter((c) => c.id === openId).map((c) => {
        const catItems = itemsForCategory(items, c.id);
        const catName = t(`category.${c.id}.name`);
        return (
          <div className="card card-pad" key={c.id}>
            <div className="section-head">
              <div className="section-title">
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: "inline-block" }} />
                {t("checklist.standardTitle", { name: catName })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="eyebrow mono">TEMPLATE · {c.id.toUpperCase()}</span>
                {canEdit && DEFAULT_ITEMS_BY_CATEGORY[c.id] && (
                  resetConfirmId === c.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: "var(--fail)" }}>{t("checklist.resetConfirm")}</span>
                      <button className="btn btn-fail btn-sm" disabled={busy} onClick={() => handleReset(c.id)}>{t("checklist.confirm")}</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setResetConfirmId(null)}>{t("checklist.cancel")}</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setResetConfirmId(c.id)}>
                      {t("checklist.resetToDefault")}
                    </button>
                  )
                )}
              </div>
            </div>
            {catItems.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--ink-faint)", padding: "10px 4px" }}>{t("checklist.empty")}</div>
            ) : (
              <div>
                {catItems.map((item, i) => (
                  <div
                    key={item.id}
                    draggable={canEdit}
                    onDragStart={canEdit ? (e) => handleDragStart(e, i) : undefined}
                    onDragOver={canEdit ? (e) => handleDragOver(e, i) : undefined}
                    onDrop={canEdit ? (e) => handleDrop(e, i, catItems, c.id) : undefined}
                    onDragEnd={canEdit ? handleDragEnd : undefined}
                    className={`checklist-drag-row${dragIndex === i ? " dragging" : ""}${dragOverIndex === i && dragIndex !== null && dragIndex !== i ? " drag-over" : ""}`}
                  >
                    {canEdit && (
                      <span className="checklist-drag-handle" title={t("checklist.dragToReorder")}>
                        <Icon.Drag width="14" height="14" />
                      </span>
                    )}
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-faint)", width: 22, flexShrink: 0 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ fontSize: 13.5, flex: 1 }}>{item.text}</span>
                    {canEdit && (
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: 5 }}
                          disabled={busy || i === 0}
                          onClick={() => moveItem(catItems, c.id, i, -1)}
                          aria-label={t("checklist.moveUp")}
                        >
                          <Icon.ChevronRight width="13" height="13" style={{ transform: "rotate(-90deg)" }} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: 5 }}
                          disabled={busy || i === catItems.length - 1}
                          onClick={() => moveItem(catItems, c.id, i, 1)}
                          aria-label={t("checklist.moveDown")}
                        >
                          <Icon.ChevronRight width="13" height="13" style={{ transform: "rotate(90deg)" }} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: 5 }}
                          disabled={busy}
                          onClick={() => handleDelete(item.id)}
                          aria-label={t("checklist.delete")}
                        >
                          <Icon.Trash width="13" height="13" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
              <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <input
                  className="input"
                  placeholder={t("checklist.addPlaceholder", { name: catName })}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary btn-sm" disabled={busy || !newText.trim()}>
                  <Icon.Plus width="14" height="14" />
                  {t("checklist.add")}
                </button>
              </form>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "flex-start", color: "var(--ink-soft)", fontSize: 12.5 }}>
        <Icon.Bell width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          {t("checklist.hint")}
          {canEdit ? t("checklist.hintAdmin") : ""}
        </span>
      </div>
    </div>
  );
}
