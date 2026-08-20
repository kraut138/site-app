import React from "react";
import { CATEGORIES, NCR_STATUSES } from "../data.js";
import DrawingPin from "./DrawingPin.jsx";
import { EmptyState } from "./UI.jsx";

const NCR_COLOR = {
  발생: "var(--fail)",
  조치중: "var(--pending)",
  재검측요청: "var(--blueprint)",
  완료: "var(--pass)",
};

export default function Dashboard({ buildings, inspections, ncrs, unitFloorPlan }) {
  const total = inspections.length;
  const approved = inspections.filter((i) => i.status === "승인").length;
  const rejected = inspections.filter((i) => i.status === "반려").length;
  const pending = inspections.filter((i) => i.status === "대기").length;
  const approvalRate = total ? Math.round((approved / total) * 100) : 0;
  const openNcr = ncrs.filter((n) => n.status !== "완료").length;

  const byBuilding = buildings.map((b) => {
    const items = inspections.filter((i) => i.buildingId === b.id);
    const bApproved = items.filter((i) => i.status === "승인").length;
    return { label: b.name, value: items.length ? Math.round((bApproved / items.length) * 100) : 0, sub: `${bApproved}/${items.length}건` };
  });

  const ncrByStatus = NCR_STATUSES.map((s) => ({ status: s, value: ncrs.filter((n) => n.status === s).length, color: NCR_COLOR[s] }));

  const ncrByCategory = CATEGORIES.map((c) => ({
    label: c.name,
    color: c.color,
    count: ncrs.filter((n) => n.categoryId === c.id).length,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const openPins = ncrs.filter((n) => n.status !== "완료" && n.pin).map((n) => ({ x: n.pin.x, y: n.pin.y, color: NCR_COLOR[n.status] }));

  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatCard label="전체 검측 요청" value={total} unit="건" sub={`대기 ${pending}건`} />
        <StatCard label="검측 승인율" value={approvalRate} unit="%" sub={`승인 ${approved} · 반려 ${rejected}`} accent="var(--pass)" />
        <StatCard label="미해결 NCR" value={openNcr} unit="건" sub={`전체 발행 ${ncrs.length}건`} accent={openNcr > 0 ? "var(--fail)" : undefined} />
        <StatCard label="등록 동" value={buildings.length} unit="개동" sub={`총 ${buildings.reduce((s, b) => s + b.floors * b.unitsPerFloor, 0)}세대`} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16, alignItems: "start" }}>
        <div className="card card-pad">
          <div className="section-head">
            <div className="section-title">동별 검측 승인율</div>
            <span className="eyebrow">BY BUILDING</span>
          </div>
          {byBuilding.length === 0 ? (
            <EmptyState message="등록된 동이 없습니다." />
          ) : (
            byBuilding.map((r, i) => (
              <div className="bar-row" key={i}>
                <span className="lbl">{r.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${r.value}%`, background: "var(--blueprint)" }} />
                </div>
                <span className="val">{r.value}%</span>
              </div>
            ))
          )}
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div className="section-title">NCR 상태 분포</div>
            <span className="eyebrow">NCR STATUS</span>
          </div>
          {ncrs.length === 0 ? (
            <EmptyState message="발행된 NCR이 없습니다." />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <Donut data={ncrByStatus.map((d) => ({ value: d.value, color: d.color }))} total={ncrs.length} />
              <div style={{ flex: 1 }}>
                {ncrByStatus.map((d) => (
                  <div key={d.status} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, fontSize: 12.5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "var(--ink-soft)" }}>{d.status}</span>
                    <span className="mono" style={{ fontWeight: 700 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad">
          <div className="section-head">
            <div className="section-title">공종별 부적합 발생</div>
            <span className="eyebrow">QUALITY RISK</span>
          </div>
          {ncrByCategory.length === 0 ? (
            <EmptyState message="부적합 사항이 없습니다." />
          ) : (
            ncrByCategory.map((r, i) => (
              <div className="rank-row" key={r.label}>
                <span className="rank-num">{i + 1}</span>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                <span className="txt">{r.label}</span>
                <span className="count">{r.count}건</span>
              </div>
            ))
          )}
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div className="section-title">미해결 지적사항 위치</div>
            <span className="eyebrow">{openPins.length}건 표시</span>
          </div>
          {openPins.length === 0 ? (
            <EmptyState message="도면에 표시할 미해결 지적사항이 없습니다." />
          ) : (
            <DrawingPin pins={openPins} dxfData={unitFloorPlan?.shapes ? unitFloorPlan : null} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, sub, accent }) {
  return (
    <div className="stat-card">
      <span className="eyebrow">{label}</span>
      <div className="num" style={accent ? { color: accent } : undefined}>
        {value}
        <span className="unit">{unit}</span>
      </div>
      <div className="delta">{sub}</div>
    </div>
  );
}

function Donut({ data, total, size = 128 }) {
  const sum = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;
  const segments = data.map((d) => {
    const dash = (d.value / sum) * circumference;
    const seg = { ...d, dash, offset: cumulative };
    cumulative += dash;
    return seg;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
        <circle r={radius} fill="none" stroke="var(--surface-alt)" strokeWidth="15" />
        {segments.map(
          (s, i) =>
            s.dash > 0 && (
              <circle
                key={i}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="15"
                strokeDasharray={`${s.dash} ${circumference - s.dash}`}
                strokeDashoffset={-s.offset}
              />
            )
        )}
      </g>
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="21" fontWeight="700" fontFamily="var(--font-mono)" fill="var(--ink)">
        {total}
      </text>
      <text x={size / 2} y={size / 2 + 15} textAnchor="middle" fontSize="9.5" fill="var(--ink-faint)">
        전체 NCR
      </text>
    </svg>
  );
}
