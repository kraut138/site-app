import React, { useState } from "react";
import { Icon, EmptyState } from "./UI.jsx";
import { formatDate } from "../data.js";

export default function Buildings({ buildings, onCreate, onDelete, canEdit }) {
  const [form, setForm] = useState({ name: "", floors: "", unitsPerFloor: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!form.name || !form.floors || !form.unitsPerFloor) {
      setError("동 이름, 층수, 세대수를 모두 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreate({ name: form.name, floors: Number(form.floors), unitsPerFloor: Number(form.unitsPerFloor) });
      setForm({ name: "", floors: "", unitsPerFloor: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: canEdit ? "1fr 340px" : "1fr", alignItems: "start" }}>
      <div className="card">
        <div style={{ padding: "16px 20px 4px" }}>
          <div className="section-title">등록된 동 ({buildings.length})</div>
        </div>
        {buildings.length === 0 ? (
          <EmptyState message="등록된 동이 없습니다." />
        ) : (
          <div style={{ padding: "8px 4px" }}>
            {buildings.map((b) => (
              <div className="list-row" key={b.id} style={{ cursor: "default" }}>
                <Icon.Building width="18" height="18" style={{ color: "var(--blueprint)", flexShrink: 0 }} />
                <div className="grow">
                  <div className="title">{b.name}</div>
                  <div className="meta">
                    지상 {b.floors}층 · 층당 {b.unitsPerFloor}세대 · 총 {b.floors * b.unitsPerFloor}세대
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>{formatDate(b.createdAt)}</span>
                {canEdit && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onDelete(b.id)}
                    aria-label="삭제"
                    style={{ padding: 7 }}
                  >
                    <Icon.Trash width="14" height="14" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <form className="card card-pad" onSubmit={submit}>
          <div className="section-title" style={{ marginBottom: 14 }}>
            <Icon.Plus width="16" height="16" />새 동 추가
          </div>
          <div className="field">
            <label>동 이름</label>
            <input className="input" placeholder="예: 103동" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>총 층수</label>
              <input className="input" type="number" min="1" placeholder="20" value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })} />
            </div>
            <div className="field">
              <label>층당 세대수</label>
              <input className="input" type="number" min="1" placeholder="4" value={form.unitsPerFloor} onChange={(e) => setForm({ ...form, unitsPerFloor: e.target.value })} />
            </div>
          </div>
          {error && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "추가 중…" : "동 추가"}
          </button>
        </form>
      )}
    </div>
  );
}
