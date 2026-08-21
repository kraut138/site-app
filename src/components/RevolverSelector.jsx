import React, { useRef, useState, useEffect } from "react";

const RADIUS = 150;

function normalizeAngle(a) {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

// 동 하나의 입면(정면) 실루엣 - 층수에 비례한 높이, 층 구분선으로 골조 느낌
function BuildingElevation({ building, selected }) {
  const floors = Math.max(1, building.floors || 1);
  const floorH = Math.max(4, Math.min(11, 190 / floors));
  const height = Math.round(floors * floorH);
  const width = Math.max(70, Math.min(120, 26 + (building.unitsPerFloor || 4) * 11));
  const rows = Math.min(floors, 40);

  return (
    <div className="carousel-elevation">
      <div
        className={`carousel-building${selected ? " selected" : ""}`}
        style={{ width, height }}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="carousel-floor-line" style={{ height: height / rows }}>
            {Array.from({ length: Math.min(building.unitsPerFloor || 4, 6) }).map((__, j) => (
              <span key={j} className="carousel-window" />
            ))}
          </div>
        ))}
      </div>
      <div className={`carousel-label${selected ? " selected" : ""}`}>{building.name}</div>
    </div>
  );
}

/**
 * props:
 * - buildings: [{id, name, floors, unitsPerFloor}]
 * - selectedId, onSelect(id)
 */
export default function RevolverSelector({ buildings, selectedId, onSelect }) {
  const stageRef = useRef(null);
  const dragInfo = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dragRotation, setDragRotation] = useState(null);

  const n = buildings.length;
  const selectedIndex = Math.max(0, buildings.findIndex((b) => b.id === selectedId));
  const step = n > 0 ? 360 / n : 0;
  const restRotation = -selectedIndex * step;
  const currentRotation = dragRotation !== null ? dragRotation : restRotation;

  useEffect(() => {
    setDragRotation(null);
  }, [selectedId]);

  function onPointerDown(e) {
    if (n === 0) return;
    dragInfo.current = { startX: e.clientX, startRotation: currentRotation };
    setDragRotation(currentRotation);
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragInfo.current) return;
    const dx = e.clientX - dragInfo.current.startX;
    setDragRotation(dragInfo.current.startRotation + dx * 0.45);
  }

  function onPointerUp() {
    if (!dragInfo.current) return;
    dragInfo.current = null;
    setDragging(false);
    const finalRotation = dragRotation ?? restRotation;
    let bestIdx = selectedIndex;
    let bestDiff = Infinity;
    for (let i = 0; i < n; i++) {
      const angle = normalizeAngle(i * step + finalRotation);
      const diff = Math.abs(angle);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    setDragRotation(-bestIdx * step);
    const chosen = buildings[bestIdx];
    if (chosen) onSelect(chosen.id);
  }

  if (n === 0) return null;

  return (
    <div className="carousel-outer">
      <div
        ref={stageRef}
        className="carousel-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="carousel-turntable" />
        <div
          className="carousel-ring"
          style={{
            transform: `rotateY(${currentRotation}deg)`,
            transition: dragging ? "none" : "transform 0.4s cubic-bezier(0.2,0.8,0.3,1)",
          }}
        >
          {buildings.map((b, i) => {
            const angle = i * step;
            const effective = normalizeAngle(angle + currentRotation);
            const closeness = (Math.cos((effective * Math.PI) / 180) + 1) / 2; // 0(뒤)~1(정면)
            return (
              <div
                key={b.id}
                className="carousel-item"
                style={{
                  transform: `rotateY(${angle}deg) translateZ(${RADIUS}px)`,
                  opacity: 0.32 + 0.68 * closeness,
                  zIndex: Math.round(closeness * 100),
                }}
              >
                <BuildingElevation building={b} selected={b.id === selectedId} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="carousel-hint">좌우로 드래그해서 동을 돌려보세요</div>
    </div>
  );
}
