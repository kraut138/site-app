import React, { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Checklist from "./components/Checklist.jsx";
import Inspections from "./components/Inspections.jsx";
import NCR from "./components/NCR.jsx";
import Buildings from "./components/Buildings.jsx";
import { Toast } from "./components/UI.jsx";
import { ROLES } from "./data.js";
import * as api from "./api.js";

export default function App() {
  const [role, setRole] = useState(ROLES.SUB);
  const [view, setView] = useState("dashboard");
  const [buildings, setBuildings] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  const notify = useCallback((msg) => setToast(msg), []);

  useEffect(() => {
    let alive = true;
    api
      .fetchBootstrap()
      .then((data) => {
        if (!alive) return;
        setBuildings(data.buildings || []);
        setInspections(data.inspections || []);
        setNcrs(data.ncrs || []);
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
  };

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
        {view === "dashboard" && <Dashboard buildings={buildings} inspections={inspections} ncrs={ncrs} />}
        {view === "checklist" && <Checklist />}
        {view === "inspections" && (
          <Inspections
            role={role}
            buildings={buildings}
            inspections={inspections}
            onCreate={handleCreateInspection}
            onUpdateStatus={handleUpdateInspectionStatus}
            notify={notify}
          />
        )}
        {view === "ncr" && <NCR role={role} buildings={buildings} ncrs={ncrs} onUpdateStatus={handleUpdateNcrStatus} notify={notify} />}
        {view === "buildings" && (
          <Buildings buildings={buildings} onCreate={handleCreateBuilding} onDelete={handleDeleteBuilding} canEdit={role === ROLES.SUPER} />
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
