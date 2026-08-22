import React, { useState } from "react";
import { EmptyState } from "./UI.jsx";
import { parseDxf } from "../dxf.js";
import DrawingPin from "./DrawingPin.jsx";
import GolguDiagram from "./GolguDiagram.jsx";

export default function SiteLayout({
  buildings,
  unitFloorPlan,
  onUpdateUnitFloorPlan,
  checklistItems,
  progress,
  notify,
}) {
  const [unitPlanBusy, setUnitPlanBusy] = useState(false);
  const [unitPlanError, setUnitPlanError] = useState("");

  const hasUnitPlan = !!(unitFloorPlan && unitFloorPlan.shapes);

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
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div className="section-title">골구도</div>
          <span className="eyebrow">전체 동 · 완료 세대 표시</span>
        </div>
        <GolguDiagram buildings={buildings} progress={progress} checklistItems={checklistItems} />
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
