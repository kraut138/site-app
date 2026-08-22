import React, { useState } from "react";
import { CATEGORIES, itemsForCategory, unitOptions } from "../data.js";

const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "safety"); // 공사진행 탭과 동일하게 안전/환경 제외

// 특정 동/층/호실에서, 선택한 공종의 세부 항목이 전부 "완료"인지 여부
function isUnitComplete(building, floor, unit, categoryId, progress, checklistItems) {
  const catItems = itemsForCategory(checklistItems, categoryId);
  if (catItems.length === 0) return { complete: false, done: 0, total: 0 };
  const done = catItems.filter((item) => {
    const rec = progress.find(
      (p) => p.buildingId === building.id && p.itemId === item.id && String(p.floor) === String(floor) && p.unit === unit
    );
    return rec && rec.status === "완료";
  }).length;
  return { complete: done === catItems.length, done, total: catItems.length };
}

/**
 * props:
 * - building: 선택된 동
 * - progress: 공사진행 탭에서 기록된 상태 목록
 * - checklistItems
 */
export default function GolguDiagram({ building, progress, checklistItems }) {
  const [categoryId, setCategoryId] = useState(VISIBLE_CATEGORIES[0].id);

  if (!building) return null;

  const floors = Math.max(1, building.floors || 1);
  const floorNumsDesc = Array.from({ length: floors }, (_, i) => floors - i); // 위층부터 그대로 grid row 순서
  const units = unitOptions(building.unitsPerFloor);

  let completeCount = 0;
  const totalUnits = floors * units.length;
  const cellData = floorNumsDesc.map((f) =>
    units.map((u) => {
      const r = isUnitComplete(building, f, u, categoryId, progress, checklistItems);
      if (r.complete) completeCount += 1;
      return { floor: f, unit: u, ...r };
    })
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {VISIBLE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className="cat-tag"
            style={{
              cursor: "pointer",
              border: "1.5px solid",
              borderColor: categoryId === c.id ? c.color : "var(--line)",
              background: categoryId === c.id ? c.color + "1c" : "var(--surface)",
              color: categoryId === c.id ? c.color : "var(--ink-soft)",
              padding: "6px 11px",
            }}
          >
            <span className="cat-dot" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="golgu-brick" style={{ width: 14, height: 14 }} />
          미완료
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="golgu-brick complete" style={{ width: 14, height: 14 }} />
          완료
        </div>
        <span style={{ marginLeft: "auto", color: "var(--ink-soft)" }}>
          {building.name} · {totalUnits}세대 중 <strong style={{ color: "var(--pass)" }}>{completeCount}세대</strong> 완료
        </span>
      </div>

      <div className="golgu-wall-scroll">
        <div className="golgu-wall">
          {cellData.map((row, ri) => (
            <div className="golgu-row" key={ri}>
              <span className="golgu-floor-label mono">{row[0].floor}F</span>
              <div className="golgu-bricks">
                {row.map((cell) => (
                  <span
                    key={cell.unit}
                    className={`golgu-brick${cell.complete ? " complete" : ""}`}
                    title={`${cell.floor}층 ${cell.unit}호 · ${cell.done}/${cell.total} 항목 완료`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
