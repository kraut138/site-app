import React from "react";
import { Icon } from "./UI.jsx";
import { ROLES, isViewAllowed } from "../data.js";

const NAV_GROUPS = [
  {
    label: "공사현황",
    items: [
      { id: "operations", label: "공사현황", Icon: Icon.Dashboard, badgeKey: "operations" },
      { id: "workers", label: "인력 등록", Icon: Icon.Worker, badgeKey: "workersPending" },
      { id: "equipment", label: "건설기계 등록", Icon: Icon.Excavator, badgeKey: "equipmentPending" },
      { id: "unitinfo", label: "호실 정보", Icon: Icon.Door },
      { id: "buildings", label: "동 관리", Icon: Icon.Building },
      { id: "sitelayout", label: "골구도", Icon: Icon.Cube },
      { id: "site3d", label: "현장 3D", Icon: Icon.CitySkyline },
    ],
  },
  {
    label: "안전관리",
    items: [{ id: "safety", label: "안전 현황", Icon: Icon.Shield, badgeKey: "safetyTotal" }],
  },
];

const PAGE_META = {
  operations: { title: "공사현황", desc: "대시보드·공사 확인 요청 내역·NCR 관리·표준 공종을 한 곳에서 확인합니다" },
  workers: { title: "인력 등록", desc: "건설사·공종을 선택해 현장 인력을 등록하고 승인 현황을 확인합니다" },
  equipment: { title: "건설기계 등록", desc: "현장에 반입하는 건설기계를 등록하고 감리단 승인 현황을 확인합니다" },
  unitinfo: { title: "호실 정보", desc: "동·호수를 선택해 공종별 진행도, 특이사항, 평면도를 확인합니다" },
  buildings: { title: "동 관리", desc: "현장 동·층·세대 정보를 관리합니다" },
  sitelayout: { title: "골구도", desc: "동의 대략적인 위치와 형태를 3D로 확인합니다" },
  site3d: { title: "현장 3D", desc: "등록된 평면도와 배치 위치를 바탕으로 현장 전체를 3D 매스로 확인합니다" },
  safety: { title: "안전 현황", desc: "안전/환경 공종의 검측·NCR과 현장 인력 현황을 모아서 확인합니다" },
};

export default function Layout({ role, setRole, view, setView, badges = {}, children }) {
  const meta = PAGE_META[view] || {};
  return (
    <div className="app-shell">
      <aside className={`sidebar${role === ROLES.SUB ? " role-sub" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 13.5 9.5 19 20 6" />
            </svg>
          </div>
          <div className="sidebar-brand-text">
            <div className="title">현장검측</div>
            <div className="sub">SITE QC SYSTEM</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => isViewAllowed(item.id, role));
            if (visibleItems.length === 0) return null;
            return (
              <div className="sidebar-nav-group" key={group.label}>
                <div className="sidebar-nav-group-label">{group.label}</div>
                {visibleItems.map((item) => {
                  const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                  return (
                    <button
                      key={item.id}
                      className={`sidebar-nav-item${view === item.id ? " active" : ""}`}
                      onClick={() => setView(item.id)}
                    >
                      <item.Icon className="icon" />
                      {item.label}
                      {!!badge && <span className="sidebar-nav-badge">{badge > 99 ? "99+" : badge}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="role-switcher">
            <div className="label">현재 역할</div>
            <div className="role-pill-group">
              <button className={`role-pill${role === ROLES.SUB ? " active" : ""}`} onClick={() => setRole(ROLES.SUB)}>
                하도급사
              </button>
              <button className={`role-pill${role === ROLES.SUPER ? " active" : ""}`} onClick={() => setRole(ROLES.SUPER)}>
                감리단/소장
              </button>
            </div>
          </div>
          <div className="sidebar-company-logo">
            <img src={`${import.meta.env.BASE_URL}logo-kwangwoon.png`} alt="광운건설" />
          </div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div>
            <h1>{meta.title}</h1>
            <div className="desc">{meta.desc}</div>
          </div>
          <div className="topbar-role-switcher">
            <button className={`role-pill${role === ROLES.SUB ? " active" : ""}`} onClick={() => setRole(ROLES.SUB)}>
              하도급사
            </button>
            <button className={`role-pill${role === ROLES.SUPER ? " active" : ""}`} onClick={() => setRole(ROLES.SUPER)}>
              감리단/소장
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
