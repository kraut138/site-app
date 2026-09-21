import React, { useState } from "react";
import { CATEGORIES, formatDateTime } from "../data.js";
import { Icon, StatusBadge, CategoryTag, EmptyState, Modal } from "./UI.jsx";
import { useLanguage } from "../LanguageContext.jsx";

const EXPEL_THRESHOLD = 3;

export default function WorkerRoster({ workers, onUpdateWorkerStatus, onAddWorkerWarning, notify }) {
  const { t } = useLanguage();
  const [workerBusyId, setWorkerBusyId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const pendingWorkers = [...workers.filter((w) => w.status === "대기")].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const approvedWorkers = workers.filter((w) => w.status === "승인" || w.status === "퇴출");
  const companiesForMatrix = [...new Set(approvedWorkers.map((w) => w.companyName))].sort();
  const matrixRows = companiesForMatrix.map((company) => {
    const counts = CATEGORIES.map((c) => approvedWorkers.filter((w) => w.companyName === company && w.categoryId === c.id).length);
    return { company, counts, total: counts.reduce((a, b) => a + b, 0) };
  });
  const columnTotals = CATEGORIES.map((c, i) => matrixRows.reduce((sum, r) => sum + r.counts[i], 0));
  const grandTotal = columnTotals.reduce((a, b) => a + b, 0);

  const allWorkersSorted = [...workers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const selected = workers.find((w) => w.id === selectedId) || null;

  async function handleWorkerDecision(id, status) {
    setWorkerBusyId(id);
    try {
      await onUpdateWorkerStatus(id, { status, approver: "감리단" });
      notify(status === "승인" ? t("roster.approveSuccess") : t("roster.rejectSuccess"));
    } finally {
      setWorkerBusyId(null);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ padding: "16px 20px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="section-title">{t("roster.pendingApproval")}</div>
          <span className="eyebrow">{pendingWorkers.length}{t("common.case")}</span>
        </div>
        {pendingWorkers.length === 0 ? (
          <EmptyState message={t("roster.noPending")} />
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
                  <button className="btn btn-pass btn-sm" disabled={workerBusyId === w.id} onClick={() => handleWorkerDecision(w.id, "승인")}>
                    <Icon.Check width="13" height="13" /> {t("roster.approve")}
                  </button>
                  <button className="btn btn-fail btn-sm" disabled={workerBusyId === w.id} onClick={() => handleWorkerDecision(w.id, "반려")}>
                    <Icon.Close width="12" height="12" /> {t("roster.reject")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div className="section-title">{t("roster.matrixTitle")}</div>
          <span className="eyebrow">{t("roster.approvedCount", { count: grandTotal })}</span>
        </div>
        {matrixRows.length === 0 ? (
          <EmptyState message={t("roster.noApproved")} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1.5px solid var(--line-strong)", color: "var(--ink-soft)", fontSize: 12 }}>{t("roster.company")}</th>
                  {CATEGORIES.map((c) => (
                    <th key={c.id} style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1.5px solid var(--line-strong)", color: "var(--ink-soft)", fontSize: 12 }}>
                      {t(`category.${c.id}.shortName`)}
                    </th>
                  ))}
                  <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1.5px solid var(--line-strong)", color: "var(--ink-soft)", fontSize: 12 }}>{t("roster.total")}</th>
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
                  <td style={{ padding: "9px 10px", fontWeight: 700 }}>{t("roster.grandTotal")}</td>
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

      <div className="card">
        <div style={{ padding: "16px 20px 4px" }}>
          <div className="section-title">{t("workers.status")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>{t("roster.clickHint")}</div>
        </div>
        {allWorkersSorted.length === 0 ? (
          <EmptyState message={t("workers.empty")} />
        ) : (
          allWorkersSorted.map((w) => {
            const cat = CATEGORIES.find((c) => c.id === w.categoryId);
            const warningCount = (w.warnings || []).length;
            return (
              <div className="list-row" key={w.id} onClick={() => setSelectedId(w.id)}>
                <span className="loc">{w.companyName}</span>
                <div className="grow">
                  <div className="title">{w.workerName}</div>
                  <div className="meta">{formatDateTime(w.createdAt)}</div>
                </div>
                <CategoryTag category={cat} />
                {warningCount > 0 && (
                  <span className={`badge${warningCount >= EXPEL_THRESHOLD ? " badge-반려" : " badge-대기"}`}>
                    {t("roster.warningCount", { count: warningCount })}
                  </span>
                )}
                <StatusBadge status={w.status} />
                <Icon.ChevronRight width="16" height="16" style={{ color: "var(--ink-faint)" }} />
              </div>
            );
          })
        )}
      </div>

      {selected && (
        <WorkerDetail
          worker={selected}
          onClose={() => setSelectedId(null)}
          onIssueWarning={async (reason) => {
            await onAddWorkerWarning(selected.id, { reason, issuedBy: "감리단" });
            notify(t("roster.warningIssued"));
          }}
          onExpel={async () => {
            await onUpdateWorkerStatus(selected.id, { status: "퇴출", approver: "감리단" });
            notify(t("roster.expelSuccess"));
          }}
        />
      )}
    </div>
  );
}

function WorkerDetail({ worker, onClose, onIssueWarning, onExpel }) {
  const { t } = useLanguage();
  const category = CATEGORIES.find((c) => c.id === worker.categoryId);
  const warnings = worker.warnings || [];
  const [showWarningForm, setShowWarningForm] = useState(false);
  const [reason, setReason] = useState("");
  const [showExpelConfirm, setShowExpelConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canExpel = warnings.length >= EXPEL_THRESHOLD && worker.status !== "퇴출";

  async function submitWarning() {
    if (!reason.trim()) {
      setError(t("roster.warningReasonRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onIssueWarning(reason.trim());
      setReason("");
      setShowWarningForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmExpel() {
    setBusy(true);
    try {
      await onExpel();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("roster.detailTitle")} onClose={onClose} width="560px">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <CategoryTag category={category} />
        <StatusBadge status={worker.status} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 4 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t("roster.affiliation")}</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{worker.workerName}</div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t("roster.trade")}</div>
          <div style={{ fontSize: 12.8, color: "var(--ink-soft)" }}>{worker.companyName}</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t("roster.registeredAt")}</div>
          <div style={{ fontSize: 12.8, color: "var(--ink-soft)" }}>{formatDateTime(worker.createdAt)}</div>
        </div>
      </div>

      {worker.status === "퇴출" && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--surface-alt)", borderRadius: "var(--radius-s)", fontSize: 12.5, color: "var(--fail)", fontWeight: 600 }}>
          {t("roster.expelledNotice")}
        </div>
      )}

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div className="eyebrow">{t("roster.warningCards")} ({warnings.length})</div>
          {worker.status !== "퇴출" && !showWarningForm && (
            <button className="btn btn-fail btn-sm" onClick={() => setShowWarningForm(true)}>
              <Icon.Bell width="13" height="13" /> {t("roster.issueWarning")}
            </button>
          )}
        </div>

        {showWarningForm && (
          <div style={{ marginBottom: 14, padding: "12px", background: "var(--surface-alt)", borderRadius: "var(--radius-s)" }}>
            <textarea
              className="input"
              placeholder={t("roster.warningReasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            {error && <div style={{ color: "var(--fail)", fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-fail btn-sm" disabled={busy} onClick={submitWarning}>
                {t("roster.confirmIssue")}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setShowWarningForm(false); setError(""); }}>
                {t("roster.cancel")}
              </button>
            </div>
          </div>
        )}

        {warnings.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{t("roster.noWarnings")}</div>
        ) : (
          warnings.map((w, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "7px 0", borderBottom: i < warnings.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span className="mono" style={{ color: "var(--ink-faint)", minWidth: 108, flexShrink: 0 }}>{formatDateTime(w.issuedAt)}</span>
              <span>{w.reason}</span>
            </div>
          ))
        )}
      </div>

      {worker.status !== "퇴출" && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          {showExpelConfirm ? (
            <div style={{ padding: "12px 14px", background: "var(--surface-alt)", borderRadius: "var(--radius-s)" }}>
              <div style={{ fontSize: 12.5, color: "var(--fail)", marginBottom: 10 }}>{t("roster.expelConfirm")}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-fail btn-sm" disabled={busy} onClick={confirmExpel}>
                  {t("roster.expel")}
                </button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setShowExpelConfirm(false)}>
                  {t("roster.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-fail btn-block"
              disabled={!canExpel}
              title={!canExpel ? t("roster.expelNeedsMore", { count: warnings.length }) : undefined}
              onClick={() => setShowExpelConfirm(true)}
            >
              {t("roster.expel")}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
