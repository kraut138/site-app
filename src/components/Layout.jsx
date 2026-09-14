import React from "react";
import { Icon } from "./UI.jsx";
import { ROLES, isViewAllowed } from "../data.js";
import { useLanguage } from "../LanguageContext.jsx";

// 역할별로 사이드바에 붙는 색상 클래스와 표시 라벨 키. 관리자는 기본(남색) 그대로 둔다.
function roleAppearance(role) {
  if (role === ROLES.SUB) return { className: "role-sub", labelKey: "role.sub" };
  if (role === ROLES.INSPECTOR) return { className: "role-inspector", labelKey: "role.inspector" };
  return { className: "", labelKey: "role.super" };
}

const NAV_GROUPS = [
  {
    groupKey: "nav.group.status",
    items: [
      { id: "operations", labelKey: "nav.operations", Icon: Icon.Dashboard, badgeKey: "operations" },
      { id: "workers", labelKey: "nav.workers", Icon: Icon.Worker, badgeKey: "workersPending" },
      { id: "equipment", labelKey: "nav.equipment", Icon: Icon.Excavator, badgeKey: "equipmentPending" },
      { id: "unitinfo", labelKey: "nav.unitinfo", Icon: Icon.Door },
      { id: "buildings", labelKey: "nav.buildings", Icon: Icon.Building },
      { id: "sitelayout", labelKey: "nav.sitelayout", Icon: Icon.Cube },
      { id: "site3d", labelKey: "nav.site3d", Icon: Icon.CitySkyline },
    ],
  },
  {
    groupKey: "nav.group.safety",
    items: [{ id: "safety", labelKey: "nav.safety", Icon: Icon.Shield, badgeKey: "safetyTotal" }],
  },
];

const PAGE_META = {
  operations: { titleKey: "page.operations.title", descKey: "page.operations.desc" },
  workers: { titleKey: "page.workers.title", descKey: "page.workers.desc" },
  equipment: { titleKey: "page.equipment.title", descKey: "page.equipment.desc" },
  unitinfo: { titleKey: "page.unitinfo.title", descKey: "page.unitinfo.desc" },
  buildings: { titleKey: "page.buildings.title", descKey: "page.buildings.desc" },
  sitelayout: { titleKey: "page.sitelayout.title", descKey: "page.sitelayout.desc" },
  site3d: { titleKey: "page.site3d.title", descKey: "page.site3d.desc" },
  safety: { titleKey: "page.safety.title", descKey: "page.safety.desc" },
};

export default function Layout({ role, userProfile, onLogout, view, setView, badges = {}, children }) {
  const { t } = useLanguage();
  const meta = PAGE_META[view] || {};
  const { className: roleClassName, labelKey: roleLabelKey } = roleAppearance(role);
  return (
    <div className="app-shell">
      <aside className={`sidebar${roleClassName ? ` ${roleClassName}` : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 13.5 9.5 19 20 6" />
            </svg>
          </div>
          <div className="sidebar-brand-text">
            <div className="title">{t("app.brand")}</div>
            <div className="sub">{t("app.brandSub")}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => isViewAllowed(item.id, role));
            if (visibleItems.length === 0) return null;
            return (
              <div className="sidebar-nav-group" key={group.groupKey}>
                <div className="sidebar-nav-group-label">{t(group.groupKey)}</div>
                {visibleItems.map((item) => {
                  const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                  return (
                    <button
                      key={item.id}
                      className={`sidebar-nav-item${view === item.id ? " active" : ""}`}
                      onClick={() => setView(item.id)}
                    >
                      <item.Icon className="icon" />
                      {t(item.labelKey)}
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
            <div className="label">{t(roleLabelKey)}</div>
            <div className="account-info">
              <span className="account-name">{userProfile?.name || userProfile?.email || ""}</span>
              <button className="btn btn-ghost btn-sm" onClick={onLogout}>
                {t("common.logout")}
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
            <h1>{t(meta.titleKey)}</h1>
            <div className="desc">{t(meta.descKey)}</div>
          </div>
          <div className="topbar-role-switcher">
            <span className="account-name">{userProfile?.name || userProfile?.email || ""}</span>
            <button className="btn btn-ghost btn-sm" onClick={onLogout}>
              {t("common.logout")}
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
