import React, { useState } from "react";
import { CATEGORIES, itemsForCategory, unitOptions } from "../data.js";

const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "safety"); // 공사진행 탭과 동일하게 안전/환경 제외

const STATUS_COLOR = {
  미착수: "#c7d0d6",
  진행중: "#e3a94c",
  완료: "#4f9d6e",
};

// 공사진행 탭에서 기록한 "완료" 데이터를 바탕으로, 특정 동/층/공종의 완료율을 집계
// (해당 공종의 모든 세부항목 × 그 층의 모든 세대가 전부 "완료"여야 그 층이 "완료"로 표시됨)
function floorProgressFromTracker(building, floor, categoryId, progress, checklistItems) {
  const catItems = itemsForCategory(checklistItems, categoryId);
  const units = unitOptions(building.unitsPerFloor);
  if (catItems.length === 0 || units.length === 0) return { percent: 0, status: "미착수" };

  let completeSlots = 0;
  let anyStarted = false;
  const totalSlots = catItems.length * units.length;

  catItems.forEach((item) => {
    units.forEach((u) => {
      const rec = progress.find(
        (p) => p.buildingId === building.id && p.itemId === item.id && String(p.floor) === String(floor) && p.unit === u
      );
      const st = rec ? rec.status : "미착수";
      if (st === "완료") completeSlots += 1;
      if (st !== "미착수") anyStarted = true;
    });
  });

  const percent = totalSlots ? Math.round((completeSlots / totalSlots) * 100) : 0;
  let status = "미착수";
  if (percent === 100) status = "완료";
  else if (anyStarted) status = "진행중";
  return { percent, status };
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
  const floorNumsAsc = Array.from({ length: floors }, (_, i) => i + 1); // 1층→위층 순, column-reverse와 맞물려 1층이 아래로 감
  const rowsData = floorNumsAsc.map((f) => ({ floor: f, ...floorProgressFromTracker(building, f, categoryId, progress, checklistItems) }));
  const rowsDataDesc = [...rowsData].reverse(); // 목록 표시는 위층부터

  const W = 150;
  const D = 62;
  const floorH = Math.max(5, Math.min(13, 210 / floors));
  const H = Math.round(floors * floorH);

  const completedFloors = rowsData.filter((r) => r.status === "완료").length;

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

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="frame3d-stage">
          <div className="frame3d-box" style={{ width: W, height: H, transform: "rotateX(-12deg) rotateY(-28deg)" }}>
            <div className="frame3d-face frame3d-front" style={{ width: W, height: H, transform: `translateZ(${D / 2}px)` }}>
              {rowsData.map((r) => (
                <div
                  key={r.floor}
                  className="frame3d-floor"
                  style={{ height: `${100 / floors}%`, background: STATUS_COLOR[r.status] }}
                  title={`${r.floor}층 · ${r.status} ${r.percent}%`}
                />
              ))}
            </div>
            <div
              className="frame3d-face frame3d-side"
              style={{ width: D, height: H, transform: `translateX(${W}px) rotateY(90deg)`, transformOrigin: "0 50%" }}
            />
            <div
              className="frame3d-face frame3d-top"
              style={{ width: W, height: D, transform: `translateZ(${D / 2}px) rotateX(90deg)`, transformOrigin: "50% 0" }}
            />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 12, fontSize: 12 }}>
            {Object.entries(STATUS_COLOR).map(([label, color]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: "inline-block" }} />
                {label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 4 }}>
            {building.name} · {floors}개층 중 <strong style={{ color: "var(--ink)" }}>{completedFloors}개층</strong> 완료 (공사진행 기록 기준)
          </div>
          <div style={{ maxHeight: 230, overflowY: "auto", marginTop: 10, border: "1px solid var(--line)", borderRadius: "var(--radius-s)" }}>
            {rowsDataDesc.map((r) => (
              <div
                key={r.floor}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 10px",
                  fontSize: 12,
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span className="mono" style={{ width: 34, color: "var(--ink-faint)" }}>{r.floor}층</span>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: STATUS_COLOR[r.status], display: "inline-block" }} />
                <span style={{ color: "var(--ink-soft)" }}>{r.status}</span>
                <span className="mono" style={{ marginLeft: "auto", color: "var(--ink-faint)" }}>{r.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
