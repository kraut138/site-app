import React, { useState } from "react";
import { EmptyState, StatusBadge, CategoryTag } from "./UI.jsx";
import { CATEGORIES, unitOptions, categoryProgress } from "../data.js";
import { parseDxf } from "../dxf.js";
import DrawingPin from "./DrawingPin.jsx";
import RevolverSelector from "./RevolverSelector.jsx";
import GolguDiagram from "./GolguDiagram.jsx";

export default function SiteLayout({
  buildings,
  unitFloorPlan,
  onUpdateUnitFloorPlan,
  inspections,
  checklistItems,
  progress,
  notify,
}) {
  const [unitPlanBusy, setUnitPlanBusy] = useState(false);
  const [unitPlanError, setUnitPlanError] = useState("");
  const [finderBuildingId, setFinderBuildingId] = useState(buildings[0]?.id || "");
  const [finderFloor, setFinderFloor] = useState(1);
  const [finderUnit, setFinderUnit] = useState("01");

  const hasUnitPlan = !!(unitFloorPlan && unitFloorPlan.shapes);
  const finderBuilding = buildings.find((b) => b.id === finderBuildingId) || buildings[0] || null;

  function handleFinderSelectBuilding(id) {
    setFinderBuildingId(id);
    setFinderFloor(1);
    setFinderUnit("01");
  }

  async function handleUnitPlanUpload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.dxf$/i.test(file.name)) {
      setUnitPlanError("DXF 파일만 업로드할 수 있습니다.");
      return;
    }
    setUnitPlanBusy(true);
    setUnitPlanError("");
    try {
      const text = await file.text();
      const parsed = parseDxf(text);
      await onUpdateUnitFloorPlan(parsed);
      notify(parsed.truncated ? "호실 평면도를 업로드했습니다 (도형이 많아 일부만 표시됩니다)." : "호실 평면도를 업로드했습니다.");
    } catch (err) {
      setUnitPlanError(err.message);
    } finally {
      setUnitPlanBusy(false);
    }
  }

  async function handleUnitPlanClear() {
    setUnitPlanBusy(true);
    try {
      await onUpdateUnitFloorPlan({ shapes: null, bounds: null, truncated: null });
      notify("호실 평면도를 기본값으로 되돌렸습니다.");
    } finally {
      setUnitPlanBusy(false);
    }
  }

  if (buildings.length === 0) {
    return (
      <div className="card">
        <EmptyState message="먼저 동 관리 탭에서 동을 등록해주세요." />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-2" style={{ alignItems: "start", marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="section-head">
            <div className="section-title">골구도</div>
            <span className="eyebrow">전체 동 · 완료 세대 표시</span>
          </div>
          <GolguDiagram buildings={buildings} progress={progress} checklistItems={checklistItems} />
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div className="section-title">호실 빠른 찾기</div>
            <span className="eyebrow">DRAG TO SELECT</span>
          </div>

          <RevolverSelector buildings={buildings} selectedId={finderBuildingId || buildings[0]?.id} onSelect={handleFinderSelectBuilding} />

          {finderBuilding && (
            <div style={{ marginTop: 18 }}>
              <div className="field-row">
                <div className="field">
                  <label>층</label>
                  <select className="input" value={finderFloor} onChange={(e) => setFinderFloor(Number(e.target.value))}>
                    {Array.from({ length: finderBuilding.floors || 1 }, (_, i) => i + 1)
                      .reverse()
                      .map((f) => (
                        <option key={f} value={f}>{f}층</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label>호</label>
                <div className="unit-picker-row">
                  {unitOptions(finderBuilding.unitsPerFloor).map((u) => (
                    <button key={u} className={`unit-picker-btn${finderUnit === u ? " active" : ""}`} onClick={() => setFinderUnit(u)}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <UnitQuickInfo
                building={finderBuilding}
                floor={finderFloor}
                unit={finderUnit}
                inspections={inspections}
                checklistItems={checklistItems}
                unitFloorPlan={unitFloorPlan}
              />
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div className="section-title">호실 내부 평면도</div>
          <span className="eyebrow">{hasUnitPlan ? "DXF 도면 적용됨" : "예시 평면도 사용 중"}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
          검측관리·NCR·호실 정보·대시보드에서 위치를 표시하는 데 쓰이는 호실 내부 평면도입니다. DXF 도면을 올리면 모든 화면에 바로 반영됩니다.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
            {unitPlanBusy ? "처리 중…" : hasUnitPlan ? "DXF 변경" : "DXF 파일 업로드"}
            <input type="file" accept=".dxf" hidden onChange={handleUnitPlanUpload} disabled={unitPlanBusy} />
          </label>
          {hasUnitPlan && (
            <button className="btn btn-ghost btn-sm" onClick={handleUnitPlanClear} disabled={unitPlanBusy}>
              예시 평면도로 되돌리기
            </button>
          )}
          {hasUnitPlan && <span className="chip">도형 {unitFloorPlan.shapes.length}개</span>}
        </div>
        {unitPlanError && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 12 }}>{unitPlanError}</div>}
        <div style={{ maxWidth: 460 }}>
          <DrawingPin dxfData={hasUnitPlan ? unitFloorPlan : null} />
        </div>
      </div>
    </div>
  );
}

function UnitQuickInfo({ building, floor, unit, inspections, checklistItems, unitFloorPlan }) {
  const pins = (inspections || [])
    .filter((i) => i.buildingId === building.id && String(i.floor) === String(floor) && i.unit === unit && i.pin)
    .map((i) => {
      const cat = CATEGORIES.find((c) => c.id === i.categoryId);
      return { x: i.pin.x, y: i.pin.y, color: cat?.color };
    });

  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>
        {building.name} {floor}층 {unit}호
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
        {CATEGORIES.map((c) => {
          const prog = categoryProgress(inspections, checklistItems, building.id, floor, unit, c.id);
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CategoryTag category={c} />
              <div style={{ flex: 1, height: 6, borderRadius: 4, background: "var(--surface-alt)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${prog.percent}%`,
                    height: "100%",
                    background: prog.status === "반려" ? "var(--fail)" : prog.status === "승인" ? "var(--pass)" : "var(--pending)",
                  }}
                />
              </div>
              <StatusBadge status={prog.status} />
            </div>
          );
        })}
      </div>
      <div style={{ maxWidth: 340 }}>
        <DrawingPin pins={pins} dxfData={unitFloorPlan?.shapes ? unitFloorPlan : null} />
      </div>
    </div>
  );
}
