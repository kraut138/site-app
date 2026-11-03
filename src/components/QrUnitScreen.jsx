import React, { useState } from "react";
import { QrCode, MapPin } from "lucide-react";
import BrandFrame from "../platform/BrandFrame.jsx";
import { CATEGORIES } from "../data.js";
import { Toast } from "./UI.jsx";
import UnitDetailPanel from "./UnitDetailPanel.jsx";
import ConfirmationRequestForm from "./ConfirmationRequestForm.jsx";
import VoiceInspection from "./VoiceInspection.jsx";

/**
 * (예전 QR) 호실마다 만들어 붙였던 QR(?b=&f=&u=)로 특정 호실에 접속했을 때 보여주는 독립된 모바일 화면. 지금은 이 QR을 새로 만들지 않고(공종별 QR로 바뀌었다 - QrTradeScreen),
 * 이미 붙여 둔 QR이 계속 열리도록 이 화면만 남겨 두었다.
 * 사이드바·역할선택 없이, 맨 위에 "음성 검측"(녹음 → 텍스트 변환, 위치는 이 호실로 고정 - 다만 "102동 502호 도배 완료"처럼 다른 호실을 분명하게 말하면 그 호실의 기록으로 저장된다),
 * 그 아래로 호실의 특이사항·평면도와 "공사 확인 요청"(호실 선택 생략)을 보여준다.
 * 화면을 간단하게 두려고 공종별 진행도 목록은 여기에 넣지 않는다(진행도와 음성 기록은 관리자 '호실 정보'에서 본다).
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
  // 층 값이 비정상(0, NaN 등)인 QR이면 위치를 정할 수 없으므로 음성 검측은 숨긴다.
  const floorOk = Number.isInteger(target.floor) && target.floor !== 0;

  if (!building) {
    return (
      <BrandFrame narrow testId="qr-screen" rootClass="qr-screen">
        <div className="qr-screen-body">
          <div className="card card-pad" style={{ textAlign: "center", color: "var(--ink-faint)", fontSize: 13 }}>
            등록된 동 정보를 찾을 수 없습니다.
          </div>
        </div>
      </BrandFrame>
    );
  }

  // 공종별 QR 생성소에서 만든 QR이면 그 공종의 이름과 색으로, 호실만 담긴 예전 QR이면 기본(회색)으로 보여 준다.
  const trade = CATEGORIES.find((c) => c.id === target.trade) || null;

  return (
    <BrandFrame narrow testId="qr-screen" rootClass="qr-screen">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4" data-testid="qr-location-banner">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full text-white shadow-sm"
            style={{ backgroundColor: trade ? trade.color : "#475569" }}
            data-testid="qr-trade-badge"
          >
            <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
            {trade ? trade.name : "호실 QR"}
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
            <MapPin className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
            현장 QR 인식됨
          </span>
        </div>
        <div className="mt-3">
          <h2 className="qr-screen-title text-2xl font-black text-slate-900 tracking-tight" data-testid="qr-unit-title">
            {building.name} {target.floor}층 {target.unit}호
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">마이크를 누르고 작업 완료 내용을 편하게 말씀해주세요.</p>
        </div>
      </div>

      <div className="qr-screen-body">
        {floorOk && (
          <VoiceInspection
            buildings={[building]}
            allBuildings={buildings}
            unit={{ buildingId: building.id, floor: target.floor, unit: target.unit }}
            notify={notify}
            checklistItems={checklistItems}
            initialTrade={target.trade || ""}
          />
        )}

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
          showProgress={false}
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
    </BrandFrame>
  );
}
