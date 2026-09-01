import React, { useState, useMemo } from "react";
import { getCategory, findItemText, formatDateTime, findUnitFloorPlan, ROLES } from "../data.js";
import { Icon, StatusBadge, CategoryTag, Modal, EmptyState, Stamp } from "./UI.jsx";
import DrawingPin from "./DrawingPin.jsx";
import ConfirmationRequestForm from "./ConfirmationRequestForm.jsx";

const TABS = ["전체", "대기", "승인", "반려"];

export default function Inspections({
  role,
  buildings,
  inspections,
  checklistItems,
  unitFloorPlans,
  onCreateConfirmationRequest,
  onUpdateStatus,
  onBatchUpdateStatus,
  notify,
}) {
  const [tab, setTab] = useState("전체");
  const [selectedId, setSelectedId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [batchRejectComment, setBatchRejectComment] = useState("");
  const [showBatchReject, setShowBatchReject] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const canRequest = role === ROLES.SUB;

  const filtered = useMemo(() => {
    const sorted = [...inspections].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (tab === "전체") return sorted;
    return sorted.filter((i) => i.status === tab);
  }, [inspections, tab]);

  const pendingInFiltered = filtered.filter((i) => i.status === "대기");
  const selected = inspections.find((i) => i.id === selectedId) || null;
  const canBatch = role === ROLES.SUPER;

  function toggleCheck(id, e) {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllPending() {
    setCheckedIds(new Set(pendingInFiltered.map((i) => i.id)));
  }

  function clearChecked() {
    setCheckedIds(new Set());
    setShowBatchReject(false);
    setBatchRejectComment("");
  }

  async function handleBatchApprove() {
    if (checkedIds.size === 0) return;
    setBatchBusy(true);
    try {
      const ids = Array.from(checkedIds);
      await onBatchUpdateStatus(ids, { status: "승인", approver: "감리단 담당자" });
      notify(`${ids.length}건을 일괄 승인했습니다.`);
      clearChecked();
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleBatchReject() {
    if (checkedIds.size === 0) return;
    if (!batchRejectComment.trim()) return;
    setBatchBusy(true);
    try {
      const ids = Array.from(checkedIds);
      await onBatchUpdateStatus(ids, { status: "반려", comment: batchRejectComment, approver: "감리단 담당자" });
      notify(`${ids.length}건을 일괄 반려하고 NCR을 발행했습니다.`);
      clearChecked();
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {TABS.map((t) => {
            const count = t === "전체" ? inspections.length : inspections.filter((i) => i.status === t).length;
            return (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  clearChecked();
                }}
                className="chip"
                style={{
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: tab === t ? "var(--blueprint)" : "transparent",
                  background: tab === t ? "var(--blueprint)" : "var(--surface-alt)",
                  color: tab === t ? "#fff" : "var(--ink-soft)",
                }}
              >
                {t} {count}
              </button>
            );
          })}
        </div>
        {canBatch && pendingInFiltered.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" onClick={selectAllPending}>
              대기 전체 선택 ({pendingInFiltered.length})
            </button>
            {checkedIds.size > 0 && (
              <>
                <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{checkedIds.size}건 선택됨</span>
                <button className="btn btn-pass btn-sm" disabled={batchBusy} onClick={handleBatchApprove}>
                  <Icon.Check width="14" height="14" /> 일괄 승인
                </button>
                <button className="btn btn-fail btn-sm" disabled={batchBusy} onClick={() => setShowBatchReject((v) => !v)}>
                  <Icon.Close width="13" height="13" /> 일괄 반려
                </button>
                <button className="btn btn-ghost btn-sm" onClick={clearChecked}>
                  선택 해제
                </button>
              </>
            )}
          </div>
        )}
        {canRequest && (
          <button className="btn btn-primary" onClick={() => setShowRequestForm((v) => !v)}>
            {showRequestForm ? (
              <>
                <Icon.Close width="14" height="14" />
                작성 취소
              </>
            ) : (
              <>
                <Icon.Plus width="15" height="15" />
                공사 확인 요청
              </>
            )}
          </button>
        )}
      </div>

      {showRequestForm && (
        <div className="card card-pad" style={{ marginBottom: 18, border: "1.5px solid var(--blueprint)" }}>
          <div className="section-head">
            <div className="section-title">공사 확인 요청 작성</div>
          </div>
          <ConfirmationRequestForm
            buildings={buildings}
            checklistItems={checklistItems}
            inspections={inspections}
            unitFloorPlans={unitFloorPlans}
            onClose={() => setShowRequestForm(false)}
            onSubmit={async (data) => {
              const created = await onCreateConfirmationRequest(data);
              setShowRequestForm(false);
              notify(created.length > 1 ? `${created.length}개 호실에 대해 공사 확인을 요청했습니다.` : "공사 확인을 요청했습니다.");
            }}
          />
        </div>
      )}

      {showBatchReject && (
        <div className="card card-pad" style={{ marginBottom: 14, border: "1.5px solid var(--fail)" }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
            반려 사유 (선택한 {checkedIds.size}건 모두에 동일하게 기록되며, 각 건마다 NCR이 발행됩니다)
          </label>
          <textarea
            className="input"
            placeholder="예: 철근 이격거리 기준 미달, 재시공 필요"
            value={batchRejectComment}
            onChange={(e) => setBatchRejectComment(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-fail btn-sm" disabled={batchBusy || !batchRejectComment.trim()} onClick={handleBatchReject}>
              반려 확정
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowBatchReject(false)}>
              취소
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState message="해당하는 검측 요청이 없습니다." />
        ) : (
          filtered.map((insp) => {
            const cat = getCategory(insp.categoryId);
            const building = buildings.find((b) => b.id === insp.buildingId);
            const isPending = insp.status === "대기";
            return (
              <div className="list-row" key={insp.id} onClick={() => setSelectedId(insp.id)}>
                {canBatch && isPending && (
                  <input
                    type="checkbox"
                    checked={checkedIds.has(insp.id)}
                    onChange={() => {}}
                    onClick={(e) => toggleCheck(insp.id, e)}
                    style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                  />
                )}
                <span className="loc">
                  {building ? building.name : "-"} {insp.floor}층{insp.unit ? ` ${insp.unit}호` : ""}
                </span>
                <div className="grow">
                  <div className="title">
                    {cat ? cat.name : "-"} · {insp.checkedItemIds.length}개 항목 확인
                  </div>
                  <div className="meta">{insp.requestedBy} · {formatDateTime(insp.createdAt)}</div>
                </div>
                <CategoryTag category={cat} />
                <StatusBadge status={insp.status} />
                <Icon.ChevronRight width="16" height="16" style={{ color: "var(--ink-faint)" }} />
              </div>
            );
          })
        )}
      </div>

      {selected && (
        <InspectionDetail
          insp={selected}
          building={buildings.find((b) => b.id === selected.buildingId)}
          role={role}
          checklistItems={checklistItems}
          unitFloorPlans={unitFloorPlans}
          onClose={() => setSelectedId(null)}
          onDecide={async (status, comment) => {
            const res = await onUpdateStatus(selected.id, { status, comment, approver: "감리단 담당자" });
            notify(status === "승인" ? "검측을 승인했습니다." : "검측을 반려하고 NCR을 발행했습니다.");
            return res;
          }}
        />
      )}
    </div>
  );
}

function InspectionDetail({ insp, building, role, checklistItems, unitFloorPlans, onClose, onDecide }) {
  const category = getCategory(insp.categoryId);
  const [comment, setComment] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const decided = insp.status !== "대기";

  async function decide(status) {
    if (status === "반려" && !comment.trim()) {
      setError("반려 사유를 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onDecide(status, comment);
      setBusy(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="검측 상세" onClose={onClose} width="680px">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <CategoryTag category={category} />
        <StatusBadge status={insp.status} />
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          {building ? building.name : "-"} {insp.floor}층{insp.unit ? ` ${insp.unit}호` : ""}
        </span>
      </div>

      {decided && <Stamp type={insp.status === "승인" ? "pass" : "fail"} />}

      <div className="grid grid-2" style={{ marginBottom: 4 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>확인된 체크 항목 ({insp.checkedItemIds.length})</div>
          {insp.checkedItemIds.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>선택된 항목 없음</div>}
          {insp.checkedItemIds.map((id) => {
            const text = findItemText(checklistItems, id);
            return (
              <div key={id} style={{ display: "flex", gap: 7, fontSize: 12.8, marginBottom: 6, color: "var(--ink-soft)" }}>
                <Icon.Check width="14" height="14" style={{ color: "var(--pass)", flexShrink: 0, marginTop: 1 }} />
                {text}
              </div>
            );
          })}
          {insp.memo && (
            <>
              <div className="eyebrow" style={{ margin: "12px 0 6px" }}>메모</div>
              <div style={{ fontSize: 12.8 }}>{insp.memo}</div>
            </>
          )}
          <div className="eyebrow" style={{ margin: "12px 0 6px" }}>요청 정보</div>
          <div style={{ fontSize: 12.8, color: "var(--ink-soft)" }}>
            {insp.requestedBy} · {formatDateTime(insp.createdAt)}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>도면 위치</div>
          {insp.pin ? <DrawingPin pin={insp.pin} pinColor={category?.color} dxfData={findUnitFloorPlan(unitFloorPlans, insp.buildingId, insp.unit)} /> : <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>지정된 위치 없음</div>}
        </div>
      </div>

      {insp.photos && insp.photos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>검측 사진</div>
          <div className="photo-row">
            {insp.photos.map((p, i) => (
              <div className="photo-thumb" key={i} style={{ width: 96, height: 96 }}>
                <img src={p} alt={`사진 ${i + 1}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {insp.history && insp.history.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>처리 이력</div>
          {insp.history.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 12.3, color: "var(--ink-soft)", padding: "5px 0", borderBottom: i < insp.history.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span className="mono" style={{ color: "var(--ink-faint)", minWidth: 108 }}>{formatDateTime(h.at)}</span>
              <span style={{ fontWeight: 600 }}>{h.action}</span>
              <span>{h.by}</span>
              {h.comment && <span style={{ color: "var(--ink-faint)" }}>— {h.comment}</span>}
            </div>
          ))}
        </div>
      )}

      {role === ROLES.SUPER && !decided && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          {showReject && (
            <div className="field">
              <label>반려 사유 (NCR에 기록됩니다)</label>
              <textarea className="input" placeholder="예: 철근 이격거리 기준 미달, 재시공 필요" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          )}
          {error && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-pass" style={{ flex: 1 }} disabled={busy} onClick={() => decide("승인")}>
              <Icon.Check width="15" height="15" /> 승인
            </button>
            <button
              className="btn btn-fail"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => (showReject ? decide("반려") : setShowReject(true))}
            >
              <Icon.Close width="14" height="14" /> {showReject ? "반려 확정" : "반려"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
