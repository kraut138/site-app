import React, { useState } from "react";
import { Icon, EmptyState } from "./UI.jsx";
import { formatDate, unitOptions } from "../data.js";
import { parseDxf } from "../dxf.js";
import DrawingPin from "./DrawingPin.jsx";

export default function Buildings({
  buildings,
  onCreate,
  onDelete,
  canEdit,
  unitFloorPlans,
  onCreateFloorPlan,
  onDeleteFloorPlan,
  notify,
}) {
  const [form, setForm] = useState({ name: "", floors: "", unitsPerFloor: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

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
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>동을 클릭하면 호실 평면도를 등록·관리할 수 있습니다.</div>
        </div>
        {buildings.length === 0 ? (
          <EmptyState message="등록된 동이 없습니다." />
        ) : (
          <div style={{ padding: "8px 4px" }}>
            {buildings.map((b) => {
              const expanded = expandedId === b.id;
              const plansForBuilding = unitFloorPlans.filter((p) => p.buildingId === b.id);
              return (
                <div key={b.id}>
                  <div
                    className="list-row"
                    style={{ cursor: "pointer" }}
                    onClick={() => setExpandedId(expanded ? null : b.id)}
                  >
                    <Icon.Building width="18" height="18" style={{ color: "var(--blueprint)", flexShrink: 0 }} />
                    <div className="grow">
                      <div className="title">{b.name}</div>
                      <div className="meta">
                        지상 {b.floors}층 · 층당 {b.unitsPerFloor}세대 · 총 {b.floors * b.unitsPerFloor}세대
                        {plansForBuilding.length > 0 ? ` · 평면도 ${plansForBuilding.length}종` : ""}
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>{formatDate(b.createdAt)}</span>
                    <Icon.ChevronRight
                      width="16"
                      height="16"
                      style={{ color: "var(--ink-faint)", flexShrink: 0, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}
                    />
                    {canEdit && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(b.id);
                        }}
                        aria-label="삭제"
                        style={{ padding: 7 }}
                      >
                        <Icon.Trash width="14" height="14" />
                      </button>
                    )}
                  </div>
                  {expanded && (
                    <BuildingFloorPlans
                      building={b}
                      canEdit={canEdit}
                      plans={plansForBuilding}
                      onCreateFloorPlan={onCreateFloorPlan}
                      onDeleteFloorPlan={onDeleteFloorPlan}
                      notify={notify}
                    />
                  )}
                </div>
              );
            })}
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

function BuildingFloorPlans({ building, canEdit, plans, onCreateFloorPlan, onDeleteFloorPlan, notify }) {
  const [selectedUnits, setSelectedUnits] = useState(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unitsList = unitOptions(building.unitsPerFloor);

  function toggleUnit(u) {
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  }

  async function handleUpload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.dxf$/i.test(file.name)) {
      setError("DXF 파일만 업로드할 수 있습니다.");
      return;
    }
    if (selectedUnits.size === 0) {
      setError("이 평면도를 적용할 호수를 1개 이상 선택해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const text = await file.text();
      const parsed = parseDxf(text);
      await onCreateFloorPlan({ buildingId: building.id, name: name.trim(), units: Array.from(selectedUnits), ...parsed });
      setSelectedUnits(new Set());
      setName("");
      notify(parsed.truncated ? "평면도를 등록했습니다 (도형이 많아 일부만 표시됩니다)." : "평면도를 등록했습니다.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    await onDeleteFloorPlan(id);
    notify("평면도를 삭제했습니다.");
  }

  return (
    <div
      style={{
        margin: "0 4px 12px",
        padding: 16,
        background: "var(--bg)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-m)",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>{building.name} 호실 평면도</div>

      {plans.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 16 }}>
          등록된 평면도가 없습니다. 등록하기 전까지는 이 동의 모든 호실이 예시 평면도로 표시됩니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {plans.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: 10,
                background: "var(--surface)",
                borderRadius: "var(--radius-s)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ width: 64, height: 50, flexShrink: 0 }}>
                <DrawingPin dxfData={p} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name || "이름 없음"}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  적용 호수: {p.units.join(", ")}호 · 도형 {p.shapes?.length || 0}개
                </div>
              </div>
              {canEdit && (
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(p.id)} aria-label="평면도 삭제" style={{ flexShrink: 0 }}>
                  <Icon.Trash width="13" height="13" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div style={{ paddingTop: 14, borderTop: plans.length > 0 ? "1px solid var(--line)" : "none" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>새 평면도 추가</div>
          <div className="field" style={{ marginBottom: 10, maxWidth: 280 }}>
            <label>평면도 이름 (선택)</label>
            <input className="input" placeholder="예: 84A타입" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>적용할 호수 선택</label>
            <div className="unit-picker-row">
              {unitsList.map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`unit-picker-btn${selectedUnits.has(u) ? " active" : ""}`}
                  onClick={() => toggleUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          {error && <div style={{ color: "var(--fail)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <label className="btn btn-primary btn-sm" style={{ cursor: "pointer", display: "inline-flex" }}>
            {busy ? "처리 중…" : "DXF 파일 업로드"}
            <input type="file" accept=".dxf" hidden onChange={handleUpload} disabled={busy} />
          </label>
        </div>
      )}
    </div>
  );
}
