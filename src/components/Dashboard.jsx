import React from "react";
import { CATEGORIES, NCR_STATUSES } from "../data.js";
import DrawingPin from "./DrawingPin.jsx";
import { EmptyState } from "./UI.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { LANGUAGES } from "../i18n.js";

const NCR_COLOR = {
  발생: "var(--fail)",
  조치중: "var(--pending)",
  재검측요청: "var(--blueprint)",
  완료: "var(--pass)",
};

export default function Dashboard({ buildings, inspections, ncrs }) {
  const { t, lang, setLang } = useLanguage();
  const total = inspections.length;
  const approved = inspections.filter((i) => i.status === "승인").length;
  const rejected = inspections.filter((i) => i.status === "반려").length;
  const pending = inspections.filter((i) => i.status === "대기").length;
  const approvalRate = total ? Math.round((approved / total) * 100) : 0;
  const openNcr = ncrs.filter((n) => n.status !== "완료").length;

  const byBuilding = buildings.map((b) => {
    const items = inspections.filter((i) => i.buildingId === b.id);
    const bApproved = items.filter((i) => i.status === "승인").length;
    return { label: b.name, value: items.length ? Math.round((bApproved / items.length) * 100) : 0, sub: `${bApproved}/${items.length}${t("common.case")}` };
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
        <StatCard label={t("dashboard.totalRequests")} value={total} unit={t("common.case")} sub={`${t("dashboard.pending")} ${pending}${t("common.case")}`} />
        <StatCard
          label={t("dashboard.approvalRate")}
          value={approvalRate}
          unit="%"
          sub={t("dashboard.approvedRejected", { approved, rejected })}
          accent="var(--pass)"
        />
        <StatCard
          label={t("dashboard.openNcr")}
          value={openNcr}
          unit={t("common.case")}
          sub={`${t("dashboard.totalIssued")} ${ncrs.length}${t("common.case")}`}
          accent={openNcr > 0 ? "var(--fail)" : undefined}
        />
        <StatCard
          label={t("dashboard.registeredBuildings")}
          value={buildings.length}
          unit={t("dashboard.buildingUnit")}
          sub={t("dashboard.totalUnits", { count: buildings.reduce((s, b) => s + b.floors * b.unitsPerFloor, 0) })}
        />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16, alignItems: "start" }}>
        <div className="card card-pad">
          <div className="section-head">
            <div className="section-title">{t("dashboard.approvalByBuilding")}</div>
            <span className="eyebrow">BY BUILDING</span>
          </div>
          {byBuilding.length === 0 ? (
            <EmptyState message={t("dashboard.noBuildings")} />
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
            <div className="section-title">{t("dashboard.ncrStatus")}</div>
            <span className="eyebrow">NCR STATUS</span>
          </div>
          {ncrs.length === 0 ? (
            <EmptyState message={t("dashboard.noNcr")} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <Donut data={ncrByStatus.map((d) => ({ value: d.value, color: d.color }))} total={ncrs.length} totalLabel={t("dashboard.totalNcr")} />
              <div style={{ flex: 1 }}>
                {ncrByStatus.map((d) => (
                  <div key={d.status} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, fontSize: 12.5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "var(--ink-soft)" }}>{t(`ncrStatus.${d.status}`)}</span>
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
            <div className="section-title">{t("dashboard.ncrByCategory")}</div>
            <span className="eyebrow">QUALITY RISK</span>
          </div>
          {ncrByCategory.length === 0 ? (
            <EmptyState message={t("dashboard.noNcrCategory")} />
          ) : (
            ncrByCategory.map((r, i) => (
              <div className="rank-row" key={r.label}>
                <span className="rank-num">{i + 1}</span>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                <span className="txt">{r.label}</span>
                <span className="count">{r.count}{t("common.case")}</span>
              </div>
            ))
          )}
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div className="section-title">{t("dashboard.unresolvedPins")}</div>
            <span className="eyebrow">{t("dashboard.shown", { count: openPins.length })}</span>
          </div>
          {openPins.length === 0 ? (
            <EmptyState message={t("dashboard.noPins")} />
          ) : (
            <DrawingPin pins={openPins} />
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-head">
          <div className="section-title">{t("dashboard.language")}</div>
        </div>
        <div className="language-picker">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              className={`language-pill${lang === l.code ? " active" : ""}`}
              onClick={() => setLang(l.code)}
            >
              {l.label}
            </button>
          ))}
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

function Donut({ data, total, size = 128, totalLabel }) {
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
        {totalLabel}
      </text>
    </svg>
  );
}
