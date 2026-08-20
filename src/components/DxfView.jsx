import React from "react";

// DXF는 Y축이 위로 증가하지만 SVG는 아래로 증가하므로, 전체를 세로로 뒤집어서
// 실제 도면을 볼 때와 같은 방향(위가 도면상 +Y)으로 보이게 한다.
export default function DxfView({ data, strokeColor = "#4b5761", textColor }) {
  if (!data || !data.shapes || !data.bounds) return null;
  const { shapes, bounds } = data;
  const strokeW = Math.max(bounds.width, bounds.height) * 0.0022;
  const flipY = 2 * bounds.minY + bounds.height;
  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;

  return (
    <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform={`translate(0, ${flipY}) scale(1,-1)`}>
        {shapes.map((s, i) => {
          if (s.kind === "line") {
            return (
              <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
            );
          }
          if (s.kind === "polyline") {
            return (
              <polyline
                key={i}
                points={s.points.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeW}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          }
          if (s.kind === "circle") {
            return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="none" stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />;
          }
          if (s.kind === "arc") {
            return (
              <path
                key={i}
                d={`M ${s.sx} ${s.sy} A ${s.r} ${s.r} 0 ${s.largeArc} 1 ${s.ex} ${s.ey}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeW}
                vectorEffect="non-scaling-stroke"
              />
            );
          }
          if (s.kind === "text") {
            return (
              <g key={i} transform={`translate(${s.x}, ${s.y}) scale(1,-1)`}>
                <text x="0" y="0" fontSize={s.h || bounds.width * 0.02} fill={textColor || strokeColor} fontFamily="IBM Plex Mono, ui-monospace, monospace">
                  {s.text}
                </text>
              </g>
            );
          }
          return null;
        })}
      </g>
    </svg>
  );
}
