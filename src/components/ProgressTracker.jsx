import React, { useState } from "react";
import { CATEGORIES, itemsForCategory, unitOptions, ROLES } from "../data.js";
import { Icon } from "./UI.jsx";
import ConfirmationRequestForm from "./ConfirmationRequestForm.jsx";

const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "safety");
const STATUSES = ["착수", "진행중", "완료"];
const STATUS_BG = { 미착수: "var(--surface)", 착수: "#fdf1de", 진행중: "#e3f0fa", 완료: "#e5f3ea" };
const STATUS_BORDER = { 미착수: "var(--line-strong)", 착수: "var(--pending)", 진행중: "#3e7cb1", 완료: "var(--pass)" };
const STATUS_TEXT = { 미착수: "var(--ink-faint)", 착수: "#8a5a12", 진행중: "#215480", 완료: "#276b45" };

function firstItemId(items) {
  for (const c of VISIBLE_CATEGORIES) {
    const first = itemsForCategory(items, c.id)[0];
    if (first) return first.id;
  }
  return "";
}

export default function ProgressTracker({
  role,
  buildings,
  items,
  progress,
  unitFloorPlans,
  onSetStatusBatch,
  onClearStatusBatch,
  onCreateConfirmationRequest,
  notify,
}) {
  const [buildingId, setBuildingId] = useState(buildings[0]?.id || "");
  const [itemId, setItemId] = useState(firstItemId(items));
  const [selectedUnits, setSelectedUnits] = useState(new Set()); // "floor-unit"
  const [busy, setBusy] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const canEdit = role === ROLES.SUB;

  const building = buildings.find((b) => b.id === buildingId) || null;
  const selectedItem = items.find((i) => i.id === itemId) || null;
  const floorsList = building ? Array.from({ length: building.floors || 1 }, (_, i) => i + 1).reverse() : [];
  const unitsPerFloorList = building ? unitOptions(building.unitsPerFloor) : [];

  function unitKey(floor, unit) {
    return `${floor}-${unit}`;
  }

  function statusFor(floor, unit) {
    const rec = progress.find((p) => p.buildingId === buildingId && p.itemId === itemId && String(p.floor) === String(floor) && p.unit === unit);
    return rec ? rec.status : "미착수";
  }

  function toggleUnit(floor, unit) {
    const key = unitKey(floor, unit);
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleFloor(floor) {
    const keys = unitsPerFloorList.map((u) => unitKey(floor, u));
    const allOn = keys.every((k) => selectedUnits.has(k));
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  function selectAllUnits() {
    const all = new Set();
    floorsList.forEach((f) => unitsPerFloorList.forEach((u) => all.add(unitKey(f, u))));
    setSelectedUnits(all);
  }

  function handleBuildingChange(id) {
    setBuildingId(id);
    setSelectedUnits(new Set());
  }

  function handleItemChange(id) {
    setItemId(id);
    setSelectedUnits(new Set());
  }

  function unitsFromSelection() {
    return Array.from(selectedUnits).map((key) => {
      const [floorStr, unit] = key.split("-");
      return { floor: Number(floorStr), unit };
    });
  }

  async function handleApply(status) {
    if (selectedUnits.size === 0) return;
    setBusy(true);
    try {
      const units = unitsFromSelection();
      await onSetStatusBatch(buildingId, units, itemId, selectedItem.categoryId, status);
      notify(`${units.length}개 호실을 "${status}"(으)로 표시했습니다.`);
      setSelectedUnits(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (selectedUnits.size === 0) return;
    setBusy(true);
    try {
      const units = unitsFromSelection();
      await onClearStatusBatch(buildingId, units, itemId);
      notify(`${units.length}개 호실의 표시를 초기화했습니다.`);
      setSelectedUnits(new Set());
    } finally {
      setBusy(false);
    }
  }

  if (buildings.length === 0) {
    return (
      <div className="card">
        <div style={{ padding: 20, fontSize: 12.5, color: "var(--ink-faint)" }}>먼저 동 관리 탭에서 동을 등록해주세요.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="field-row" style={{ margin: 0 }}>
          <div className="field">
            <label>동 선택</label>
            <select className="input" value={buildingId} onChange={(e) => handleBuildingChange(e.target.value)}>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>세부공종 선택</label>
            <select className="input" value={itemId} onChange={(e) => handleItemChange(e.target.value)}>
              {VISIBLE_CATEGORIES.map((c) => {
                const catItems = itemsForCategory(items, c.id);
                if (catItems.length === 0) return null;
                return (
                  <optgroup key={c.id} label={c.name}>
                    {catItems.map((it) => (
                      <option key={it.id} value={it.id}>{it.text}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowRequestForm(true)}>
            <Icon.Plus width="15" height="15" />
            공사 확인 요청
          </button>
        )}
      </div>

      {!selectedItem ? (
        <div className="card">
          <div style={{ padding: 20, fontSize: 12.5, color: "var(--ink-faint)" }}>등록된 체크리스트 항목이 없습니다. 감리검측 탭에서 먼저 항목을 추가해주세요.</div>
        </div>
      ) : (
        <div className="card card-pad">
          <div className="section-head">
            <div className="section-title">{building?.name} · 호실별 진행 현황</div>
            <span className="eyebrow">{selectedItem.text}</span>
          </div>

          {canEdit && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllUnits}>
                이 동 전체 선택
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedUnits(new Set())}>
                선택 해제
              </button>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginLeft: "auto", fontSize: 11.5 }}>
                {STATUSES.map((s) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, border: `1.5px solid ${STATUS_BORDER[s]}`, background: STATUS_BG[s] }} />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius-s)", padding: "8px 10px" }}>
            {floorsList.map((f) => {
              const keys = unitsPerFloorList.map((u) => unitKey(f, u));
              const allOn = keys.every((k) => selectedUnits.has(k));
              return (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                  <button
                    type="button"
                    onClick={() => canEdit && toggleFloor(f)}
                    className="mono"
                    style={{
                      width: 42,
                      flexShrink: 0,
                      fontSize: 12,
                      fontWeight: 700,
                      color: allOn ? "var(--blueprint)" : "var(--ink-faint)",
                      background: "none",
                      border: "none",
                      cursor: canEdit ? "pointer" : "default",
                      textAlign: "left",
                      padding: 0,
                    }}
                  >
                    {f}층
                  </button>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {unitsPerFloorList.map((u) => {
                      const status = statusFor(f, u);
                      const key = unitKey(f, u);
                      const picked = selectedUnits.has(key);
                      return (
                        <button
                          type="button"
                          key={u}
                          disabled={!canEdit}
                          onClick={() => toggleUnit(f, u)}
                          title={`${f}층 ${u}호 · ${status}`}
                          style={{
                            minWidth: 36,
                            padding: "5px 8px",
                            fontSize: 11.5,
                            fontWeight: 600,
                            borderRadius: "var(--radius-s)",
                            background: STATUS_BG[status],
                            border: `1.5px solid ${STATUS_BORDER[status]}`,
                            color: STATUS_TEXT[status],
                            boxShadow: picked ? "0 0 0 2px var(--blueprint-deep)" : "none",
                            cursor: canEdit ? "pointer" : "default",
                          }}
                        >
                          {u}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {canEdit && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "var(--ink-soft)", marginRight: 4 }}>
                {selectedUnits.size > 0 ? `${selectedUnits.size}개 호실 선택됨 →` : "호실을 선택하면 아래 버튼으로 일괄 적용됩니다"}
              </span>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="btn btn-sm"
                  disabled={busy || selectedUnits.size === 0}
                  onClick={() => handleApply(s)}
                  style={{ background: STATUS_BORDER[s], color: "#fff", border: "none" }}
                >
                  {s} 처리
                </button>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy || selectedUnits.size === 0} onClick={handleReset}>
                초기화
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "flex-start", color: "var(--ink-soft)", fontSize: 12.5 }}>
        <Icon.Bell width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          여기서 표시하는 진행 단계는 하도급사가 스스로 기록하는 참고용 현황이며, 감리단의 정식 승인 절차(감리검측 탭)와는 별개입니다.
          {!canEdit ? " 감리단/소장은 조회만 가능합니다." : ""}
        </span>
      </div>

      {showRequestForm && (
        <ConfirmationRequestForm
          buildings={buildings}
          checklistItems={items}
          unitFloorPlans={unitFloorPlans}
          onClose={() => setShowRequestForm(false)}
          onSubmit={async (data) => {
            const created = await onCreateConfirmationRequest(data);
            setShowRequestForm(false);
            notify(created.length > 1 ? `${created.length}개 호실에 대해 공사 확인을 요청했습니다.` : "공사 확인을 요청했습니다.");
          }}
        />
      )}
    </div>
  );
}
