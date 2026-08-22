import React from "react";
import { EmptyState } from "./UI.jsx";
import GolguDiagram from "./GolguDiagram.jsx";

export default function SiteLayout({ buildings, checklistItems, progress }) {
  if (buildings.length === 0) {
    return (
      <div className="card">
        <EmptyState message="먼저 동 관리 탭에서 동을 등록해주세요." />
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <div className="section-head">
        <div className="section-title">골구도</div>
        <span className="eyebrow">전체 동 · 완료 세대 표시</span>
      </div>
      <GolguDiagram buildings={buildings} progress={progress} checklistItems={checklistItems} />
    </div>
  );
}
