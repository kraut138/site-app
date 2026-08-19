import React, { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout.jsx";
import OperationsHub from "./components/OperationsHub.jsx";
import Checklist from "./components/Checklist.jsx";
import Buildings from "./components/Buildings.jsx";
import SiteLayout from "./components/SiteLayout.jsx";
import UnitInfo from "./components/UnitInfo.jsx";
import RoleSelect from "./components/RoleSelect.jsx";
import SafetyOverview from "./components/SafetyOverview.jsx";
import { Toast } from "./components/UI.jsx";
import { ROLES, RESTRICTED_VIEWS_FOR_SUB } from "./data.js";
import * as api from "./api.js";

export default function App() {
  const [role, setRole] = useState(null);
  const [view, setView] = useState("checklist");
  const [buildings, setBuildings] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [siteSettings, setSiteSettings] = useState({});
  const [unitNotes, setUnitNotes] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  const notify = useCallback((msg) => setToast(msg), []);

  useEffect(() => {
    if (role === ROLES.SUB && RESTRICTED_VIEWS_FOR_SUB.includes(view)) {
      setView("checklist");
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
        setSiteSettings(data.siteSettings || {});
        setUnitNotes(data.unitNotes || []);
        setChecklistItems(data.checklistItems || []);
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

  async function handleUpdateBuilding(id, data) {
    const updated = await api.updateBuilding(id, data);
    setBuildings((prev) => prev.map((b) => (b.id === id ? updated : b)));
    return updated;
  }

  async function handleUpdateSiteSettings(data) {
    const updated = await api.updateSiteSettings(data);
    setSiteSettings(updated);
    return updated;
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

  async function handleCreateInspection(data) {
    const created = await api.createInspection(data);
    setInspections((prev) => [...prev, created]);
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
  };
  badges.operations = badges.pending + badges.ncr;

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
            onCreateInspection={handleCreateInspection}
            onUpdateInspectionStatus={handleUpdateInspectionStatus}
            onUpdateNcrStatus={handleUpdateNcrStatus}
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
        {view === "safety" && (
          <SafetyOverview
            role={role}
            buildings={buildings}
            inspections={inspections}
            ncrs={ncrs}
            onUpdateNcrStatus={handleUpdateNcrStatus}
            notify={notify}
          />
        )}
        {view === "unitinfo" && (
          <UnitInfo
            buildings={buildings}
            inspections={inspections}
            checklistItems={checklistItems}
            unitNotes={unitNotes}
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
            onUpdateBuilding={handleUpdateBuilding}
            siteSettings={siteSettings}
            onUpdateSiteSettings={handleUpdateSiteSettings}
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
