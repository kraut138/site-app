import React from "react";
import { ShieldCheck } from "lucide-react";
import PlatformHeader from "./PlatformHeader.jsx";
import { ADMIN_TABS, SUB_TABS, PAGE_META, ADMIN_PAGE_META } from "./tabs.js";
import { ROLES, defaultViewFor } from "../data.js";
import { useLanguage } from "../LanguageContext.jsx";

/**
 * 로그인한 뒤의 화면 틀(현장통 디자인): 상단바 → 탭 → 화면 제목 → 내용 → 바닥글.
 * 관리자는 "시공사 관리자 포털" 탭 전체를, 하도급사는 "하도급 반장 모바일 모드"의 두 탭(음성 보고, 공사 확인·NCR)만 본다.
 * 어떤 탭을 열 수 있는지는 data.js의 VIEW_ROLES가 정하고, 이 틀은 역할에 맞는 탭 줄만 그려 준다.
 */
export default function PlatformShell({ role, trueRole, onSetViewAsRole, userProfile, onLogout, view, setView, badges = {}, headerRight = null, metaKey = null, children }) {
  const { t } = useLanguage();
  const isSub = role === ROLES.SUB;
  const tabs = isSub ? SUB_TABS : ADMIN_TABS;
  const mk = metaKey || view;
  const meta = (!isSub && ADMIN_PAGE_META[mk]) || PAGE_META[mk] || {};
  const title = meta.titleKey ? t(meta.titleKey) : meta.title || "";
  const desc = meta.descKey ? t(meta.descKey) : meta.desc || "";
  // 모바일 모드의 음성 화면은 시안처럼 좁은 한 줄 화면, 나머지는 넓게 쓴다.
  const widthClass = !isSub ? "max-w-7xl" : view === "voice" ? "max-w-lg" : "max-w-4xl";

  return (
    <div className="flex-1 flex flex-col" data-testid="portal-shell" data-mode={isSub ? "sub" : "admin"}>
      <PlatformHeader
        role={role}
        trueRole={trueRole}
        onSetViewAsRole={onSetViewAsRole}
        userProfile={userProfile}
        onLogout={onLogout}
        onHome={() => setView(defaultViewFor(role))}
      />

      <main className={`flex-1 w-full mx-auto p-4 lg:p-6 flex flex-col space-y-6 ${widthClass}`}>
        <nav
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-1.5 flex overflow-x-auto lg:flex-wrap gap-1"
          data-testid="portal-tabs"
        >
          {tabs.map((tab) => {
            const active = view === tab.id;
            const badge = tab.badgeKey ? badges[tab.badgeKey] : 0;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`tab-${tab.id}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setView(tab.id)}
                className={`tab-btn px-4 py-2.5 rounded-xl text-xs md:text-sm flex items-center gap-2 whitespace-nowrap transition border-b-[2.5px] ${
                  active ? "active text-blue-700 border-blue-700 font-bold" : "text-slate-600 hover:text-blue-600 border-transparent font-medium"
                }`}
              >
                <tab.Icon className="w-4 h-4" aria-hidden="true" />
                <span>{tab.label ?? t(tab.labelKey)}</span>
                {!!badge && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none" data-testid={`tab-badge-${tab.id}`}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <section className="space-y-4 min-w-0" data-testid="portal-content" data-view={view}>
          {title && (
            <div className="px-1 flex items-start justify-between gap-3" data-testid="page-head">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-900 tracking-tight" data-testid="page-title">
                  {title}
                </h2>
                {desc && (
                  <p className="text-xs text-slate-500 mt-0.5" data-testid="page-desc">
                    {desc}
                  </p>
                )}
              </div>
              {headerRight && <div className="shrink-0">{headerRight}</div>}
            </div>
          )}
          {children}
        </section>
      </main>

      <PlatformFooter showSafety={isSub} />
    </div>
  );
}

export function PlatformFooter({ showSafety = false }) {
  const { t } = useLanguage();
  return (
    <footer className="py-6 px-4 text-center text-[11px] text-slate-400 flex flex-col items-center gap-3" data-testid="portal-footer">
      {showSafety && (
        <p className="flex items-center justify-center gap-1 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
          {t("platform.safety")}
        </p>
      )}
      <span className="inline-block bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
        <img src={`${import.meta.env.BASE_URL}logo-kwangwoon.png`} alt="광운건설" className="h-9 w-auto" />
      </span>
    </footer>
  );
}
