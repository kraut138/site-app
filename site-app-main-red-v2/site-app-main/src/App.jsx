import React, { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout.jsx";
import OperationsHub from "./components/OperationsHub.jsx";
import Workers from "./components/Workers.jsx";
import WorkerRoster from "./components/WorkerRoster.jsx";
import Equipment from "./components/Equipment.jsx";
import Buildings from "./components/Buildings.jsx";
import SiteLayout from "./components/SiteLayout.jsx";
import Site3DView from "./components/Site3DView.jsx";
import UnitInfo from "./components/UnitInfo.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import SafetyOverview from "./components/SafetyOverview.jsx";
import QrUnitScreen from "./components/QrUnitScreen.jsx";
import { Toast } from "./components/UI.jsx";
import { ROLES, isAdminRole, isViewAllowed } from "./data.js";
import * as api from "./api.js";
import { subscribeAuth, fetchUserProfile, logOut, updateUserLanguage } from "./auth.js";
import { LanguageProvider } from "./LanguageContext.jsx";
import { DEFAULT_LANGUAGE } from "./i18n.js";
import { readUnitDeepLink, clearUnitDeepLinkFromUrl } from "./qr.js";

// 페이지가 처음 로드될 때 딱 한 번만 읽는다 - QR 스캔으로 들어온 경우 여기에 값이 담긴다.
// 이 값이 있으면 로그인/사이드바 전체를 건너뛰고 QrUnitScreen(모바일 전용 화면)을 바로 보여준다.
const initialDeepLink = readUnitDeepLink();

export default function App() {
  // authUser: Firebase Auth 로그인 여부. userProfile: Firestore에 저장된 이름/역할.
  // trueRole은 실제 계정 권한(로그인 시 그대로 고정), role은 화면에 실제 적용되는 값이다.
  // 관리자(소장) 계정만 viewAsRole로 "미리보기" 역할을 골라 role을 바꿔볼 수 있다 - Firestore에 저장된
  // 진짜 권한(trueRole)은 절대 안 바뀌므로, 하도급사·감리자 계정은 이 기능으로 권한이 올라갈 수 없다.
  const [authUser, setAuthUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [viewAsRole, setViewAsRole] = useState(null);
  const trueRole = userProfile?.role || null;
  const role = trueRole === ROLES.SUPER && viewAsRole ? viewAsRole : trueRole;
  const lang = userProfile?.language || DEFAULT_LANGUAGE;

  async function handleChangeLanguage(nextLang) {
    setUserProfile((prev) => (prev ? { ...prev, language: nextLang } : prev));
    if (authUser) {
      try {
        await updateUserLanguage(authUser.uid, nextLang);
      } catch {
        // 저장에 실패해도 화면 표시 언어는 이미 바뀐 상태로 둔다 - 다음 로그인 때만 이전 언어로 보일 뿐이다.
      }
    }
  }
  const [view, setView] = useState("operations");
  const [unitTarget, setUnitTarget] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [unitNotes, setUnitNotes] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [unitFloorPlans, setUnitFloorPlans] = useState([]);
  const [siteSettings, setSiteSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  const notify = useCallback((msg) => setToast(msg), []);

  function handleNavigateToUnit(buildingId, floor, unit) {
    // 골구도와 호실 정보는 둘 다 감리단 전용 화면이라, 여기서 이동하는 건 별도 예외 없이 항상 허용된다.
    setUnitTarget({ buildingId, floor, unit });
    setView("unitinfo");
  }

  useEffect(() => {
    // 딥링크 값은 이미 모듈 최상단 상수(initialDeepLink)에 담겨 있으니, 주소창은 바로 정리해도 된다.
    // 정리해두지 않으면 나중에 다른 화면을 보다가 새로고침했을 때 계속 이 호실로 튕기게 된다.
    if (initialDeepLink) clearUnitDeepLinkFromUrl();
  }, []);

  useEffect(() => {
    // QR 스캔으로 들어온 경우엔 로그인 없이 바로 QrUnitScreen을 보여주므로 인증 상태를 볼 필요가 없다.
    if (initialDeepLink) {
      setAuthChecked(true);
      return;
    }
    const unsubscribe = subscribeAuth(async (user) => {
      setAuthUser(user);
      if (user) {
        try {
          const profile = await fetchUserProfile(user.uid, user.email);
          setUserProfile(profile);
        } catch {
          setUserProfile({ email: user.email, name: "", role: ROLES.SUB });
        }
      } else {
        setUserProfile(null);
      }
      setAuthChecked(true);
    });
    return unsubscribe;
  }, []);

  async function handleLogout() {
    await logOut();
    setViewAsRole(null);
  }

  useEffect(() => {
    if (role && !isViewAllowed(view, role)) {
      setView("operations");
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
        setEquipment(data.equipment || []);
        setUnitFloorPlans(data.unitFloorPlans || []);
        setSiteSettings(data.siteSettings || {});
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

  async function handleReorderChecklistItems(categoryId, orderedIds) {
    // 화면 반응성을 위해 로컬 순서부터 먼저 반영하고, 실패하면 되돌린다.
    const prevItems = checklistItems;
    const orderMap = new Map(orderedIds.map((id, order) => [id, order]));
    setChecklistItems((prev) => prev.map((i) => (orderMap.has(i.id) ? { ...i, order: orderMap.get(i.id) } : i)));
    try {
      await api.reorderChecklistItems(categoryId, orderedIds);
    } catch (err) {
      setChecklistItems(prevItems);
      throw err;
    }
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

  async function handleAddWorkerWarning(id, data) {
    const updated = await api.addWorkerWarning(id, data);
    setWorkers((prev) => prev.map((w) => (w.id === id ? updated : w)));
    return updated;
  }

  async function handleCreateEquipment(data) {
    const created = await api.createEquipment(data);
    setEquipment((prev) => [...prev, created]);
    return created;
  }

  async function handleUpdateEquipmentStatus(id, data) {
    const updated = await api.updateEquipmentStatus(id, data);
    setEquipment((prev) => prev.map((eq) => (eq.id === id ? updated : eq)));
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

  async function handleBatchUpdateInspectionStatus(ids, data) {
    const results = await Promise.all(ids.map((id) => api.updateInspectionStatus(id, data)));
    const byId = new Map(results.map((r) => [r.inspection.id, r.inspection]));
    setInspections((prev) => prev.map((i) => (byId.has(i.id) ? byId.get(i.id) : i)));
    const newNcrs = results.filter((r) => r.ncr).map((r) => r.ncr);
    if (newNcrs.length > 0) {
      setNcrs((prev) => [...prev, ...newNcrs]);
    }
    return results;
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
    equipmentPending: equipment.filter((eq) => eq.status === "대기").length,
  };
  badges.operations = badges.pending + badges.ncr;
  badges.safetyTotal = badges.safetyNcr + badges.workersPending + badges.equipmentPending;

  let content;
  if (!authChecked) {
    content = <CenterMessage>불러오는 중…</CenterMessage>;
  } else if (!initialDeepLink && !authUser) {
    content = (
      <LoginScreen
        onSignedUp={(profile) => {
          setAuthUser({ uid: profile.uid, email: profile.email });
          setUserProfile(profile);
        }}
      />
    );
  } else if (loading) {
    content = <CenterMessage>불러오는 중…</CenterMessage>;
  } else if (loadError) {
    content = (
      <CenterMessage>
        데이터를 불러오지 못했습니다.
        <br />
        {loadError}
      </CenterMessage>
    );
  } else if (initialDeepLink) {
    // QR로 특정 호실을 스캔해 들어온 경우: 로그인·사이드바 없이 이 화면만 보여준다.
    content = (
      <QrUnitScreen
        buildings={buildings}
        inspections={inspections}
        checklistItems={checklistItems}
        unitNotes={unitNotes}
        unitFloorPlans={unitFloorPlans}
        target={initialDeepLink}
        onCreateNote={handleCreateUnitNote}
        onDeleteNote={handleDeleteUnitNote}
        onCreateConfirmationRequest={handleCreateInspection}
      />
    );
  } else {
    content = (
      <>
        <Layout
          role={role}
          trueRole={trueRole}
          viewAsRole={viewAsRole}
          onSetViewAsRole={setViewAsRole}
          userProfile={userProfile}
          onLogout={handleLogout}
          view={view}
          setView={setView}
          badges={badges}
        >
          {view === "operations" && (
            <OperationsHub
              key={role}
              role={role}
              badges={badges}
              buildings={buildings}
              inspections={inspections}
              ncrs={ncrs}
              checklistItems={checklistItems}
              unitFloorPlans={unitFloorPlans}
              onCreateConfirmationRequest={handleCreateInspection}
              onUpdateInspectionStatus={handleUpdateInspectionStatus}
              onBatchUpdateInspectionStatus={handleBatchUpdateInspectionStatus}
              onUpdateNcrStatus={handleUpdateNcrStatus}
              onCreateChecklistItem={handleCreateChecklistItem}
              onDeleteChecklistItem={handleDeleteChecklistItem}
              onResetChecklistCategory={handleResetChecklistCategory}
              onReorderChecklistItems={handleReorderChecklistItems}
              notify={notify}
            />
          )}
          {view === "workers" && <Workers workers={workers} onCreateWorkers={handleCreateWorkers} notify={notify} />}
          {view === "workerRoster" && (
            <WorkerRoster
              workers={workers}
              onUpdateWorkerStatus={handleUpdateWorkerStatus}
              onAddWorkerWarning={handleAddWorkerWarning}
              notify={notify}
            />
          )}
          {view === "equipment" && <Equipment equipment={equipment} onCreateEquipment={handleCreateEquipment} notify={notify} />}
          {view === "safety" && (
            <SafetyOverview
              role={role}
              buildings={buildings}
              inspections={inspections}
              ncrs={ncrs}
              equipment={equipment}
              unitFloorPlans={unitFloorPlans}
              onUpdateNcrStatus={handleUpdateNcrStatus}
              onUpdateEquipmentStatus={handleUpdateEquipmentStatus}
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
              onUpdateBuilding={handleUpdateBuilding}
              canEdit={isAdminRole(role)}
              unitFloorPlans={unitFloorPlans}
              onCreateFloorPlan={handleCreateUnitFloorPlan}
              onUpdateFloorPlan={handleUpdateUnitFloorPlan}
              onDeleteFloorPlan={handleDeleteUnitFloorPlan}
              siteSettings={siteSettings}
              onUpdateSiteSettings={handleUpdateSiteSettings}
              notify={notify}
            />
          )}
          {view === "sitelayout" && (
            <SiteLayout buildings={buildings} checklistItems={checklistItems} inspections={inspections} onNavigateToUnit={handleNavigateToUnit} />
          )}
          {view === "site3d" && <Site3DView buildings={buildings} unitFloorPlans={unitFloorPlans} siteSettings={siteSettings} />}
        </Layout>
        <Toast message={toast} onDone={() => setToast("")} />
      </>
    );
  }

  return (
    <LanguageProvider lang={lang} onChange={handleChangeLanguage}>
      {content}
    </LanguageProvider>
  );
}

function CenterMessage({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)", fontSize: 14, textAlign: "center" }}>
      {children}
    </div>
  );
}
