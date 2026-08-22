import React, { useState } from "react";
import { CATEGORIES, itemsForCategory, unitOptions } from "../data.js";

const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "safety"); // 공사진행 탭과 동일하게 안전/환경 제외

function firstItemIdFor(categoryId, checklistItems) {
  const first = itemsForCategory(checklistItems, categoryId)[0];
  return first ? first.id : "";
}

// 특정 동/층/호실에서, 선택한 "세부 체크리스트 항목 하나"가 완료인지 여부
function isUnitComplete(building, floor, unit, itemId, progress) {
  const rec = progress.find(
    (p) => p.buildingId === building.id && p.itemId === itemId && String(p.floor) === String(floor) && p.unit === unit
  );
  return rec && rec.status === "완료";
}

/**
 * props:
 * - building: 선택된 동
 * - progress: 공사진행 탭에서 기록된 상태 목록
 * - checklistItems
 */
export default function GolguDiagram({ building, progress, checklistItems }) {
  const [categoryId, setCategoryId] = useState(VISIBLE_CATEGORIES[0].id);
  const [itemId, setItemId] = useState(firstItemIdFor(VISIBLE_CATEGORIES[0].id, checklistItems));

  if (!building) return null;

  const categoryItems = itemsForCategory(checklistItems, categoryId);
  const selectedItem = checklistItems.find((i) => i.id === itemId) || null;

  function handleCategoryChange(id) {
    setCategoryId(id);
    setItemId(firstItemIdFor(id, checklistItems));
  }

  const floors = Math.max(1, building.floors || 1);
  const floorNumsDesc = Array.from({ length: floors }, (_, i) => floors - i); // 위층부터 그대로 grid row 순서
  const units = unitOptions(building.unitsPerFloor);

  let completeCount = 0;
  const totalUnits = floors * units.length;
  const cellData = floorNumsDesc.map((f) =>
    units.map((u) => {
      const complete = selectedItem ? isUnitComplete(building, f, u, itemId, progress) : false;
      if (complete) completeCount += 1;
      return { floor: f, unit: u, complete };
    })
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {VISIBLE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => handleCategoryChange(c.id)}
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

      <div className="field" style={{ maxWidth: 340, marginBottom: 14 }}>
        <label>세부 체크리스트 선택</label>
        {categoryItems.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>등록된 항목이 없습니다.</div>
        ) : (
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {categoryItems.map((it) => (
              <option key={it.id} value={it.id}>{it.text}</option>
            ))}
          </select>
        )}
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
          {totalUnits}세대 중 <strong style={{ color: "var(--pass)" }}>{completeCount}세대</strong> 완료
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
                    title={`${cell.floor}층 ${cell.unit}호 · ${selectedItem ? selectedItem.text : ""} · ${cell.complete ? "완료" : "미완료"}`}
                  >
                    {cell.unit}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
