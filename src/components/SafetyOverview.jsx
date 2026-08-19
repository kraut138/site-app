import React, { useState } from "react";
import { formatDateTime } from "../data.js";
import { StatusBadge, EmptyState } from "./UI.jsx";
import { NCRDetail } from "./NCR.jsx";

const SAFETY_ID = "safety";

export default function SafetyOverview({ role, buildings, inspections, ncrs, onUpdateNcrStatus, notify }) {
  const [selectedNcrId, setSelectedNcrId] = useState(null);

  const safetyInspections = inspections.filter((i) => i.categoryId === SAFETY_ID);
  const safetyNcrs = ncrs.filter((n) => n.categoryId === SAFETY_ID);
  const selected = safetyNcrs.find((n) => n.id === selectedNcrId) || null;

  const total = safetyInspections.length;
  const approved = safetyInspections.filter((i) => i.status === "승인").length;
  const rejected = safetyInspections.filter((i) => i.status === "반려").length;
  const approvalRate = total ? Math.round((approved / total) * 100) : 0;
  const openNcr = safetyNcrs.filter((n) => n.status !== "완료").length;
  const affectedBuildings = new Set(safetyNcrs.map((n) => n.buildingId)).size;

  const byBuildingNcr = buildings
    .map((b) => ({ label: b.name, count: safetyNcrs.filter((n) => n.buildingId === b.id).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const sortedNcrs = [...safetyNcrs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatCard label="안전 검측 요청" value={total} unit="건" sub={`승인 ${approved} · 반려 ${rejected}`} />
        <StatCard label="안전 검측 승인율" value={approvalRate} unit="%" accent="var(--pass)" />
        <StatCard label="미해결 안전 NCR" value={openNcr} unit="건" accent={openNcr > 0 ? "var(--fail)" : undefined} sub={`전체 발행 ${safetyNcrs.length}건`} />
        <StatCard label="안전 NCR 발생 동" value={affectedBuildings} unit="개동" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div className="section-title">동별 안전 NCR 발생 건수</div>
          <span className="eyebrow">RISK RANKING</span>
        </div>
        {byBuildingNcr.length === 0 ? (
          <EmptyState message="발생한 안전 NCR이 없습니다." />
        ) : (
          byBuildingNcr.map((r, i) => (
            <div className="rank-row" key={r.label}>
              <span className="rank-num">{i + 1}</span>
              <span className="txt">{r.label}</span>
              <span className="count">{r.count}건</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div style={{ padding: "16px 20px 4px" }}>
          <div className="section-title">안전 NCR 목록</div>
        </div>
        {sortedNcrs.length === 0 ? (
          <EmptyState message="발행된 안전 NCR이 없습니다. 안전/환경 검측을 반려하면 이곳에 자동으로 모입니다." />
        ) : (
          sortedNcrs.map((ncr) => {
            const building = buildings.find((b) => b.id === ncr.buildingId);
            return (
              <div className="list-row" key={ncr.id} onClick={() => setSelectedNcrId(ncr.id)}>
                <span className="loc">
                  {building ? building.name : "-"} {ncr.floor}층{ncr.unit ? ` ${ncr.unit}호` : ""}
                </span>
                <div className="grow">
                  <div className="title">{ncr.description}</div>
                  <div className="meta">{formatDateTime(ncr.createdAt)}</div>
                </div>
                <StatusBadge status={ncr.status} />
              </div>
            );
          })
        )}
      </div>

      {selected && (
        <NCRDetail
          ncr={selected}
          building={buildings.find((b) => b.id === selected.buildingId)}
          role={role}
          onClose={() => setSelectedNcrId(null)}
          onAdvance={async (status, extra) => {
            await onUpdateNcrStatus(selected.id, { status, ...extra });
            notify(`안전 NCR 상태가 "${status}"(으)로 변경되었습니다.`);
          }}
        />
      )}
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
      {sub && <div className="delta">{sub}</div>}
    </div>
  );
}
