import React, { useState, useEffect } from "react";
import { unitOptions } from "../data.js";
import { EmptyState } from "./UI.jsx";
import UnitDetailPanel from "./UnitDetailPanel.jsx";

export default function UnitInfo({
  buildings,
  inspections,
  checklistItems,
  unitNotes,
  unitFloorPlans,
  initialTarget,
  onConsumeInitialTarget,
  onCreateNote,
  onDeleteNote,
  notify,
}) {
  // QR 코드를 스캔해 들어온 경우 initialTarget에 {buildingId, floor, unit}이 담겨 있다.
  // 존재하지 않는 동을 가리키면(삭제된 경우 등) 안전하게 첫 번째 동으로 대체한다.
  const [buildingId, setBuildingId] = useState(() =>
    initialTarget && buildings.some((b) => b.id === initialTarget.buildingId) ? initialTarget.buildingId : buildings[0]?.id || ""
  );
  const [floor, setFloor] = useState(() => initialTarget?.floor || 1);
  const [unit, setUnit] = useState(() => initialTarget?.unit || "01");

  useEffect(() => {
    if (initialTarget && onConsumeInitialTarget) onConsumeInitialTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (buildings.length > 0 && !buildings.some((b) => b.id === buildingId)) {
      setBuildingId(buildings[0].id);
    }
  }, [buildings, buildingId]);

  const building = buildings.find((b) => b.id === buildingId) || null;

  if (buildings.length === 0) {
    return (
      <div className="card">
        <EmptyState message="먼저 동 관리 탭에서 동을 등록해주세요." />
      </div>
    );
  }

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="field-row" style={{ marginBottom: 0 }}>
          <div className="field">
            <label>동</label>
            <select
              className="input"
              value={buildingId}
              onChange={(e) => {
                setBuildingId(e.target.value);
                setFloor(1);
                setUnit("01");
              }}
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>층</label>
            <select className="input" value={floor} onChange={(e) => setFloor(Number(e.target.value))}>
              {building &&
                Array.from({ length: building.floors }, (_, i) => i + 1).map((f) => (
                  <option key={f} value={f}>{f}층</option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>호</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {building &&
                unitOptions(building.unitsPerFloor).map((u) => (
                  <option key={u} value={u}>{u}호</option>
                ))}
            </select>
          </div>
        </div>
      </div>

      <UnitDetailPanel
        building={building}
        buildingId={buildingId}
        floor={floor}
        unit={unit}
        inspections={inspections}
        checklistItems={checklistItems}
        unitNotes={unitNotes}
        unitFloorPlans={unitFloorPlans}
        onCreateNote={onCreateNote}
        onDeleteNote={onDeleteNote}
        notify={notify}
        layout="split"
      />
    </div>
  );
}
