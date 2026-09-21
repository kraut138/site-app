import React, { useState, useMemo } from "react";
import { CATEGORIES, getCategory, itemsForCategory, findItemText, formatDateTime, findUnitFloorPlan, ROLES, isAdminRole } from "../data.js";
import { Icon, StatusBadge, CategoryTag, Modal, EmptyState, Stamp } from "./UI.jsx";
import DrawingPin from "./DrawingPin.jsx";
import ConfirmationRequestForm from "./ConfirmationRequestForm.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { LANGUAGES } from "../i18n.js";

const TAB_KEYS = [
  { value: "전체", key: "insp.tab.all" },
  { value: "대기", key: "insp.tab.pending" },
  { value: "승인", key: "insp.tab.approved" },
  { value: "반려", key: "insp.tab.rejected" },
];

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
  const { t, lang, setLang } = useLanguage();
  const [tab, setTab] = useState("전체");
  const [selectedId, setSelectedId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [batchRejectComment, setBatchRejectComment] = useState("");
  const [showBatchReject, setShowBatchReject] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [openCategories, setOpenCategories] = useState(new Set());
  const [openItems, setOpenItems] = useState(new Set());
  const canRequest = role === ROLES.SUB;

  const filtered = useMemo(() => {
    const sorted = [...inspections].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (tab === "전체") return sorted;
    return sorted.filter((i) => i.status === tab);
  }, [inspections, tab]);

  const pendingInFiltered = filtered.filter((i) => i.status === "대기");
  const selected = inspections.find((i) => i.id === selectedId) || null;
  const canBatch = isAdminRole(role);

  // 공종 -> 세부 공종 순으로 그룹화. 한 요청이 세부 항목을 여러 개 체크했다면 그 항목마다 각각 나타난다
  // (체크박스 선택 상태는 요청 id 기준으로 공유되므로 어느 그룹에서 선택하든 동일하게 반영된다).
  const groupedByCategory = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const catRequests = filtered.filter((i) => i.categoryId === cat.id);
      const items = itemsForCategory(checklistItems, cat.id);
      const itemGroups = items
        .map((item) => ({ item, requests: catRequests.filter((i) => Array.isArray(i.checkedItemIds) && i.checkedItemIds.includes(item.id)) }))
        .filter((g) => g.requests.length > 0);
      const uncategorized = catRequests.filter((i) => !Array.isArray(i.checkedItemIds) || i.checkedItemIds.length === 0);
      return { category: cat, total: catRequests.length, itemGroups, uncategorized };
    }).filter((g) => g.total > 0);
  }, [filtered, checklistItems]);

  function toggleCategoryOpen(id) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleItemOpen(id) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      notify(t("insp.batchApproveSuccess", { count: ids.length }));
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
      notify(t("insp.batchRejectSuccess", { count: ids.length }));
      clearChecked();
    } finally {
      setBatchBusy(false);
    }
  }

  function renderRequestRow(insp) {
    const cat = getCategory(insp.categoryId);
    const building = buildings.find((b) => b.id === insp.buildingId);
    const isPending = insp.status === "대기";
    return (
      <div className="list-row ig-request-row" key={insp.id} onClick={() => setSelectedId(insp.id)}>
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
          {building ? building.name : "-"} {insp.unit ? t("insp.location", { floor: insp.floor, unit: insp.unit }) : t("insp.locationNoUnit", { floor: insp.floor })}
        </span>
        <div className="grow">
          <div className="title">
            {cat ? t(`category.${cat.id}.name`) : "-"} · {t("insp.itemsChecked", { count: insp.checkedItemIds.length })}
          </div>
          <div className="meta">{insp.requestedBy} · {formatDateTime(insp.createdAt)}</div>
        </div>
        <StatusBadge status={insp.status} />
        <Icon.ChevronRight width="16" height="16" style={{ color: "var(--ink-faint)" }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {TAB_KEYS.map(({ value, key }) => {
            const count = value === "전체" ? inspections.length : inspections.filter((i) => i.status === value).length;
            return (
              <button
                key={value}
                onClick={() => {
                  setTab(value);
                  clearChecked();
                }}
                className="chip"
                style={{
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: tab === value ? "var(--blueprint)" : "transparent",
                  background: tab === value ? "var(--blueprint)" : "var(--surface-alt)",
                  color: tab === value ? "#fff" : "var(--ink-soft)",
                }}
              >
                {t(key)} {count}
              </button>
            );
          })}
        </div>
        {canBatch && pendingInFiltered.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" onClick={selectAllPending}>
              {t("insp.selectAllPending", { count: pendingInFiltered.length })}
            </button>
            {checkedIds.size > 0 && (
              <>
                <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{t("insp.selectedCount", { count: checkedIds.size })}</span>
                <button className="btn btn-pass btn-sm" disabled={batchBusy} onClick={handleBatchApprove}>
                  <Icon.Check width="14" height="14" /> {t("insp.batchApprove")}
                </button>
                <button className="btn btn-fail btn-sm" disabled={batchBusy} onClick={() => setShowBatchReject((v) => !v)}>
                  <Icon.Close width="13" height="13" /> {t("insp.batchReject")}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={clearChecked}>
                  {t("insp.clearSelection")}
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
                {t("insp.cancelWrite")}
              </>
            ) : (
              <>
                <Icon.Plus width="15" height="15" />
                {t("insp.newRequest")}
              </>
            )}
          </button>
        )}
      </div>

      {showRequestForm && (
        <div className="card card-pad" style={{ marginBottom: 18, border: "1.5px solid var(--blueprint)" }}>
          <div className="section-head">
            <div className="section-title">{t("insp.writeTitle")}</div>
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
              notify(created.length > 1 ? t("insp.multiUnitSuccess", { count: created.length }) : t("insp.singleSuccess"));
            }}
          />
        </div>
      )}

      {showBatchReject && (
        <div className="card card-pad" style={{ marginBottom: 14, border: "1.5px solid var(--fail)" }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
            {t("insp.batchRejectReason", { count: checkedIds.size })}
          </label>
          <textarea
            className="input"
            placeholder={t("insp.rejectPlaceholder")}
            value={batchRejectComment}
            onChange={(e) => setBatchRejectComment(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-fail btn-sm" disabled={batchBusy || !batchRejectComment.trim()} onClick={handleBatchReject}>
              {t("insp.confirmReject")}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowBatchReject(false)}>
              {t("insp.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState message={t("insp.empty")} />
        ) : (
          groupedByCategory.map(({ category, total, itemGroups, uncategorized }) => {
            const catOpen = openCategories.has(category.id);
            return (
              <div key={category.id} className="ig-category">
                <button type="button" className="ig-category-head" onClick={() => toggleCategoryOpen(category.id)}>
                  <Icon.ChevronRight width="15" height="15" className={`ig-chevron${catOpen ? " open" : ""}`} />
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: category.color, flexShrink: 0 }} />
                  <span className="ig-category-name">{t(`category.${category.id}.name`)}</span>
                  <span className="eyebrow">{total}{t("common.case")}</span>
                </button>
                {catOpen && (
                  <div className="ig-category-body">
                    {itemGroups.map(({ item, requests }) => {
                      const itemOpen = openItems.has(item.id);
                      return (
                        <div key={item.id} className="ig-item">
                          <button type="button" className="ig-item-head" onClick={() => toggleItemOpen(item.id)}>
                            <Icon.ChevronRight width="13" height="13" className={`ig-chevron${itemOpen ? " open" : ""}`} />
                            <span className="ig-item-name">{item.text}</span>
                            <span className="eyebrow">{requests.length}{t("common.case")}</span>
                          </button>
                          {itemOpen && (
                            <div>
                              {requests.map((insp) => renderRequestRow(insp))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {uncategorized.length > 0 && (
                      <div className="ig-item">
                        <button type="button" className="ig-item-head" onClick={() => toggleItemOpen(`${category.id}-none`)}>
                          <Icon.ChevronRight width="13" height="13" className={`ig-chevron${openItems.has(`${category.id}-none`) ? " open" : ""}`} />
                          <span className="ig-item-name">{t("insp.noCheckedItems")}</span>
                          <span className="eyebrow">{uncategorized.length}{t("common.case")}</span>
                        </button>
                        {openItems.has(`${category.id}-none`) && <div>{uncategorized.map((insp) => renderRequestRow(insp))}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {role === ROLES.SUB && (
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
      )}

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
  const { t } = useLanguage();
  const category = getCategory(insp.categoryId);
  const [comment, setComment] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const decided = insp.status !== "대기";

  async function decide(status) {
    if (status === "반려" && !comment.trim()) {
      setError(t("insp.rejectReasonRequired"));
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
    <Modal title={t("insp.detailTitle")} onClose={onClose} width="680px">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <CategoryTag category={category} />
        <StatusBadge status={insp.status} />
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          {building ? building.name : "-"} {insp.unit ? t("insp.location", { floor: insp.floor, unit: insp.unit }) : t("insp.locationNoUnit", { floor: insp.floor })}
        </span>
      </div>

      {decided && <Stamp type={insp.status === "승인" ? "pass" : "fail"} />}

      <div className="grid grid-2" style={{ marginBottom: 4 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("insp.checkedItems", { count: insp.checkedItemIds.length })}</div>
          {insp.checkedItemIds.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{t("insp.noSelectedItems")}</div>}
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
              <div className="eyebrow" style={{ margin: "12px 0 6px" }}>{t("insp.memo")}</div>
              <div style={{ fontSize: 12.8 }}>{insp.memo}</div>
            </>
          )}
          <div className="eyebrow" style={{ margin: "12px 0 6px" }}>{t("insp.requestInfo")}</div>
          <div style={{ fontSize: 12.8, color: "var(--ink-soft)" }}>
            {insp.requestedBy} · {formatDateTime(insp.createdAt)}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("insp.drawingLocation")}</div>
          {insp.pin ? <DrawingPin pin={insp.pin} pinColor={category?.color} dxfData={findUnitFloorPlan(unitFloorPlans, insp.buildingId, insp.unit)} /> : <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{t("insp.noLocation")}</div>}
        </div>
      </div>

      {insp.photos && insp.photos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("insp.photos")}</div>
          <div className="photo-row">
            {insp.photos.map((p, i) => (
              <div className="photo-thumb" key={i} style={{ width: 96, height: 96 }}>
                <img src={p} alt={t("insp.photoAlt", { n: i + 1 })} />
              </div>
            ))}
          </div>
        </div>
      )}

      {insp.history && insp.history.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("insp.history")}</div>
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

      {isAdminRole(role) && !decided && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          {showReject && (
            <div className="field">
              <label>{t("insp.rejectReasonLabel")}</label>
              <textarea className="input" placeholder={t("insp.rejectPlaceholder")} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          )}
          {error && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-pass" style={{ flex: 1 }} disabled={busy} onClick={() => decide("승인")}>
              <Icon.Check width="15" height="15" /> {t("insp.approve")}
            </button>
            <button
              className="btn btn-fail"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => (showReject ? decide("반려") : setShowReject(true))}
            >
              <Icon.Close width="14" height="14" /> {showReject ? t("insp.confirmReject") : t("insp.reject")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
