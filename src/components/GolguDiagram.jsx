import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { CATEGORIES, itemsForCategory, unitOptions } from "../data.js";
import { Icon } from "./UI.jsx";

const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "safety"); // 공사진행 탭과 동일하게 안전/환경 제외
const RADIUS = 190;

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

function normalizeAngle(a) {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

// 동 하나의 골구도(입면) - 층별로 쌓인 벽돌 그리드가 그대로 건물 정면이 된다.
function GolguCard({ building, itemId, progress }) {
  const floors = Math.max(1, building.floors || 1);
  const floorNumsAsc = Array.from({ length: floors }, (_, i) => i + 1); // 1층부터 오름차순 - column-reverse와 맞물려 1층이 맨 아래로 감
  const units = unitOptions(building.unitsPerFloor);
  const brickW = Math.max(24, Math.min(34, 140 / units.length));
  const brickH = Math.max(11, Math.min(22, 280 / floors));
  const width = Math.round(brickW * units.length);
  const height = Math.round(brickH * floors);
  const depth = Math.max(20, Math.min(46, width * 0.3));
  const fontSize = Math.max(6.5, Math.min(10, brickH * 0.5));

  const cellData = floorNumsAsc.map((f) => units.map((u) => ({ floor: f, unit: u, complete: itemId ? isUnitComplete(building, f, u, itemId, progress) : false })));

  return (
    <div className="golgu-card-3d" style={{ width, height }}>
      <div className="golgu-card-front" style={{ width, height, transform: `translateZ(${depth / 2}px)` }}>
        {cellData.map((row, ri) => (
          <div className="golgu-card-row" key={ri} style={{ height: brickH }}>
            {row.map((cell) => (
              <span
                key={cell.unit}
                className={`golgu-card-brick${cell.complete ? " complete" : ""}`}
                style={{ fontSize }}
                title={`${building.name} ${cell.floor}층 ${cell.unit}호 · ${cell.complete ? "완료" : "미완료"}`}
              >
                {cell.unit}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="golgu-card-side" style={{ width: depth, height, transform: `translateX(${width}px) rotateY(90deg)`, transformOrigin: "0 50%" }} />
    </div>
  );
}

/**
 * props:
 * - buildings: 전체 동 목록
 * - progress: 공사진행 탭에서 기록된 상태 목록
 * - checklistItems
 */
export default function GolguDiagram({ buildings, progress, checklistItems }) {
  const [categoryId, setCategoryId] = useState(VISIBLE_CATEGORIES[0].id);
  const [itemId, setItemId] = useState(firstItemIdFor(VISIBLE_CATEGORIES[0].id, checklistItems));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const stageRef = useRef(null);
  const dragInfo = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dragRotation, setDragRotation] = useState(null);

  const n = buildings ? buildings.length : 0;
  const step = n > 0 ? 360 / n : 0;
  const clampedIndex = n > 0 ? ((selectedIndex % n) + n) % n : 0;
  const restRotation = -clampedIndex * step;
  const currentRotation = dragRotation !== null ? dragRotation : restRotation;

  useEffect(() => {
    setDragRotation(null);
  }, [clampedIndex]);

  if (!buildings || buildings.length === 0) return null;

  const categoryItems = itemsForCategory(checklistItems, categoryId);
  const selectedItem = checklistItems.find((i) => i.id === itemId) || null;
  const focusedBuilding = buildings[clampedIndex];

  function handleCategoryChange(id) {
    setCategoryId(id);
    setItemId(firstItemIdFor(id, checklistItems));
  }

  function goPrev() {
    setSelectedIndex((i) => (((i - 1) % n) + n) % n);
  }
  function goNext() {
    setSelectedIndex((i) => (i + 1) % n);
  }

  function handleDownloadExcel() {
    const allItems = VISIBLE_CATEGORIES.flatMap((c) => itemsForCategory(checklistItems, c.id).map((it) => ({ ...it, categoryName: c.name })));
    const header = ["동", "층", "호", ...allItems.map((it) => `[${it.categoryName}] ${it.text}`)];
    const rows = [header];

    buildings.forEach((b) => {
      const floors = Math.max(1, b.floors || 1);
      const units = unitOptions(b.unitsPerFloor);
      for (let f = floors; f >= 1; f--) {
        units.forEach((u) => {
          const row = [b.name, f, u];
          allItems.forEach((it) => {
            row.push(isUnitComplete(b, f, u, it.id, progress) ? "완료" : "");
          });
          rows.push(row);
        });
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 8 }, { wch: 6 }, { wch: 6 }, ...allItems.map(() => ({ wch: 16 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "골구도");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `골구도_진행현황_${today}.xlsx`);
  }

  function onPointerDown(e) {
    if (n < 2) return;
    dragInfo.current = { startX: e.clientX, startRotation: currentRotation };
    setDragRotation(currentRotation);
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragInfo.current) return;
    const dx = e.clientX - dragInfo.current.startX;
    setDragRotation(dragInfo.current.startRotation + dx * 0.5);
  }
  function onPointerUp() {
    if (!dragInfo.current) return;
    dragInfo.current = null;
    setDragging(false);
    const finalRotation = dragRotation ?? restRotation;
    let bestIdx = clampedIndex;
    let bestDiff = Infinity;
    for (let i = 0; i < n; i++) {
      const angle = normalizeAngle(i * step + finalRotation);
      const diff = Math.abs(normalizeAngle(angle));
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    setDragRotation(-bestIdx * step);
    setSelectedIndex(bestIdx);
  }

  // 완료 세대 집계는 현재 정면을 보고 있는 동 기준
  let completeCount = 0;
  const focusedUnits = focusedBuilding ? unitOptions(focusedBuilding.unitsPerFloor).length * Math.max(1, focusedBuilding.floors || 1) : 0;
  if (focusedBuilding && itemId) {
    const units = unitOptions(focusedBuilding.unitsPerFloor);
    for (let f = 1; f <= (focusedBuilding.floors || 1); f++) {
      units.forEach((u) => {
        if (isUnitComplete(focusedBuilding, f, u, itemId, progress)) completeCount += 1;
      });
    }
  }

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

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8, fontSize: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="golgu-brick" style={{ width: 14, height: 14 }} />
          미완료
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="golgu-brick complete" style={{ width: 14, height: 14 }} />
          완료
        </div>
        <span style={{ color: "var(--ink-soft)" }}>
          {focusedBuilding?.name} · {focusedUnits}세대 중 <strong style={{ color: "var(--pass)" }}>{completeCount}세대</strong> 완료
        </span>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={handleDownloadExcel}>
          <Icon.Download width="14" height="14" />
          엑셀 다운로드
        </button>
      </div>

      <div className="golgu-carousel-outer">
        <div
          ref={stageRef}
          className="golgu-carousel-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="golgu-carousel-turntable" />
          <div
            className="golgu-carousel-ring"
            style={{ transform: `rotateY(${currentRotation}deg)`, transition: dragging ? "none" : "transform 0.4s cubic-bezier(0.2,0.8,0.3,1)" }}
          >
            {buildings.map((b, i) => {
              const angle = i * step;
              return (
                <div key={b.id} className="golgu-carousel-item" style={{ transform: `rotateY(${angle}deg) translateZ(${RADIUS}px)` }}>
                  <div className="golgu-card-wrap">
                    <GolguCard building={b} itemId={itemId} progress={progress} />
                    <div className="golgu-card-name" style={{ transform: `rotateY(${-(angle + currentRotation)}deg)` }}>
                      {b.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="golgu-nav-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={goPrev} disabled={n < 2}>
            <Icon.ChevronRight width="15" height="15" style={{ transform: "rotate(180deg)" }} />
            이전
          </button>
          <span className="mono golgu-nav-count">{clampedIndex + 1} / {n}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={goNext} disabled={n < 2}>
            다음
            <Icon.ChevronRight width="15" height="15" />
          </button>
        </div>
        {n > 1 && <div className="golgu-scroll-hint">좌우로 드래그하거나 버튼을 눌러 다른 동을 볼 수 있어요</div>}
      </div>
    </div>
  );
}
