import React, { useState } from "react";
import { CATEGORIES, formatDateTime } from "../data.js";
import { StatusBadge, EmptyState, CategoryTag, Icon } from "./UI.jsx";
import { NCRDetail } from "./NCR.jsx";

const SAFETY_ID = "safety";

export default function SafetyOverview({ role, buildings, inspections, ncrs, workers, unitFloorPlan, onUpdateNcrStatus, onUpdateWorkerStatus, notify }) {
  const [selectedNcrId, setSelectedNcrId] = useState(null);
  const [workerBusyId, setWorkerBusyId] = useState(null);

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

  const approvedWorkers = workers.filter((w) => w.status === "승인");
  const pendingWorkers = [...workers.filter((w) => w.status === "대기")].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const companiesForMatrix = [...new Set(approvedWorkers.map((w) => w.companyName))].sort();
  const matrixRows = companiesForMatrix.map((company) => {
    const counts = CATEGORIES.map((c) => approvedWorkers.filter((w) => w.companyName === company && w.categoryId === c.id).length);
    return { company, counts, total: counts.reduce((a, b) => a + b, 0) };
  });
  const columnTotals = CATEGORIES.map((c, i) => matrixRows.reduce((sum, r) => sum + r.counts[i], 0));
  const grandTotal = columnTotals.reduce((a, b) => a + b, 0);

  async function handleWorkerDecision(id, status) {
    setWorkerBusyId(id);
    try {
      await onUpdateWorkerStatus(id, { status, approver: "감리단" });
      notify(status === "승인" ? "인력을 승인했습니다." : "인력 등록을 반려했습니다.");
    } finally {
      setWorkerBusyId(null);
    }
  }

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

      <div className="hairline" />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ padding: "16px 20px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="section-title">인력 승인 대기</div>
          <span className="eyebrow">{pendingWorkers.length}건</span>
        </div>
        {pendingWorkers.length === 0 ? (
          <EmptyState message="승인 대기 중인 인력 등록이 없습니다." />
        ) : (
          <div style={{ padding: "8px 4px" }}>
            {pendingWorkers.map((w) => {
              const cat = CATEGORIES.find((c) => c.id === w.categoryId);
              return (
                <div className="list-row" key={w.id} style={{ cursor: "default" }}>
                  <span className="loc">{w.companyName}</span>
                  <div className="grow">
                    <div className="title">{w.workerName}</div>
                    <div className="meta">{formatDateTime(w.createdAt)}</div>
                  </div>
                  <CategoryTag category={cat} />
                  <button
                    className="btn btn-pass btn-sm"
                    disabled={workerBusyId === w.id}
                    onClick={() => handleWorkerDecision(w.id, "승인")}
                  >
                    <Icon.Check width="13" height="13" /> 승인
                  </button>
                  <button
                    className="btn btn-fail btn-sm"
                    disabled={workerBusyId === w.id}
                    onClick={() => handleWorkerDecision(w.id, "반려")}
                  >
                    <Icon.Close width="12" height="12" /> 반려
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div className="section-title">현장 인력 현황 (건설사별 · 공종별)</div>
          <span className="eyebrow">승인 완료 {grandTotal}명</span>
        </div>
        {matrixRows.length === 0 ? (
          <EmptyState message="승인된 인력이 없습니다." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1.5px solid var(--line-strong)", color: "var(--ink-soft)", fontSize: 12 }}>건설사</th>
                  {CATEGORIES.map((c) => (
                    <th key={c.id} style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1.5px solid var(--line-strong)", color: "var(--ink-soft)", fontSize: 12 }}>
                      {c.shortName}
                    </th>
                  ))}
                  <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1.5px solid var(--line-strong)", color: "var(--ink-soft)", fontSize: 12 }}>합계</th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((r) => (
                  <tr key={r.company}>
                    <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--line)", fontWeight: 600 }}>{r.company}</td>
                    {r.counts.map((n, i) => (
                      <td key={i} className="mono" style={{ textAlign: "right", padding: "9px 10px", borderBottom: "1px solid var(--line)", color: n > 0 ? "var(--ink)" : "var(--ink-faint)" }}>
                        {n}
                      </td>
                    ))}
                    <td className="mono" style={{ textAlign: "right", padding: "9px 10px", borderBottom: "1px solid var(--line)", fontWeight: 700 }}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ padding: "9px 10px", fontWeight: 700 }}>전체 합계</td>
                  {columnTotals.map((n, i) => (
                    <td key={i} className="mono" style={{ textAlign: "right", padding: "9px 10px", fontWeight: 700 }}>{n}</td>
                  ))}
                  <td className="mono" style={{ textAlign: "right", padding: "9px 10px", fontWeight: 700, color: "var(--blueprint)" }}>{grandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
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
