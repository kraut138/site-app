import React, { useRef, useState, useEffect } from "react";

const SIZE = 260;
const CENTER = SIZE / 2;
const ORBIT_R = 92;
const INDICATOR_ANGLE = -90; // 화면 기준: 0=오른쪽, 90=아래, -90=위쪽

function normalizeAngle(a) {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

/**
 * props:
 * - buildings: [{id, name}]
 * - selectedId: 현재 선택된 동 id
 * - onSelect: fn(id)
 */
export default function RevolverSelector({ buildings, selectedId, onSelect }) {
  const wrapRef = useRef(null);
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

  function baseAngleFor(i) {
    return INDICATOR_ANGLE + i * step;
  }

  function angleAt(clientX, clientY) {
    const rect = wrapRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }

  function onPointerDown(e) {
    if (n === 0) return;
    const startPointerAngle = angleAt(e.clientX, e.clientY);
    dragInfo.current = { startPointerAngle, startRotation: currentRotation };
    setDragRotation(currentRotation);
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragInfo.current) return;
    const nowAngle = angleAt(e.clientX, e.clientY);
    const delta = nowAngle - dragInfo.current.startPointerAngle;
    setDragRotation(dragInfo.current.startRotation + delta);
  }

  function onPointerUp() {
    if (!dragInfo.current) return;
    dragInfo.current = null;
    setDragging(false);
    const finalRotation = dragRotation ?? restRotation;
    let bestIdx = selectedIndex;
    let bestDiff = Infinity;
    for (let i = 0; i < n; i++) {
      const angle = normalizeAngle(baseAngleFor(i) + finalRotation);
      const diff = Math.abs(normalizeAngle(angle - INDICATOR_ANGLE));
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
    <div className="revolver-outer">
      <div
        ref={wrapRef}
        className="revolver-wrap"
        style={{ width: SIZE, height: SIZE }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="revolver-ring" />
        <div className="revolver-hub" />
        <div
          className="revolver-dial"
          style={{
            transform: `rotate(${currentRotation}deg)`,
            transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.2,0.8,0.3,1)",
          }}
        >
          {buildings.map((b, i) => {
            const angle = baseAngleFor(i);
            const rad = (angle * Math.PI) / 180;
            const x = CENTER + ORBIT_R * Math.cos(rad);
            const y = CENTER + ORBIT_R * Math.sin(rad);
            const isSelected = b.id === selectedId;
            return (
              <div key={b.id} className="revolver-chamber-pos" style={{ left: x, top: y }}>
                <div
                  className={`revolver-chamber${isSelected ? " selected" : ""}`}
                  style={{
                    transform: `rotate(${-currentRotation}deg)`,
                    transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.2,0.8,0.3,1)",
                  }}
                >
                  {b.name}
                </div>
              </div>
            );
          })}
        </div>
        <div className="revolver-indicator">
          <svg viewBox="0 0 20 14" width="20" height="14">
            <path d="M2 1 L10 12 L18 1" fill="none" stroke="var(--blueprint)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div className="revolver-hint">드래그해서 돌리고, 위쪽 화살표에 맞는 동을 확인하세요</div>
    </div>
  );
}
