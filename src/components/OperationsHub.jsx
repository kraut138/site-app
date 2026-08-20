import React, { useState } from "react";
import { ROLES } from "../data.js";
import Dashboard from "./Dashboard.jsx";
import Inspections from "./Inspections.jsx";
import NCR from "./NCR.jsx";

const SUBTABS = [
  { id: "dashboard", label: "대시보드", restrictedToSuper: true },
  { id: "inspections", label: "검측관리", badgeKey: "pending" },
  { id: "ncr", label: "NCR 관리", badgeKey: "ncr" },
];

export default function OperationsHub({
  role,
  badges,
  buildings,
  inspections,
  ncrs,
  checklistItems,
  unitFloorPlan,
  onCreateInspection,
  onUpdateInspectionStatus,
  onUpdateNcrStatus,
  notify,
}) {
  const visibleSubTabs = SUBTABS.filter((t) => !t.restrictedToSuper || role === ROLES.SUPER);
  const [subTab, setSubTab] = useState(role === ROLES.SUPER ? "dashboard" : "inspections");
  const activeSubTab = visibleSubTabs.some((t) => t.id === subTab) ? subTab : visibleSubTabs[0]?.id;

  return (
    <div>
      <div className="ops-subtabs">
        {visibleSubTabs.map((t) => {
          const badge = t.badgeKey ? badges[t.badgeKey] : 0;
          return (
            <button
              key={t.id}
              className={`ops-subtab${activeSubTab === t.id ? " active" : ""}`}
              onClick={() => setSubTab(t.id)}
            >
              {t.label}
              {!!badge && <span className="ops-subtab-badge">{badge > 99 ? "99+" : badge}</span>}
            </button>
          );
        })}
      </div>

      {activeSubTab === "dashboard" && <Dashboard buildings={buildings} inspections={inspections} ncrs={ncrs} unitFloorPlan={unitFloorPlan} />}

      {activeSubTab === "inspections" && (
        <Inspections
          role={role}
          buildings={buildings}
          inspections={inspections}
          checklistItems={checklistItems}
          unitFloorPlan={unitFloorPlan}
          onCreate={onCreateInspection}
          onUpdateStatus={onUpdateInspectionStatus}
          notify={notify}
        />
      )}

      {activeSubTab === "ncr" && (
        <NCR role={role} buildings={buildings} ncrs={ncrs} unitFloorPlan={unitFloorPlan} onUpdateStatus={onUpdateNcrStatus} notify={notify} />
      )}
    </div>
  );
}
