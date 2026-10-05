import React, { useState } from "react";
import { Toast } from "./UI.jsx";
import UnitDetailPanel from "./UnitDetailPanel.jsx";
import ConfirmationRequestForm from "./ConfirmationRequestForm.jsx";

/**
 * QR 코드로 특정 호실에 접속했을 때 보여주는 독립된 모바일 화면.
 * 사이드바·역할선택 없이, 그 호실의 정보와 "공사 확인 요청"(호실 선택 생략)만 보여준다.
 */
export default function QrUnitScreen({
  buildings,
  inspections,
  checklistItems,
  unitNotes,
  unitFloorPlans,
  target,
  onCreateNote,
  onDeleteNote,
  onCreateConfirmationRequest,
}) {
  const [toast, setToast] = useState("");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const notify = (msg) => setToast(msg);

  const building = buildings.find((b) => b.id === target.buildingId) || buildings[0] || null;

  if (!building) {
    return (
      <div className="qr-screen">
        <div className="qr-screen-header">
          <span className="qr-screen-brand">현장검측</span>
        </div>
        <div className="qr-screen-body">
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--ink-faint)", fontSize: 13 }}>
            등록된 동 정보를 찾을 수 없습니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="qr-screen">
      <div className="qr-screen-header">
        <span className="qr-screen-brand">현장검측</span>
        <div className="qr-screen-title">
          {building.name} {target.floor}층 {target.unit}호
        </div>
      </div>

      <div className="qr-screen-body">
        <UnitDetailPanel
          building={building}
          buildingId={building.id}
          floor={target.floor}
          unit={target.unit}
          inspections={inspections}
          checklistItems={checklistItems}
          unitNotes={unitNotes}
          unitFloorPlans={unitFloorPlans}
          onCreateNote={onCreateNote}
          onDeleteNote={onDeleteNote}
          notify={notify}
          layout="stacked"
        />

        <div className="card card-pad" style={{ marginTop: 16, border: showRequestForm ? "1.5px solid var(--blueprint)" : undefined }}>
          <div className="section-head">
            <div className="section-title">공사 확인 요청</div>
          </div>
          {!showRequestForm ? (
            <button className="btn btn-primary btn-block" onClick={() => setShowRequestForm(true)}>
              이 호실 공사 확인 요청하기
            </button>
          ) : (
            <ConfirmationRequestForm
              buildings={[building]}
              checklistItems={checklistItems}
              inspections={inspections}
              unitFloorPlans={unitFloorPlans}
              fixedUnit={{ buildingId: building.id, floor: target.floor, unit: target.unit }}
              onClose={() => setShowRequestForm(false)}
              onSubmit={async (data) => {
                await onCreateConfirmationRequest(data);
                setShowRequestForm(false);
                notify("공사 확인을 요청했습니다.");
              }}
            />
          )}
        </div>
      </div>

      <Toast message={toast} onDone={() => setToast("")} />
    </div>
  );
}
