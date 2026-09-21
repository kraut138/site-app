import React, { useState } from "react";
import { CATEGORIES, getCategory, itemsForCategory, unitOptions, findUnitFloorPlan, isCategoryCompleteForUnit } from "../data.js";
import { compressImage } from "../api.js";
import { Icon } from "./UI.jsx";
import DrawingPin from "./DrawingPin.jsx";
import { useLanguage } from "../LanguageContext.jsx";

// 마감·설비 공종은 골조공사가 이 호실에서 전부 승인되기 전에는 요청할 수 없다(실제 시공 순서를 반영).
const FRAME_GATED_CATEGORIES = ["finish", "mep"];

// 특정 동/층/호실/공종에 대한 잠금 사유를 판정. 잠기지 않았으면 null.
// - "requested": 이미 "대기" 또는 "승인" 상태인 요청이 있음 (반려였다면 재요청 가능하도록 잠그지 않는다)
// - "frame-pending": 마감·설비 공종인데 이 호실의 골조공사가 아직 다 승인되지 않음
function unitLockReason(inspections, checklistItems, buildingId, floor, unit, categoryId) {
  const relevant = inspections.filter(
    (i) => i.buildingId === buildingId && String(i.floor) === String(floor) && i.unit === unit && i.categoryId === categoryId
  );
  if (relevant.length > 0) {
    const latest = [...relevant].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    if (latest.status === "대기" || latest.status === "승인") return "requested";
  }
  if (FRAME_GATED_CATEGORIES.includes(categoryId) && !isCategoryCompleteForUnit(inspections, checklistItems, buildingId, floor, unit, "frame")) {
    return "frame-pending";
  }
  return null;
}

