import React, { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout.jsx";
import OperationsHub from "./components/OperationsHub.jsx";
import Checklist from "./components/Checklist.jsx";
import ProgressTracker from "./components/ProgressTracker.jsx";
import Workers from "./components/Workers.jsx";
import Buildings from "./components/Buildings.jsx";
import SiteLayout from "./components/SiteLayout.jsx";
import UnitInfo from "./components/UnitInfo.jsx";
import RoleSelect from "./components/RoleSelect.jsx";
import SafetyOverview from "./components/SafetyOverview.jsx";
import { Toast } from "./components/UI.jsx";
import { ROLES, isViewAllowed } from "./data.js";
import * as api from "./api.js";
import { readUnitDeepLink, clearUnitDeepLinkFromUrl } from "./qr.js";

// 페이지가 처음 로드될 때 딱 한 번만 읽는다 - QR 스캔으로 들어온 경우 여기에 값이 담긴다.
const initialDeepLink = readUnitDeepLink();

export default function App() {
  const [role, setRole] = useState(null);
  const [view, setView] = useState(initialDeepLink ? "unitinfo" : "checklist");
  const [unitTarget, setUnitTarget] = useState(initialDeepLink);
  // QR 스캔으로 이 세션에 들어왔는지 여부 - unitTarget은 UnitInfo가 초기값을 반영한 뒤 소비되어 null이 되지만,
  // 이 값은 세션 내내 고정되어 "호실 정보" 화면(원래 감리단 전용)에 하도급사도 계속 머물 수 있게 해준다.
  const [cameFromDeepLink] = useState(!!initialDeepLink);
  const [buildings, setBuildings] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [unitNotes, setUnitNotes] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [unitFloorPlans, setUnitFloorPlans] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  const notify = useCallback((msg) => setToast(msg), []);

  function handleNavigateToUnit(buildingId, floor, unit) {
    // 배치도(3D)와 호실 정보는 둘 다 감리단 전용 화면이라, 여기서 이동하는 건 별도 예외 없이 항상 허용된다.
    setUnitTarget({ buildingId, floor, unit });
    setView("unitinfo");
  }

  useEffect(() => {
    // 딥링크 값은 이미 위에서 JS 메모리(state)로 옮겨왔으니, 주소창은 바로 정리해도 된다.
    // 정리해두지 않으면 나중에 다른 화면을 보다가 새로고침했을 때 계속 이 호실로 튕기게 된다.
    if (initialDeepLink) clearUnitDeepLinkFromUrl();
  }, []);

  useEffect(() => {
    // "호실 정보"는 원래 감리단 전용이지만, QR 스캔으로 특정 호실을 보러 온 경우엔
    // 하도급사도 그 화면만은 예외적으로 볼 수 있게 한다(그 외 화면 접근 권한은 그대로).
    if (role && !isViewAllowed(view, role) && !(view === "unitinfo" && cameFromDeepLink)) {
      setView(role === ROLES.SUPER ? "operations" : "checklist");
    }
  }, [role, view, cameFromDeepLink]);

  useEffect(() => {
    let alive = true;
    api
      .fetchBootstrap()
      .then((data) => {
        if (!alive) return;
        setBuildings(data.buildings || []);
        setInspections(data.inspections || []);
        setNcrs(data.ncrs || []);
        setUnitNotes(data.unitNotes || []);
        setChecklistItems(data.checklistItems || []);
        setWorkers(data.workers || []);
        setUnitFloorPlans(data.unitFloorPlans || []);
        setProgress(data.progress || []);
      })
      .catch((err) => alive && setLoadError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function handleCreateBuilding(data) {
    const created = await api.createBuilding(data);
    setBuildings((prev) => [...prev, created]);
  }

  async function handleDeleteBuilding(id) {
    await api.deleteBuilding(id);
    setBuildings((prev) => prev.filter((b) => b.id !== id));
  }

  async function handleCreateUnitFloorPlan(data) {
    const created = await api.createUnitFloorPlan(data);
    setUnitFloorPlans((prev) => [...prev, created]);
    return created;
  }

  async function handleUpdateUnitFloorPlan(id, data) {
    const updated = await api.updateUnitFloorPlan(id, data);
    setUnitFloorPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }

  async function handleDeleteUnitFloorPlan(id) {
    await api.deleteUnitFloorPlan(id);
    setUnitFloorPlans((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleSetProgressBatch(buildingId, units, itemId, categoryId, status) {
    const created = await api.setProgressStatusBatch(buildingId, units, itemId, categoryId, status);
    const ids = new Set(created.map((c) => c.id));
    setProgress((prev) => [...prev.filter((p) => !ids.has(p.id)), ...created]);
    return created;
  }

  async function handleClearProgressBatch(buildingId, units, itemId) {
    const { ids } = await api.clearProgressStatusBatch(buildingId, units, itemId);
    const idSet = new Set(ids);
    setProgress((prev) => prev.filter((p) => !idSet.has(p.id)));
  }

  async function handleCreateUnitNote(data) {
    const created = await api.createUnitNote(data);
    setUnitNotes((prev) => [...prev, created]);
    return created;
  }

  async function handleDeleteUnitNote(id) {
    await api.deleteUnitNote(id);
    setUnitNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleCreateChecklistItem(data) {
    const created = await api.createChecklistItem(data);
    setChecklistItems((prev) => [...prev, created]);
    return created;
  }

  async function handleDeleteChecklistItem(id) {
    await api.deleteChecklistItem(id);
    setChecklistItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleResetChecklistCategory(categoryId, items) {
    const created = await api.resetChecklistCategory(categoryId, items);
    setChecklistItems((prev) => [...prev.filter((i) => i.categoryId !== categoryId), ...created]);
  }

  async function handleCreateWorkers(data) {
    const created = await api.createWorkers(data);
    setWorkers((prev) => [...prev, ...created]);
    return created;
  }

  async function handleUpdateWorkerStatus(id, data) {
    const updated = await api.updateWorkerStatus(id, data);
    setWorkers((prev) => prev.map((w) => (w.id === id ? updated : w)));
    return updated;
  }

  async function handleCreateInspection(data) {
    const created = await api.createInspections(data);
    setInspections((prev) => [...prev, ...created]);
    return created;
  }

  async function handleUpdateInspectionStatus(id, data) {
    const res = await api.updateInspectionStatus(id, data);
    setInspections((prev) => prev.map((i) => (i.id === id ? res.inspection : i)));
    if (res.ncr) {
      setNcrs((prev) => [...prev, res.ncr]);
    }
    return res;
  }

  async function handleUpdateNcrStatus(id, data) {
    const res = await api.updateNcrStatus(id, data);
    setNcrs((prev) => prev.map((n) => (n.id === id ? res : n)));
    return res;
  }

  const badges = {
    pending: inspections.filter((i) => i.status === "대기").length,
    ncr: ncrs.filter((n) => n.status !== "완료").length,
    safetyNcr: ncrs.filter((n) => n.categoryId === "safety" && n.status !== "완료").length,
    workersPending: workers.filter((w) => w.status === "대기").length,
  };
  badges.operations = badges.pending + badges.ncr;
  badges.safetyTotal = badges.safetyNcr + badges.workersPending;

  if (!role) {
    return (
      <RoleSelect
        onSelect={(chosenRole, startView) => {
          setRole(chosenRole);
          // QR로 특정 호실을 스캔해 들어온 경우, 역할과 무관하게 그 호실 정보 화면으로 바로 이동시킨다.
          setView(unitTarget ? "unitinfo" : startView);
        }}
      />
    );
  }

  if (loading) {
    return <CenterMessage>불러오는 중…</CenterMessage>;
  }

  if (loadError) {
    return (
      <CenterMessage>
        데이터를 불러오지 못했습니다.
        <br />
        {loadError}
      </CenterMessage>
    );
  }

  return (
    <>
      <Layout role={role} setRole={setRole} view={view} setView={setView} badges={badges}>
        {view === "operations" && (
          <OperationsHub
            role={role}
            badges={badges}
            buildings={buildings}
            inspections={inspections}
            ncrs={ncrs}
            checklistItems={checklistItems}
            unitFloorPlans={unitFloorPlans}
            onUpdateInspectionStatus={handleUpdateInspectionStatus}
            onUpdateNcrStatus={handleUpdateNcrStatus}
            notify={notify}
          />
        )}
        {view === "progress" && (
          <ProgressTracker
            role={role}
            buildings={buildings}
            items={checklistItems}
            progress={progress}
            unitFloorPlans={unitFloorPlans}
            onSetStatusBatch={handleSetProgressBatch}
            onClearStatusBatch={handleClearProgressBatch}
            onCreateConfirmationRequest={handleCreateInspection}
            notify={notify}
          />
        )}
        {view === "checklist" && (
          <Checklist
            role={role}
            items={checklistItems}
            onCreateItem={handleCreateChecklistItem}
            onDeleteItem={handleDeleteChecklistItem}
            onResetCategory={handleResetChecklistCategory}
            notify={notify}
          />
        )}
        {view === "workers" && <Workers workers={workers} onCreateWorkers={handleCreateWorkers} notify={notify} />}
        {view === "safety" && (
          <SafetyOverview
            role={role}
            buildings={buildings}
            inspections={inspections}
            ncrs={ncrs}
            workers={workers}
            unitFloorPlans={unitFloorPlans}
            onUpdateNcrStatus={handleUpdateNcrStatus}
            onUpdateWorkerStatus={handleUpdateWorkerStatus}
            notify={notify}
          />
        )}
        {view === "unitinfo" && (
          <UnitInfo
            buildings={buildings}
            inspections={inspections}
            checklistItems={checklistItems}
            unitNotes={unitNotes}
            unitFloorPlans={unitFloorPlans}
            initialTarget={unitTarget}
            onConsumeInitialTarget={() => setUnitTarget(null)}
            onCreateNote={handleCreateUnitNote}
            onDeleteNote={handleDeleteUnitNote}
            notify={notify}
          />
        )}
        {view === "buildings" && (
          <Buildings
            buildings={buildings}
            onCreate={handleCreateBuilding}
            onDelete={handleDeleteBuilding}
            canEdit={role === ROLES.SUPER}
            unitFloorPlans={unitFloorPlans}
            onCreateFloorPlan={handleCreateUnitFloorPlan}
            onUpdateFloorPlan={handleUpdateUnitFloorPlan}
            onDeleteFloorPlan={handleDeleteUnitFloorPlan}
            notify={notify}
          />
        )}
        {view === "sitelayout" && (
          <SiteLayout buildings={buildings} checklistItems={checklistItems} inspections={inspections} onNavigateToUnit={handleNavigateToUnit} />
        )}
      </Layout>
      <Toast message={toast} onDone={() => setToast("")} />
    </>
  );
}

function CenterMessage({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)", fontSize: 14, textAlign: "center" }}>
      {children}
    </div>
  );
}
