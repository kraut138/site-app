import React, { useState } from "react";
import { CATEGORIES, unitOptions, categoryProgress } from "../data.js";

const STATUS_COLOR = {
  미시작: "#c7d0d6",
  진행중: "#e3a94c",
  완료: "#4f9d6e",
  반려있음: "#c85a4e",
};

// 특정 동/층/공종의 전체 세대 대비 진행 상태를 집계
function floorProgress(building, floor, categoryId, inspections, checklistItems) {
  const units = unitOptions(building.unitsPerFloor);
  let approved = 0;
  let rejected = false;
  let started = false;
  units.forEach((u) => {
    const p = categoryProgress(inspections, checklistItems, building.id, floor, u, categoryId);
    if (p.status === "승인") approved += 1;
    if (p.status === "반려") rejected = true;
    if (p.status !== "미시작") started = true;
  });
  const percent = units.length ? Math.round((approved / units.length) * 100) : 0;
  let status = "미시작";
  if (rejected) status = "반려있음";
  else if (percent === 100) status = "완료";
  else if (started) status = "진행중";
  return { percent, status };
}

/**
 * props:
 * - building: 선택된 동
 * - inspections, checklistItems
 */
export default function BuildingFrameDiagram({ building, inspections, checklistItems }) {
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);

  if (!building) return null;

  const floors = Math.max(1, building.floors || 1);
  const floorNumsAsc = Array.from({ length: floors }, (_, i) => i + 1); // 1층→위층 순, column-reverse와 맞물려 1층이 아래로 감
  const rowsData = floorNumsAsc.map((f) => ({ floor: f, ...floorProgress(building, f, categoryId, inspections, checklistItems) }));
  const rowsDataDesc = [...rowsData].reverse(); // 목록 표시는 위층부터

  const W = 150;
  const D = 62;
  const floorH = Math.max(5, Math.min(13, 210 / floors));
  const H = Math.round(floors * floorH);

  const completedFloors = rowsData.filter((r) => r.status === "완료").length;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {CATEGORIES.map((c) => (
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
            {building.name} · {floors}개층 중 <strong style={{ color: "var(--ink)" }}>{completedFloors}개층</strong> 완료
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
