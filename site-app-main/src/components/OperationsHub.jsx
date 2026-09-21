import React, { useState } from "react";
import { ROLES, isAdminRole } from "../data.js";
import Dashboard from "./Dashboard.jsx";
import Inspections from "./Inspections.jsx";
import NCR from "./NCR.jsx";
import Checklist from "./Checklist.jsx";
import { useLanguage } from "../LanguageContext.jsx";

const SUBTABS = [
  { id: "dashboard", labelKey: "ops.tab.dashboard", restrictedToSuper: true },
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
  const visibleSubTabs = SUBTABS.filter((t) => !t.restrictedToSuper || isAdminRole(role));
  const [subTab, setSubTab] = useState(isAdminRole(role) ? "dashboard" : "inspections");
  const activeSubTab = visibleSubTabs.some((t) => t.id === subTab) ? subTab : visibleSubTabs[0]?.id;

  return (
    <div>
      <div className="ops-subtabs">
        {visibleSubTabs.map((tab) => {
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

      {activeSubTab === "dashboard" && <Dashboard buildings={buildings} inspections={inspections} ncrs={ncrs} />}

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
