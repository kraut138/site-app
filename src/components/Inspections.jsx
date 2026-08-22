import React, { useState, useMemo } from "react";
import { CATEGORIES, getCategory, itemsForCategory, findItemText, formatDateTime, unitOptions, findUnitFloorPlan, ROLES } from "../data.js";
import { compressImage } from "../api.js";
import { Icon, StatusBadge, CategoryTag, Modal, EmptyState, Stamp } from "./UI.jsx";
import DrawingPin from "./DrawingPin.jsx";

const TABS = ["전체", "대기", "승인", "반려"];

export default function Inspections({ role, buildings, inspections, checklistItems, unitFloorPlans, onCreate, onUpdateStatus, notify }) {
  const [tab, setTab] = useState("전체");
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    const sorted = [...inspections].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (tab === "전체") return sorted;
    return sorted.filter((i) => i.status === tab);
  }, [inspections, tab]);

  const selected = inspections.find((i) => i.id === selectedId) || null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {TABS.map((t) => {
            const count = t === "전체" ? inspections.length : inspections.filter((i) => i.status === t).length;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
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
        {role === ROLES.SUB && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon.Plus width="15" height="15" />
            검측 요청 작성
          </button>
        )}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState message="해당하는 검측 요청이 없습니다." />
        ) : (
          filtered.map((insp) => {
            const cat = getCategory(insp.categoryId);
            const building = buildings.find((b) => b.id === insp.buildingId);
            return (
              <div className="list-row" key={insp.id} onClick={() => setSelectedId(insp.id)}>
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

      {showForm && (
        <InspectionForm
          buildings={buildings}
          checklistItems={checklistItems}
          unitFloorPlans={unitFloorPlans}
          onClose={() => setShowForm(false)}
          onSubmit={async (data) => {
            const created = await onCreate(data);
            setShowForm(false);
            notify(created.length > 1 ? `${created.length}개 호실에 대해 검측 요청을 제출했습니다.` : "검측 요청이 제출되었습니다.");
          }}
        />
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

function InspectionForm({ buildings, checklistItems, unitFloorPlans, onClose, onSubmit }) {
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id || "");
  const [selectedUnits, setSelectedUnits] = useState(new Set()); // "floor-unit" 키 집합
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
  const firstSelectedUnit = selectedUnits.size > 0 ? Array.from(selectedUnits)[0].split("-")[1] : null;
  const previewFloorPlan = selectedBuilding && firstSelectedUnit ? findUnitFloorPlan(unitFloorPlans, selectedBuilding.id, firstSelectedUnit) : null;

  function unitKey(floor, unit) {
    return `${floor}-${unit}`;
  }

  function toggleUnit(floor, unit) {
    const key = unitKey(floor, unit);
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleFloor(floor) {
    const keys = unitsPerFloorList.map((u) => unitKey(floor, u));
    const allOn = keys.every((k) => selectedUnits.has(k));
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  function selectAllUnits() {
    const all = new Set();
    floorsList.forEach((f) => unitsPerFloorList.forEach((u) => all.add(unitKey(f, u))));
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
    <Modal title="검측 요청 작성" onClose={onClose} width="700px">
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
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>동</label>
            <select className="input" value={buildingId} onChange={(e) => handleBuildingChange(e.target.value)}>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

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
                          return (
                            <button
                              type="button"
                              key={u}
                              onClick={() => toggleUnit(f, u)}
                              className={`unit-picker-btn${active ? " active" : ""}`}
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
          <label>검측 부위 사진 (최대 3장)</label>
          <div className="photo-row">
            {photos.map((p, i) => (
              <div className="photo-thumb" key={i}>
                <img src={p} alt={`검측사진 ${i + 1}`} />
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

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "제출 중…" : "검측 요청 제출"}
        </button>
      </form>
    </Modal>
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
