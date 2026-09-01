import React, { useState } from "react";
import { CATEGORIES, getCategory, itemsForCategory, unitOptions, findUnitFloorPlan } from "../data.js";
import { compressImage } from "../api.js";
import { Icon } from "./UI.jsx";
import DrawingPin from "./DrawingPin.jsx";

// 특정 동/층/호실/공종에 대해 이미 "대기" 또는 "승인" 상태인 요청이 있는지 확인.
// 가장 최근 요청 기준으로, "반려"였다면 재요청 가능하도록 잠그지 않는다.
function isUnitLocked(inspections, buildingId, floor, unit, categoryId) {
  const relevant = inspections.filter(
    (i) => i.buildingId === buildingId && String(i.floor) === String(floor) && i.unit === unit && i.categoryId === categoryId
  );
  if (relevant.length === 0) return false;
  const latest = [...relevant].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  return latest.status === "대기" || latest.status === "승인";
}

// 하도급사가 감리단에게 공사 완료 확인을 요청하는 폼 ("공사 확인 요청").
// 제출되면 공사 확인 요청 내역(감리검측 승인 큐)에 대기 건으로 들어간다.
// fixedUnit: {buildingId, floor, unit}이 주어지면(QR로 특정 호실에 들어온 경우) 동/호실 선택 UI를 생략하고
// 그 호실 하나로 고정한다.
export default function ConfirmationRequestForm({ buildings, checklistItems, inspections, unitFloorPlans, fixedUnit, onClose, onSubmit }) {
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
  const categoryItems = itemsForCategory(checklistItems, categoryId);
  const selectedBuilding = buildings.find((b) => b.id === buildingId) || null;
  const floorsList = selectedBuilding ? Array.from({ length: selectedBuilding.floors || 1 }, (_, i) => i + 1).reverse() : [];
  const unitsPerFloorList = selectedBuilding ? unitOptions(selectedBuilding.unitsPerFloor) : [];
  // 도면 미리보기는 선택된 호실 중 첫 번째 기준(여러 호실을 한 번에 고를 수 있어 완전히 정확하진 않지만,
  // 같은 핀 위치를 여러 호실에 공통 적용하는 배치 제출 특성상 대표 하나로 보여준다)
  const firstSelectedUnit = fixedUnit ? fixedUnit.unit : selectedUnits.size > 0 ? Array.from(selectedUnits)[0].split("-")[1] : null;
  const previewFloorPlan = selectedBuilding && firstSelectedUnit ? findUnitFloorPlan(unitFloorPlans, selectedBuilding.id, firstSelectedUnit) : null;
  // 고정 호실 모드에서는 "이 공종에 대해 이미 요청했거나 승인됐는지"를 통째로 확인해서
  // 잠겨있으면 폼 자체를 숨기고 안내만 보여준다(호실 선택 그리드가 없으므로 버튼별 잠금 대신 전체 잠금).
  const fixedUnitLocked = fixedUnit ? isUnitLocked(inspections, fixedUnit.buildingId, fixedUnit.floor, fixedUnit.unit, categoryId) : false;

  function unitKey(floor, unit) {
    return `${floor}-${unit}`;
  }

  function locked(floor, unit) {
    return selectedBuilding ? isUnitLocked(inspections, selectedBuilding.id, floor, unit, categoryId) : false;
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
      setError("동, 호실 선택(1개 이상), 요청자 이름은 필수입니다.");
      return;
    }
    if (fixedUnit && fixedUnitLocked) {
      setError("이미 요청했거나 승인된 공종입니다.");
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
            <label>체크리스트(공종) 선택</label>
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
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {!fixedUnit && (
            <div className="field">
              <label>동</label>
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
            <label>적용 호실</label>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--blueprint-deep)" }}>
              {selectedBuilding?.name} {fixedUnit.floor}층 {fixedUnit.unit}호
            </div>
          </div>
        ) : (
        <div className="field">
          <label>호실 선택 {selectedUnits.size > 0 ? `(${selectedUnits.size}개 선택됨)` : ""}</label>
          {!selectedBuilding ? (
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>먼저 동을 선택해주세요.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllUnits}>
                  이 동 전체 선택
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedUnits(new Set())}>
                  선택 해제
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
                        {f}층
                      </button>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {unitsPerFloorList.map((u) => {
                          const active = selectedUnits.has(unitKey(f, u));
                          const isLocked = locked(f, u);
                          return (
                            <button
                              type="button"
                              key={u}
                              disabled={isLocked}
                              onClick={() => toggleUnit(f, u)}
                              title={isLocked ? "이미 요청했거나 승인된 호실입니다 (반려된 경우 다시 선택할 수 있어요)" : undefined}
                              className={`unit-picker-btn${active ? " active" : ""}${isLocked ? " locked" : ""}`}
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

        {fixedUnit && fixedUnitLocked ? (
          <div style={{ padding: "14px 16px", background: "var(--surface-alt)", borderRadius: "var(--radius-s)", fontSize: 12.5, color: "var(--ink-soft)" }}>
            {category.name}에 대해 이미 요청했거나 승인이 완료됐어요. 다른 공종을 선택하시거나, 반려된 경우 다시 요청할 수 있습니다.
          </div>
        ) : (
        <>
        <div className="field">
          <label>{category.name} 체크리스트 — 확인된 항목 선택</label>
          {categoryItems.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>등록된 체크리스트 항목이 없습니다.</div>
          )}
          {categoryItems.map((item) => (
            <label key={item.id} className={`checklist-item${checkedItemIds.includes(item.id) ? " checked" : ""}`}>
              <input type="checkbox" checked={checkedItemIds.includes(item.id)} onChange={() => toggleItem(item.id)} />
              <span className="txt">{item.text}</span>
            </label>
          ))}
        </div>

        <div className="field">
          <label>도면 위치 지정</label>
          <DrawingPin pin={pin} onPin={setPin} pinColor="#17456f" dxfData={previewFloorPlan} />
        </div>

        <div className="field">
          <label>공사 확인 사진 (최대 3장)</label>
          <div className="photo-row">
            {photos.map((p, i) => (
              <div className="photo-thumb" key={i}>
                <img src={p} alt={`확인사진 ${i + 1}`} />
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
          <label>메모 (선택)</label>
          <textarea className="input" placeholder="특이사항을 입력하세요" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>

        <div className="field">
          <label>요청자 이름 / 소속</label>
          <input className="input" placeholder="예: 대한철근 김현장" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
        </div>

        {error && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
            {busy ? "제출 중…" : "공사 확인 요청 제출"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            취소
          </button>
        </div>
        </>
        )}
      </form>
  );
}
