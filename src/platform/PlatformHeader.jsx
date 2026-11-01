import React from "react";
import { HardHat, Building, Mic, LogOut } from "lucide-react";
import { ROLES } from "../data.js";
import { LANGUAGES } from "../i18n.js";
import { useLanguage } from "../LanguageContext.jsx";

// 상단바 제목 옆에 붙는 작은 표시(현장통 시안의 "v1.2 Live" 자리). 화면이 크게 바뀔 때만 올리면 된다.
export const PLATFORM_VERSION = "v2.0";

/**
 * 현장통 상단바. 모든 화면(로그인·QR 스캔 화면 포함)이 같은 모양을 쓴다.
 *  - variant "full"  : 로그인한 뒤의 화면. 관리자는 모드 전환 버튼, 모두에게 계정·언어·로그아웃이 붙는다.
 *  - variant "brand" : 로고와 제목만 있는 모양(로그인 화면, QR로 들어온 화면처럼 로그인 정보가 없는 곳).
 * 관리자(진짜 계정 권한이 관리자)만 "시공사 관리자 포털"과 "하도급 반장 모바일 모드"를 오갈 수 있다.
 * 모바일 모드를 고르면 하도급사가 보는 화면을 그대로 미리 볼 수 있다(저장된 권한은 바뀌지 않는다).
 */
export default function PlatformHeader({ variant = "full", role, trueRole, onSetViewAsRole, userProfile, onLogout, onHome, right = null }) {
  const { t, lang, setLang } = useLanguage();
  const canSwitchMode = variant === "full" && trueRole === ROLES.SUPER;
  const subActive = role === ROLES.SUB;
  const showAccount = variant === "full" && userProfile;
  // 언어는 하도급사 화면에만 적용된다. 관리자는 모바일 모드를 미리 보는 동안에만 고를 수 있게 한다.
  const showLanguage = showAccount && role === ROLES.SUB;
  const accountName = userProfile?.name || userProfile?.email || "";

  const brandInner = (
    <>
      <div className="shrink-0 bg-amber-500 text-slate-950 p-2 rounded-xl font-black tracking-tight flex items-center shadow-md">
        <HardHat className="w-6 h-6 mr-1.5" aria-hidden="true" />
        <span className="text-xl whitespace-nowrap">{t("platform.brand")}</span>
      </div>
      <div className="min-w-0">
        <h1 className="text-sm font-bold tracking-wide flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{t("platform.title")}</span>
          <span className="bg-blue-600/90 text-[10px] font-mono px-1.5 py-0.5 rounded text-blue-100">{PLATFORM_VERSION} Live</span>
        </h1>
        <p className="text-[11px] text-slate-400">{t("platform.subtitle")}</p>
      </div>
    </>
  );

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md" data-testid="portal-header">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-3">
        {onHome ? (
          <button type="button" onClick={onHome} className="flex items-center space-x-3 cursor-pointer select-none text-left" data-testid="platform-brand">
            {brandInner}
          </button>
        ) : (
          <div className="flex items-center space-x-3 select-none" data-testid="platform-brand">
            {brandInner}
          </div>
        )}

        {variant === "brand" && right && <div className="flex items-center gap-2">{right}</div>}

        {(canSwitchMode || showAccount) && (
          <div className="flex flex-wrap items-center gap-2">
            {canSwitchMode && (
              <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700" data-testid="mode-switch">
                <button
                  type="button"
                  data-testid="mode-admin"
                  aria-pressed={!subActive}
                  onClick={() => onSetViewAsRole(null)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    subActive ? "text-slate-400 hover:text-white" : "bg-blue-600 text-white shadow"
                  }`}
                >
                  <Building className="w-4 h-4" aria-hidden="true" />
                  <span>시공사 관리자 포털</span>
                </button>
                <button
                  type="button"
                  data-testid="mode-sub"
                  aria-pressed={subActive}
                  onClick={() => onSetViewAsRole(ROLES.SUB)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    subActive ? "bg-amber-500 text-slate-950 shadow" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Mic className="w-4 h-4" aria-hidden="true" />
                  <span>하도급 반장 모바일 모드</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold ml-1 whitespace-nowrap ${
                      subActive ? "bg-slate-950/15 text-slate-950" : "bg-amber-500 text-slate-950"
                    }`}
                  >
                    QR 모드
                  </span>
                </button>
              </div>
            )}

            {showAccount && (
              <div className="flex items-center gap-1.5 text-xs" data-testid="account-box">
                <span className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 whitespace-nowrap">
                  {t(role === ROLES.SUB ? "role.sub" : "role.super")}
                </span>
                <span className="account-name font-semibold text-slate-200 max-w-[9rem] truncate" data-testid="account-name" title={accountName}>
                  {accountName}
                </span>
                {showLanguage && (
                  <select
                    aria-label={t("dashboard.language")}
                    data-testid="lang-select"
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  data-testid="logout-btn"
                  onClick={onLogout}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-semibold transition"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t("common.logout")}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
