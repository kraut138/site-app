import React from "react";
import { EmptyState } from "./UI.jsx";
import GolguDiagram from "./GolguDiagram.jsx";

export default function SiteLayout({ buildings, checklistItems, inspections, onNavigateToUnit }) {
  if (buildings.length === 0) {
    return (
      <div className="card">
        <EmptyState message="먼저 동 관리 탭에서 동을 등록해주세요." />
      </div>
    );
  }

  return (
    <div className="card card-pad" data-testid="golgu-card">
      <GolguDiagram buildings={buildings} inspections={inspections} checklistItems={checklistItems} onNavigateToUnit={onNavigateToUnit} />
    </div>
  );
}
