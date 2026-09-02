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

// 특정 동/층/호실에서, 선택한 "세부 공종 항목 하나"가 감리단 승인을 받았는지 여부.
// 하도급사의 자체 진행 표시(공사진행 탭)와는 별개로, 실제 "공사 확인 요청"이 승인된 이력이 있어야 완료로 본다.
function isUnitApproved(building, floor, unit, itemId, inspections) {
  return inspections.some(
    (i) =>
      i.buildingId === building.id &&
      String(i.floor) === String(floor) &&
      i.unit === unit &&
      i.status === "승인" &&
      Array.isArray(i.checkedItemIds) &&
      i.checkedItemIds.includes(itemId)
  );
}

function normalizeAngle(a) {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

// 동 하나의 골구도(입면) - 층별로 쌓인 벽돌 그리드가 그대로 건물 정면이 된다.
function GolguCard({ building, itemId, inspections, onBrickClick }) {
  const floors = Math.max(1, building.floors || 1);
  const floorNumsAsc = Array.from({ length: floors }, (_, i) => i + 1); // 1층부터 오름차순 - column-reverse와 맞물려 1층이 맨 아래로 감
  const units = unitOptions(building.unitsPerFloor);
  const brickW = Math.max(32, Math.min(46, 190 / units.length));
  const brickH = Math.max(9, Math.min(24, 300 / floors));
  const width = Math.round(brickW * units.length);
  const height = Math.round(brickH * floors);
  const fontSize = Math.max(7, Math.min(10.5, brickH * 0.46));

  const cellData = floorNumsAsc.map((f) => units.map((u) => ({ floor: f, unit: u, complete: itemId ? isUnitApproved(building, f, u, itemId, inspections) : false })));

  return (
    <div className="golgu-card-flat" style={{ width, height }}>
      {cellData.map((row, ri) => (
        <div className="golgu-card-row" key={ri} style={{ height: brickH }}>
          {row.map((cell) => (
            <button
              type="button"
              key={cell.unit}
              className={`golgu-card-brick${cell.complete ? " complete" : ""}`}
              style={{ fontSize }}
              title={`${building.name} ${cell.floor}층 ${cell.unit}호 · ${cell.complete ? "완료" : "미완료"} · 클릭하면 호실 정보로 이동`}
              onClick={() => onBrickClick(building.id, cell.floor, cell.unit)}
            >
              {cell.floor}{cell.unit}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * props:
 * - buildings: 전체 동 목록
 * - inspections: 검측(공사 확인 요청) 목록 - 감리단이 승인한 항목만 완료로 집계
 * - checklistItems
 */
export default function GolguDiagram({ buildings, inspections, checklistItems, onNavigateToUnit }) {
  const [categoryId, setCategoryId] = useState(VISIBLE_CATEGORIES[0].id);
  const [itemId, setItemId] = useState(firstItemIdFor(VISIBLE_CATEGORIES[0].id, checklistItems));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const stageRef = useRef(null);
  const dragInfo = useRef(null);
  const dragMoved = useRef(false); // 드래그로 조금이라도 움직였으면, 뗄 때 브릭 클릭(호실 이동)으로 오인하지 않도록
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
            row.push(isUnitApproved(b, f, u, it.id, inspections) ? "완료" : "");
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
    dragInfo.current = { startX: e.clientX, startRotation: currentRotation, pointerId: e.pointerId };
    dragMoved.current = false;
    setDragRotation(currentRotation);
    setDragging(true);
    // 여기서 바로 setPointerCapture를 걸면, 단순 클릭(탭)일 때도 이후의 클릭 이벤트가 이 요소로
    // 넘어와서 브릭 자체의 onClick이 발생하지 않게 된다. 그래서 캡처는 실제로 드래그가 감지된
    // 순간(onPointerMove)에만 시작한다.
  }
  function onPointerMove(e) {
    if (!dragInfo.current) return;
    const dx = e.clientX - dragInfo.current.startX;
    if (!dragMoved.current && Math.abs(dx) > 4) {
      dragMoved.current = true;
      try {
        stageRef.current && stageRef.current.setPointerCapture(dragInfo.current.pointerId);
      } catch {
        /* 캡처 실패해도 회전 자체는 계속 동작하므로 무시 */
      }
    }
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

  function handleBrickClick(buildingId, floor, unit) {
    if (dragMoved.current) return; // 방금 드래그했다면(회전 목적) 클릭으로 오인해 이동하지 않음
    if (onNavigateToUnit) onNavigateToUnit(buildingId, floor, unit);
  }

  // 완료 세대 집계는 현재 정면을 보고 있는 동 기준
  let completeCount = 0;
  const focusedUnits = focusedBuilding ? unitOptions(focusedBuilding.unitsPerFloor).length * Math.max(1, focusedBuilding.floors || 1) : 0;
  if (focusedBuilding && itemId) {
    const units = unitOptions(focusedBuilding.unitsPerFloor);
    for (let f = 1; f <= (focusedBuilding.floors || 1); f++) {
      units.forEach((u) => {
        if (isUnitApproved(focusedBuilding, f, u, itemId, inspections)) completeCount += 1;
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
        <label>세부 공종 선택</label>
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
      <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 8 }}>
        감리단이 "공사 확인 요청"을 승인한 호실만 완료로 표시됩니다. 공사진행 탭의 자체 진행 표시와는 별개입니다.
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
              const isFocused = i === clampedIndex;
              return (
                <div
                  key={b.id}
                  className="golgu-carousel-item"
                  style={{ transform: `rotateY(${angle}deg) translateZ(${RADIUS}px)`, pointerEvents: isFocused ? "auto" : "none" }}
                >
                  <div className="golgu-card-wrap">
                    <GolguCard building={b} itemId={itemId} inspections={inspections} onBrickClick={handleBrickClick} />
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
