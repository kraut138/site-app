import React from "react";
import { Icon } from "./UI.jsx";
import { ROLES, RESTRICTED_VIEWS_FOR_SUB } from "../data.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "대시보드", Icon: Icon.Dashboard },
  { id: "checklist", label: "체크리스트", Icon: Icon.Checklist },
  { id: "inspections", label: "검측관리", Icon: Icon.Inspection, badgeKey: "pending" },
  { id: "ncr", label: "NCR 관리", Icon: Icon.Ncr, badgeKey: "ncr" },
  { id: "buildings", label: "동 관리", Icon: Icon.Building },
  { id: "sitelayout", label: "배치도(3D)", Icon: Icon.Cube },
];

const PAGE_META = {
  dashboard: { title: "대시보드", desc: "공종별·동별 검측 현황과 부적합 통계를 한눈에 확인합니다" },
  checklist: { title: "표준 체크리스트", desc: "공종별 표준 검측 항목을 확인합니다" },
  inspections: { title: "검측관리", desc: "검측 요청, 도면 위치 확인, 원클릭 승인/반려" },
  ncr: { title: "NCR 관리", desc: "부적합 사항 조치 현황과 재검측 프로세스" },
  buildings: { title: "동 관리", desc: "현장 동·층·세대 정보를 관리합니다" },
  sitelayout: { title: "배치도(3D)", desc: "동의 대략적인 위치와 형태를 3D로 확인합니다" },
};

export default function Layout({ role, setRole, view, setView, badges = {}, children }) {
  const meta = PAGE_META[view] || {};
  const visibleNavItems = NAV_ITEMS.filter((item) => role === ROLES.SUPER || !RESTRICTED_VIEWS_FOR_SUB.includes(item.id));
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
          {visibleNavItems.map((item) => {
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
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div>
            <h1>{meta.title}</h1>
            <div className="desc">{meta.desc}</div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
