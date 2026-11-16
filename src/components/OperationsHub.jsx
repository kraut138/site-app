import React, { useState } from "react";
import Inspections from "./Inspections.jsx";
import NCR from "./NCR.jsx";
import Checklist from "./Checklist.jsx";
import Companies from "./Companies.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { isAdminRole } from "../data.js";

// 공사현황 대시보드는 현장통 화면의 첫 번째 탭(platform/PortalDashboard.jsx)으로 옮겼다. 여기에는 나머지 세 가지와, 관리자만 보는 '업체·담당 공종'이 남는다.
// 업체·담당 공종: 협력업체 이름과 맡은 공종을 등록한다. 등록한 업체는 앞의 세 화면에 담당 업체로 보이고, 녹음에서 업체 이름을 말하면 담당 공종과 이어져 서류에 적힌다.
const SUBTABS = [
  { id: "inspections", labelKey: "ops.tab.inspections", badgeKey: "pending" },
  { id: "ncr", labelKey: "ops.tab.ncr", badgeKey: "ncr" },
  { id: "checklist", labelKey: "ops.tab.checklist" },
  { id: "companies", labelKey: "ops.tab.companies", adminOnly: true },
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
  companies = [],
  onSaveCompanies,
  notify,
}) {
  const { t } = useLanguage();
  const [subTab, setSubTab] = useState("inspections");
  const canManageCompanies = isAdminRole(role) && typeof onSaveCompanies === "function";
  const tabs = SUBTABS.filter((tab) => !tab.adminOnly || canManageCompanies);
  const activeSubTab = tabs.some((tab) => tab.id === subTab) ? subTab : tabs[0].id;
  const openCompanies = canManageCompanies ? () => setSubTab("companies") : undefined; // 관리자가 담당 업체 줄에서 바로 등록 화면으로 가는 길

  return (
    <div>
      <div className="ops-subtabs">
        {tabs.map((tab) => {
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
          companies={companies}
          onCreateConfirmationRequest={onCreateConfirmationRequest}
          onUpdateStatus={onUpdateInspectionStatus}
          onBatchUpdateStatus={onBatchUpdateInspectionStatus}
          notify={notify}
        />
      )}

      {activeSubTab === "ncr" && (
        <NCR
          role={role}
          buildings={buildings}
          ncrs={ncrs}
          inspections={inspections}
          checklistItems={checklistItems}
          companies={companies}
          unitFloorPlans={unitFloorPlans}
          onUpdateStatus={onUpdateNcrStatus}
          notify={notify}
        />
      )}

      {activeSubTab === "checklist" && (
        <Checklist
          role={role}
          items={checklistItems}
          companies={companies}
          onOpenCompanies={openCompanies}
          onCreateItem={onCreateChecklistItem}
          onDeleteItem={onDeleteChecklistItem}
          onResetCategory={onResetChecklistCategory}
          onReorderItems={onReorderChecklistItems}
          notify={notify}
        />
      )}

      {activeSubTab === "companies" && canManageCompanies && <Companies companies={companies} checklistItems={checklistItems} onSave={onSaveCompanies} notify={notify} />}
    </div>
  );
}
