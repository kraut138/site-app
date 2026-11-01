import React, { useState, useEffect } from "react";
import { unitOptions, findUnitFloorPlan } from "../data.js";
import { EmptyState } from "./UI.jsx";
import UnitDetailPanel from "./UnitDetailPanel.jsx";

// 호실 탐색 줄의 선택 칸 모양(현장통 화면)
const PICKER_SELECT = "text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

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
  canEdit = false,
  userName = "",
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

  // 호실 탐색 줄(현장통 화면 모양): 왼쪽에 동 · 층 · 호 선택, 오른쪽에 '통합 호실 공정률'.
  // 공정률은 아래 카드들이 읽은 음성 보고와 감리 승인으로 계산하므로, 카드를 그리는 UnitDetailPanel이 값을 넘겨 준다.
  const toolbar = ({ gauge }) => {
    const gaugeText = gauge.state === "loading" ? "…" : gauge.state === "ready" ? `${gauge.percent}%` : "–";
    const gaugeHelp =
      gauge.state === "error"
        ? "음성 보고를 읽지 못해서 공정률을 계산하지 못했어요. 아래 ‘음성 새로고침’을 눌러 주세요."
        : "이 호실의 모든 세부 공종 항목에서, 감리가 승인했거나 음성 보고로 읽은 진행률을 평균 낸 값이에요.";
    return (
      <div
        className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3"
        data-testid="unit-picker"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-bold text-slate-500 w-full sm:w-auto">호실 탐색:</span>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <select
              aria-label="동"
              className={PICKER_SELECT}
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
            <select aria-label="층" className={PICKER_SELECT} value={floor} onChange={(e) => setFloor(Number(e.target.value))}>
              {building &&
                Array.from({ length: building.floors }, (_, i) => i + 1).map((f) => (
                  <option key={f} value={f}>{f}층</option>
                ))}
            </select>
            <select aria-label="호" className={PICKER_SELECT} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {building &&
                unitOptions(building.unitsPerFloor).map((u) => {
                  const plan = findUnitFloorPlan(unitFloorPlans, buildingId, u);
                  return (
                    <option key={u} value={u}>{u}호{plan && plan.name ? ` (${plan.name})` : ""}</option>
                  );
                })}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2" title={gaugeHelp}>
          <span className="text-xs text-slate-500">통합 호실 공정률:</span>
          <span
            className="text-sm font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200"
            data-testid="unit-gauge"
            data-state={gauge.state}
            aria-label={`통합 호실 공정률 ${gaugeText}`}
          >
            {gaugeText}
          </span>
        </div>
      </div>
    );
  };

  return (
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
      toolbar={toolbar}
      canEdit={canEdit}
      userName={userName}
    />
  );
}