// 하도급사가 감리단에게 공사 완료 확인을 요청하는 폼 ("공사 확인 요청").
// 제출되면 공사 확인 요청 내역(감리검측 승인 큐)에 대기 건으로 들어간다.
// fixedUnit: {buildingId, floor, unit}이 주어지면(QR로 특정 호실에 들어온 경우) 동/호실 선택 UI를 생략하고
// 그 호실 하나로 고정한다.
export default function ConfirmationRequestForm({ buildings, checklistItems, inspections, unitFloorPlans, fixedUnit, onClose, onSubmit }) {
  const { t } = useLanguage();
  const LOCK_MESSAGES = { requested: t("req.lockRequested"), "frame-pending": t("req.lockFramePending") };
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [buildingId, setBuildingId] = useState(fixedUnit?.buildingId || buildings[0]?.id || "");
  const [selectedUnits, setSelectedUnits] = useState(() => (fixedUnit ? new Set([`${fixedUnit.floor}-${fixedUnit.unit}`]) : new Set()));
  const [checkedItemIds, setCheckedItemIds] = useState([]);
  const [pin, setPin] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [memo, setMemo] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const category = getCategory(categoryId);
  const categoryName = t(`category.${categoryId}.name`);
  const categoryItems = itemsForCategory(checklistItems, categoryId);
  const selectedBuilding = buildings.find((b) => b.id === buildingId) || null;
  const floorsList = selectedBuilding ? Array.from({ length: selectedBuilding.floors || 1 }, (_, i) => i + 1).reverse() : [];
  const unitsPerFloorList = selectedBuilding ? unitOptions(selectedBuilding.unitsPerFloor) : [];
  // 도면 미리보기는 선택된 호실 중 첫 번째 기준(여러 호실을 한 번에 고를 수 있어 완전히 정확하진 않지만,
  // 같은 핀 위치를 여러 호실에 공통 적용하는 배치 제출 특성상 대표 하나로 보여준다)
  const firstSelectedUnit = fixedUnit ? fixedUnit.unit : selectedUnits.size > 0 ? Array.from(selectedUnits)[0].split("-")[1] : null;
  const previewFloorPlan = selectedBuilding && firstSelectedUnit ? findUnitFloorPlan(unitFloorPlans, selectedBuilding.id, firstSelectedUnit) : null;
  // 고정 호실 모드에서는 "이 공종에 대해 이미 요청했거나 승인됐는지 / 골조가 안 끝났는지"를 통째로 확인해서
  // 잠겨있으면 폼 자체를 숨기고 안내만 보여준다(호실 선택 그리드가 없으므로 버튼별 잠금 대신 전체 잠금).
  const fixedUnitLockReason = fixedUnit ? unitLockReason(inspections, checklistItems, fixedUnit.buildingId, fixedUnit.floor, fixedUnit.unit, categoryId) : null;

  function unitKey(floor, unit) {
    return `${floor}-${unit}`;
  }

  function lockReasonFor(floor, unit) {
    return selectedBuilding ? unitLockReason(inspections, checklistItems, selectedBuilding.id, floor, unit, categoryId) : null;
  }

  function locked(floor, unit) {
    return lockReasonFor(floor, unit) !== null;
  }

  function toggleUnit(floor, unit) {
    if (locked(floor, unit)) return;
    const key = unitKey(floor, unit);
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleFloor(floor) {
    const keys = unitsPerFloorList.filter((u) => !locked(floor, u)).map((u) => unitKey(floor, u));
    if (keys.length === 0) return;
    const allOn = keys.every((k) => selectedUnits.has(k));
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  function selectAllUnits() {
    const all = new Set();
    floorsList.forEach((f) => unitsPerFloorList.forEach((u) => { if (!locked(f, u)) all.add(unitKey(f, u)); }));
    setSelectedUnits(all);
  }

  function handleBuildingChange(id) {
    setBuildingId(id);
    setSelectedUnits(new Set());
  }

  function toggleItem(id) {
    setCheckedItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handlePhotoAdd(e) {
    const files = Array.from(e.target.files || []).slice(0, 3 - photos.length);
    for (const f of files) {
      try {
        const dataUrl = await compressImage(f);
        setPhotos((prev) => [...prev, dataUrl].slice(0, 3));
      } catch (err) {
        setError(err.message);
      }
    }
    e.target.value = "";
  }

  async function submit(e) {
    e.preventDefault();
    if (!buildingId || selectedUnits.size === 0 || !requestedBy) {
      setError(t("req.validationError"));
      return;
    }
    if (fixedUnit && fixedUnitLockReason) {
      setError(t("req.lockedSubmitError"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const units = Array.from(selectedUnits).map((key) => {
        const [floorStr, unit] = key.split("-");
        return { floor: Number(floorStr), unit };
      });
      await onSubmit({
        categoryId,
        buildingId,
        units,
        checkedItemIds,
        photos,
        pin,
        memo,
        requestedBy,
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
        <div className="field-row">
          <div className="field">
            <label>{t("req.category")}</label>
            <select
              className="input"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setCheckedItemIds([]);
                if (!fixedUnit) setSelectedUnits(new Set());
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{t(`category.${c.id}.name`)}</option>
              ))}
            </select>
          </div>
          {!fixedUnit && (
            <div className="field">
              <label>{t("req.building")}</label>
              <select className="input" value={buildingId} onChange={(e) => handleBuildingChange(e.target.value)}>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {fixedUnit ? (
          <div className="field">
            <label>{t("req.appliedUnit")}</label>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--blueprint-deep)" }}>
              {selectedBuilding?.name} {t("insp.location", { floor: fixedUnit.floor, unit: fixedUnit.unit })}
            </div>
          </div>
        ) : (
        <div className="field">
          <label>{t("req.selectUnits")} {selectedUnits.size > 0 ? t("req.unitsSelectedCount", { count: selectedUnits.size }) : ""}</label>
          {!selectedBuilding ? (
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{t("req.selectBuildingFirst")}</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllUnits}>
                  {t("req.selectAllInBuilding")}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedUnits(new Set())}>
                  {t("req.clearSelection")}
                </button>
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius-s)", padding: "8px 10px" }}>
                {floorsList.map((f) => {
                  const keys = unitsPerFloorList.map((u) => unitKey(f, u));
                  const allOn = keys.every((k) => selectedUnits.has(k));
                  return (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                      <button
                        type="button"
                        onClick={() => toggleFloor(f)}
                        className="mono"
                        style={{
                          width: 42,
                          flexShrink: 0,
                          fontSize: 12,
                          fontWeight: 700,
                          color: allOn ? "var(--blueprint)" : "var(--ink-faint)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          padding: 0,
                        }}
                      >
                        {t("req.floorLabel", { floor: f })}
                      </button>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {unitsPerFloorList.map((u) => {
                          const active = selectedUnits.has(unitKey(f, u));
                          const reason = lockReasonFor(f, u);
                          return (
                            <button
                              type="button"
                              key={u}
                              disabled={!!reason}
                              onClick={() => toggleUnit(f, u)}
                              title={reason ? LOCK_MESSAGES[reason] : undefined}
                              className={`unit-picker-btn${active ? " active" : ""}${reason ? " locked" : ""}`}
                              style={{ minWidth: 34, padding: "5px 8px", fontSize: 11.5 }}
                            >
                              {u}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        )}

        {fixedUnit && fixedUnitLockReason ? (
          <div style={{ padding: "14px 16px", background: "var(--surface-alt)", borderRadius: "var(--radius-s)", fontSize: 12.5, color: "var(--ink-soft)" }}>
            {fixedUnitLockReason === "frame-pending"
              ? t("req.frameGatedMsg", { category: categoryName })
              : t("req.alreadyRequestedMsg", { category: categoryName })}
          </div>
        ) : (
        <>
        <div className="field">
          <label>{t("req.checkedItemsLabel", { category: categoryName })}</label>
          {categoryItems.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{t("req.noItems")}</div>
          )}
          {categoryItems.map((item) => (
            <label key={item.id} className={`checklist-item${checkedItemIds.includes(item.id) ? " checked" : ""}`}>
              <input type="checkbox" checked={checkedItemIds.includes(item.id)} onChange={() => toggleItem(item.id)} />
              <span className="txt">{item.text}</span>
            </label>
          ))}
        </div>

        <div className="field">
          <label>{t("req.drawingLocation")}</label>
          <DrawingPin pin={pin} onPin={setPin} pinColor="#17456f" dxfData={previewFloorPlan} />
        </div>

        <div className="field">
          <label>{t("req.photos")}</label>
          <div className="photo-row">
            {photos.map((p, i) => (
              <div className="photo-thumb" key={i}>
                <img src={p} alt={t("req.photoAlt", { n: i + 1 })} />
                <button type="button" className="rm" onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}>
                  ✕
                </button>
              </div>
            ))}
            {photos.length < 3 && (
              <label className="photo-add">
                <Icon.Camera width="22" height="22" />
                <input type="file" accept="image/*" multiple hidden onChange={handlePhotoAdd} />
              </label>
            )}
          </div>
        </div>

        <div className="field">
          <label>{t("req.memo")}</label>
          <textarea className="input" placeholder={t("req.memoPlaceholder")} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>

        <div className="field">
          <label>{t("req.requesterName")}</label>
          <input className="input" placeholder={t("req.requesterPlaceholder")} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
        </div>

        {error && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
            {busy ? t("req.submitting") : t("req.submit")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t("req.cancel")}
          </button>
        </div>
        </>
        )}
      </form>
  );
}
