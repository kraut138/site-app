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

export default function App() {
  const [role, setRole] = useState(null);
  const [view, setView] = useState("checklist");
  const [buildings, setBuildings] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [unitNotes, setUnitNotes] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [unitFloorPlan, setUnitFloorPlan] = useState({});
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  const notify = useCallback((msg) => setToast(msg), []);

  useEffect(() => {
    if (role && !isViewAllowed(view, role)) {
      setView(role === ROLES.SUPER ? "operations" : "checklist");
    }
  }, [role, view]);

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
        setUnitFloorPlan(data.unitFloorPlan || {});
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

  async function handleUpdateUnitFloorPlan(data) {
    const updated = await api.updateUnitFloorPlan(data);
    setUnitFloorPlan(updated);
    return updated;
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
          setView(startView);
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
            unitFloorPlan={unitFloorPlan}
            onCreateInspection={handleCreateInspection}
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
            onSetStatusBatch={handleSetProgressBatch}
            onClearStatusBatch={handleClearProgressBatch}
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
            unitFloorPlan={unitFloorPlan}
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
            unitFloorPlan={unitFloorPlan}
            onCreateNote={handleCreateUnitNote}
            onDeleteNote={handleDeleteUnitNote}
            notify={notify}
          />
        )}
        {view === "buildings" && (
          <Buildings buildings={buildings} onCreate={handleCreateBuilding} onDelete={handleDeleteBuilding} canEdit={role === ROLES.SUPER} />
        )}
        {view === "sitelayout" && (
          <SiteLayout
            buildings={buildings}
            unitFloorPlan={unitFloorPlan}
            onUpdateUnitFloorPlan={handleUpdateUnitFloorPlan}
            inspections={inspections}
            checklistItems={checklistItems}
            progress={progress}
            notify={notify}
          />
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
