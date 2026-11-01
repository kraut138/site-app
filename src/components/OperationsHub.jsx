import React, { useState } from "react";
import Inspections from "./Inspections.jsx";
import NCR from "./NCR.jsx";
import Checklist from "./Checklist.jsx";
import { useLanguage } from "../LanguageContext.jsx";

// 공사현황 대시보드는 현장통 화면의 첫 번째 탭(platform/PortalDashboard.jsx)으로 옮겼다. 여기에는 나머지 세 가지만 남는다.
const SUBTABS = [
  { id: "inspections", labelKey: "ops.tab.inspections", badgeKey: "pending" },
  { id: "ncr", labelKey: "ops.tab.ncr", badgeKey: "ncr" },
  { id: "checklist", labelKey: "ops.tab.checklist" },
];

export default function OperationsHub({
  role,
  badges,
  buildings,
  inspections,
  ncrs,
  checklistItems,
  unitFloorPlans,
  onCreateConfirmationRequest,
  onUpdateInspectionStatus,
  onBatchUpdateInspectionStatus,
  onUpdateNcrStatus,
  onCreateChecklistItem,
  onDeleteChecklistItem,
  onResetChecklistCategory,
  onReorderChecklistItems,
  notify,
}) {
  const { t } = useLanguage();
  const [subTab, setSubTab] = useState("inspections");
  const activeSubTab = SUBTABS.some((t) => t.id === subTab) ? subTab : SUBTABS[0].id;

  return (
    <div>
      <div className="ops-subtabs">
        {SUBTABS.map((tab) => {
          const badge = tab.badgeKey ? badges[tab.badgeKey] : 0;
          return (
            <button
              key={tab.id}
              className={`ops-subtab${activeSubTab === tab.id ? " active" : ""}`}
              onClick={() => setSubTab(tab.id)}
            >
              {t(tab.labelKey)}
              {!!badge && <span className="ops-subtab-badge">{badge > 99 ? "99+" : badge}</span>}
            </button>
          );
        })}
      </div>

      {activeSubTab === "inspections" && (
        <Inspections
          role={role}
          buildings={buildings}
          inspections={inspections}
          checklistItems={checklistItems}
          unitFloorPlans={unitFloorPlans}
          onCreateConfirmationRequest={onCreateConfirmationRequest}
          onUpdateStatus={onUpdateInspectionStatus}
          onBatchUpdateStatus={onBatchUpdateInspectionStatus}
          notify={notify}
        />
      )}

      {activeSubTab === "ncr" && (
        <NCR role={role} buildings={buildings} ncrs={ncrs} unitFloorPlans={unitFloorPlans} onUpdateStatus={onUpdateNcrStatus} notify={notify} />
      )}

      {activeSubTab === "checklist" && (
        <Checklist
          role={role}
          items={checklistItems}
          onCreateItem={onCreateChecklistItem}
          onDeleteItem={onDeleteChecklistItem}
          onResetCategory={onResetChecklistCategory}
          onReorderItems={onReorderChecklistItems}
          notify={notify}
        />
      )}
    </div>
  );
}
