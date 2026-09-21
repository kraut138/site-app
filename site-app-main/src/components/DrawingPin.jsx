import React from "react";
import DxfView from "./DxfView.jsx";

// 대표 평면도(예시 84㎡ 타입) - 감리단이 실제 DXF 도면을 업로드하기 전까지 보여주는 기본값
const ROOMS = [
  { x: 30, y: 24, w: 170, h: 84, label: "침실1" },
  { x: 30, y: 108, w: 170, h: 84, label: "침실2" },
  { x: 30, y: 192, w: 170, h: 84, label: "침실3" },
  { x: 200, y: 24, w: 210, h: 136, label: "거실" },
  { x: 200, y: 160, w: 130, h: 116, label: "주방/식당" },
  { x: 330, y: 160, w: 80, h: 56, label: "화장실" },
  { x: 330, y: 216, w: 80, h: 60, label: "현관" },
];

const BALCONY = { x: 30, y: 276, w: 380, h: 22, label: "발코니" };

function FloorPlanSvg() {
  return (
    <svg viewBox="0 0 440 320" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="440" height="320" fill="#f4f7f5" />
      {/* 외벽 */}
      <rect x="26" y="20" width="388" height="282" fill="none" stroke="#17456f" strokeWidth="3" />
      {ROOMS.map((r) => (
        <g key={r.label}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#ffffff" stroke="#9db3c4" strokeWidth="1.4" />
          <text
            x={r.x + r.w / 2}
            y={r.y + r.h / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="12.5"
            fontFamily="IBM Plex Mono, ui-monospace, monospace"
            fill="#4b5761"
          >
            {r.label}
          </text>
        </g>
      ))}
      <rect x={BALCONY.x} y={BALCONY.y} width={BALCONY.w} height={BALCONY.h} fill="#e6ebe8" stroke="#9db3c4" strokeWidth="1.2" strokeDasharray="4 3" />
      <text x={BALCONY.x + BALCONY.w / 2} y={BALCONY.y + BALCONY.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontFamily="IBM Plex Mono, ui-monospace, monospace" fill="#7c8890">
        발코니
      </text>
    </svg>
  );
}

function PinMarker({ x, y, color = "#17456f" }) {
  return (
    <div className="pin" style={{ left: `${x}%`, top: `${y}%` }}>
      <svg viewBox="0 0 24 24" width="26" height="26">
        <path d="M12 22s7-6.9 7-12.3A7 7 0 0 0 5 9.7C5 15.1 12 22 12 22Z" fill={color} stroke="#fff" strokeWidth="1.2" />
        <circle cx="12" cy="9.6" r="2.6" fill="#fff" />
      </svg>
    </div>
  );
}

/**
 * props:
 * - pin: {x,y} 단일 핀(수정 가능한 상태에서 사용)
 * - onPin: fn({x,y}) 도면 클릭 시 호출 → editable 모드로 전환됨
 * - pins: [{x,y,color}] 여러 핀을 동시에 표시(읽기 전용, 대시보드 등)
 * - pinColor: 단일 pin의 색상
 * - dxfData: {shapes, bounds} 감리단이 업로드한 실제 호실 평면도(DXF 파싱 결과). 없으면 예시 평면도 사용
 */
export default function DrawingPin({ pin, onPin, pins, pinColor = "#17456f", dxfData }) {
  const editable = typeof onPin === "function";

  function handleClick(e) {
    if (!editable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onPin({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }

  return (
    <div className={`drawing-frame${editable ? " editable" : ""}`} onClick={handleClick}>
      {dxfData ? <DxfView data={dxfData} /> : <FloorPlanSvg />}
      {pin && <PinMarker x={pin.x} y={pin.y} color={pinColor} />}
      {pins && pins.map((p, i) => <PinMarker key={i} x={p.x} y={p.y} color={p.color} />)}
      {editable && <span className="drawing-hint">도면을 클릭해 위치를 지정하세요</span>}
    </div>
  );
}
