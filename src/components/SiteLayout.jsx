import React, { useState } from "react";
import { Icon, EmptyState, StatusBadge, CategoryTag } from "./UI.jsx";
import { SHAPE_OPTIONS, CATEGORIES, unitOptions, categoryProgress } from "../data.js";
import { compressImage } from "../api.js";
import { parseDxf } from "../dxf.js";
import DxfView from "./DxfView.jsx";
import DrawingPin from "./DrawingPin.jsx";
import RevolverSelector from "./RevolverSelector.jsx";

export default function SiteLayout({
  buildings,
  onUpdateBuilding,
  siteSettings,
  onUpdateSiteSettings,
  unitFloorPlan,
  onUpdateUnitFloorPlan,
  inspections,
  checklistItems,
  notify,
}) {
  const [armedId, setArmedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [unitPlanBusy, setUnitPlanBusy] = useState(false);
  const [unitPlanError, setUnitPlanError] = useState("");
  const [finderBuildingId, setFinderBuildingId] = useState(buildings[0]?.id || "");
  const [finderFloor, setFinderFloor] = useState(1);
  const [finderUnit, setFinderUnit] = useState("01");

  const positioned = buildings.filter((b) => typeof b.siteX === "number" && typeof b.siteY === "number");
  const armedBuilding = buildings.find((b) => b.id === armedId) || null;
  const layoutImage = siteSettings && siteSettings.layoutImage;
  const layoutDxf = siteSettings && siteSettings.layoutDxf;
  const hasUnitPlan = !!(unitFloorPlan && unitFloorPlan.shapes);
  const finderBuilding = buildings.find((b) => b.id === finderBuildingId) || buildings[0] || null;

  function handleFinderSelectBuilding(id) {
    setFinderBuildingId(id);
    setFinderFloor(1);
    setFinderUnit("01");
  }

  async function handlePlace(x, y) {
    if (!armedId) return;
    setBusyId(armedId);
    try {
      await onUpdateBuilding(armedId, { siteX: x, siteY: y });
      notify("배치 위치가 저장되었습니다.");
    } finally {
      setBusyId(null);
      setArmedId(null);
    }
  }

  async function handleClear(id) {
    setBusyId(id);
    try {
      await onUpdateBuilding(id, { siteX: null, siteY: null });
      notify("배치 위치를 초기화했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleShapeChange(id, shape) {
    setBusyId(id);
    try {
      await onUpdateBuilding(id, { shape });
      notify("동 형태가 저장되었습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleLayoutFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const isDxf = /\.dxf$/i.test(file.name);
    setImageBusy(true);
    setImageError("");
    try {
      if (isDxf) {
        const text = await file.text();
        const parsed = parseDxf(text);
        await onUpdateSiteSettings({ layoutDxf: parsed, layoutImage: null });
        notify(parsed.truncated ? "DXF 배치도를 업로드했습니다 (도형이 많아 일부만 표시됩니다)." : "DXF 배치도를 업로드했습니다.");
      } else {
        const dataUrl = await compressImage(file, 1100, 0.65);
        await onUpdateSiteSettings({ layoutImage: dataUrl, layoutDxf: null });
        notify("배치도 이미지를 업로드했습니다.");
      }
    } catch (err) {
      setImageError(err.message);
    } finally {
      setImageBusy(false);
    }
  }

  async function handleLayoutClear() {
    setImageBusy(true);
    try {
      await onUpdateSiteSettings({ layoutImage: null, layoutDxf: null });
      notify("배치도를 제거했습니다.");
    } finally {
      setImageBusy(false);
    }
  }

  async function handleUnitPlanUpload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.dxf$/i.test(file.name)) {
      setUnitPlanError("DXF 파일만 업로드할 수 있습니다.");
      return;
    }
    setUnitPlanBusy(true);
    setUnitPlanError("");
    try {
      const text = await file.text();
      const parsed = parseDxf(text);
      await onUpdateUnitFloorPlan(parsed);
      notify(parsed.truncated ? "호실 평면도를 업로드했습니다 (도형이 많아 일부만 표시됩니다)." : "호실 평면도를 업로드했습니다.");
    } catch (err) {
      setUnitPlanError(err.message);
    } finally {
      setUnitPlanBusy(false);
    }
  }

  async function handleUnitPlanClear() {
    setUnitPlanBusy(true);
    try {
      await onUpdateUnitFloorPlan({ shapes: null, bounds: null, truncated: null });
      notify("호실 평면도를 기본값으로 되돌렸습니다.");
    } finally {
      setUnitPlanBusy(false);
    }
  }

  if (buildings.length === 0) {
    return (
      <div className="card">
        <EmptyState message="먼저 동 관리 탭에서 동을 등록해주세요." />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-2" style={{ alignItems: "start", marginBottom: 16 }}>
      <div className="card card-pad">
        <div className="section-head">
          <div className="section-title">배치도 (2D)</div>
          <span className="eyebrow">{positioned.length}/{buildings.length}개동 배치됨</span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
            {imageBusy ? "처리 중…" : layoutImage || layoutDxf ? "배치도 변경" : "배치도 업로드 (이미지 또는 DXF)"}
            <input type="file" accept="image/*,.dxf" hidden onChange={handleLayoutFileUpload} disabled={imageBusy} />
          </label>
          {(layoutImage || layoutDxf) && (
            <button className="btn btn-ghost btn-sm" onClick={handleLayoutClear} disabled={imageBusy}>
              배치도 제거
            </button>
          )}
          {layoutDxf && <span className="chip">DXF 도면 · 도형 {layoutDxf.shapes?.length || 0}개</span>}
        </div>
        {imageError && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 10 }}>{imageError}</div>}

        <SiteMap2D buildings={positioned} armed={!!armedBuilding} onPlace={handlePlace} backgroundImage={layoutImage} dxfData={layoutDxf} />

        <div style={{ marginTop: 18 }}>
          {buildings.map((b) => {
            const hasPos = typeof b.siteX === "number" && typeof b.siteY === "number";
            return (
              <div
                key={b.id}
                className="list-row"
                style={{ cursor: "default", flexWrap: "wrap", background: armedId === b.id ? "var(--pass-bg)" : undefined }}
              >
                <Icon.Building width="17" height="17" style={{ color: "var(--blueprint)", flexShrink: 0 }} />
                <div className="grow">
                  <div className="title">{b.name}</div>
                  <div className="meta">
                    {b.floors}층 · 층당 {b.unitsPerFloor}세대{hasPos ? " · 배치 완료" : " · 위치 미지정"}
                  </div>
                </div>
                <select
                  className="input"
                  style={{ width: 92, padding: "6px 8px", fontSize: 12.5 }}
                  value={b.shape || "slab"}
                  disabled={busyId === b.id}
                  onChange={(e) => handleShapeChange(b.id, e.target.value)}
                >
                  {SHAPE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                {armedId === b.id ? (
                  <span className="chip" style={{ background: "var(--pass)", color: "#fff" }}>
                    지도를 클릭하세요
                  </span>
                ) : (
                  <>
                    <button className="btn btn-ghost btn-sm" disabled={busyId === b.id} onClick={() => setArmedId(b.id)}>
                      {hasPos ? "위치 다시 지정" : "위치 지정"}
                    </button>
                    {hasPos && (
                      <button className="btn btn-ghost btn-sm" disabled={busyId === b.id} onClick={() => handleClear(b.id)}>
                        초기화
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div className="section-title">호실 빠른 찾기</div>
          <span className="eyebrow">DRAG TO SELECT</span>
        </div>

        <RevolverSelector buildings={buildings} selectedId={finderBuildingId || buildings[0]?.id} onSelect={handleFinderSelectBuilding} />

        {finderBuilding && (
          <div style={{ marginTop: 18 }}>
            <div className="field-row">
              <div className="field">
                <label>층</label>
                <select className="input" value={finderFloor} onChange={(e) => setFinderFloor(Number(e.target.value))}>
                  {Array.from({ length: finderBuilding.floors || 1 }, (_, i) => i + 1)
                    .reverse()
                    .map((f) => (
                      <option key={f} value={f}>{f}층</option>
                    ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label>호</label>
              <div className="unit-picker-row">
                {unitOptions(finderBuilding.unitsPerFloor).map((u) => (
                  <button key={u} className={`unit-picker-btn${finderUnit === u ? " active" : ""}`} onClick={() => setFinderUnit(u)}>
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <UnitQuickInfo
              building={finderBuilding}
              floor={finderFloor}
              unit={finderUnit}
              inspections={inspections}
              checklistItems={checklistItems}
              unitFloorPlan={unitFloorPlan}
            />
          </div>
        )}
      </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div className="section-title">호실 내부 평면도</div>
          <span className="eyebrow">{hasUnitPlan ? "DXF 도면 적용됨" : "예시 평면도 사용 중"}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
          검측관리·NCR·호실 정보·대시보드에서 위치를 표시하는 데 쓰이는 호실 내부 평면도입니다. DXF 도면을 올리면 모든 화면에 바로 반영됩니다.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
            {unitPlanBusy ? "처리 중…" : hasUnitPlan ? "DXF 변경" : "DXF 파일 업로드"}
            <input type="file" accept=".dxf" hidden onChange={handleUnitPlanUpload} disabled={unitPlanBusy} />
          </label>
          {hasUnitPlan && (
            <button className="btn btn-ghost btn-sm" onClick={handleUnitPlanClear} disabled={unitPlanBusy}>
              예시 평면도로 되돌리기
            </button>
          )}
          {hasUnitPlan && <span className="chip">도형 {unitFloorPlan.shapes.length}개</span>}
        </div>
        {unitPlanError && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 12 }}>{unitPlanError}</div>}
        <div style={{ maxWidth: 460 }}>
          <DrawingPin dxfData={hasUnitPlan ? unitFloorPlan : null} />
        </div>
      </div>
    </div>
  );
}

function UnitQuickInfo({ building, floor, unit, inspections, checklistItems, unitFloorPlan }) {
  const pins = (inspections || [])
    .filter((i) => i.buildingId === building.id && String(i.floor) === String(floor) && i.unit === unit && i.pin)
    .map((i) => {
      const cat = CATEGORIES.find((c) => c.id === i.categoryId);
      return { x: i.pin.x, y: i.pin.y, color: cat?.color };
    });

  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>
        {building.name} {floor}층 {unit}호
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
        {CATEGORIES.map((c) => {
          const prog = categoryProgress(inspections, checklistItems, building.id, floor, unit, c.id);
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CategoryTag category={c} />
              <div style={{ flex: 1, height: 6, borderRadius: 4, background: "var(--surface-alt)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${prog.percent}%`,
                    height: "100%",
                    background: prog.status === "반려" ? "var(--fail)" : prog.status === "승인" ? "var(--pass)" : "var(--pending)",
                  }}
                />
              </div>
              <StatusBadge status={prog.status} />
            </div>
          );
        })}
      </div>
      <div style={{ maxWidth: 340 }}>
        <DrawingPin pins={pins} dxfData={unitFloorPlan?.shapes ? unitFloorPlan : null} />
      </div>
    </div>
  );
}

function SiteMap2D({ buildings, armed, onPlace, backgroundImage, dxfData }) {
  function handleClick(e) {
    if (!armed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onPlace(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }

  return (
    <div className={`drawing-frame${armed ? " editable" : ""}`} style={{ aspectRatio: "4 / 3" }} onClick={handleClick}>
      {dxfData ? (
        <DxfView data={dxfData} />
      ) : backgroundImage ? (
        <img src={backgroundImage} alt="배치도" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
          <rect x="0" y="0" width="400" height="300" fill="#f4f7f5" />
          <rect x="10" y="10" width="380" height="280" fill="none" stroke="#9db3c4" strokeWidth="2" strokeDasharray="6 4" />
        </svg>
      )}
      {buildings.map((b) => (
        <div
          key={b.id}
          className="pin"
          style={{ left: `${b.siteX}%`, top: `${b.siteY}%`, marginTop: -13, animation: "none" }}
        >
          <svg viewBox="0 0 26 26" width="26" height="26">
            <circle cx="13" cy="13" r="10" fill="#17456f" stroke="#fff" strokeWidth="2" />
          </svg>
          <span
            style={{
              position: "absolute",
              top: 24,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 10.5,
              fontFamily: "var(--font-mono)",
              color: "var(--ink)",
              background: "#fff",
              padding: "1px 5px",
              borderRadius: 4,
              border: "1px solid var(--line)",
              whiteSpace: "nowrap",
            }}
          >
            {b.name}
          </span>
        </div>
      ))}
      {armed && <span className="drawing-hint">지도를 클릭해 위치를 지정하세요</span>}
    </div>
  );
}
