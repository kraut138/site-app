import React, { useEffect, useMemo, useState } from "react";
import { Mic, Activity, ClipboardCheck, BookA, TrendingUp, PieChart, Sparkles, RefreshCw } from "lucide-react";
import { CATEGORIES } from "../data.js";
import { findTrade, tradeName } from "../voice.js";
import { fuzzyLabel } from "../fuzzyTerms.js";
import * as api from "../api.js";
import Dashboard from "../components/Dashboard.jsx";
import FoldToggle, { useFolded } from "../components/FoldToggle.jsx";
import { VoiceRecordMeta } from "../components/VoiceAudio.jsx";

// 공사현황 대시보드(현장통 시안의 첫 번째 탭): 숫자 카드 4개 → 실시간 음성 보고 피드 + 공종별 현황 → (앱에만 있던) 검측·NCR 분석 카드.
// 모든 숫자는 실제 데이터에서 나온다. 음성 보고는 화면이 열려 있는 동안만 가장 최근 FEED_COUNT건을 실시간으로 받는다(api.subscribeRecentVoiceReports).
const FEED_COUNT = 40; // 한 번에 받는 최근 보고 수(금일 건수 계산 + 피드 표시용)
const FEED_SHOWN = 8; // 피드에 보여 주는 개수
const CARD = "bg-white rounded-2xl border border-slate-200 shadow-sm";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 보고의 "순화한 내용": 용어 DB에 있는 단어만 남기기로 저장한 기록은 dbText, 아니면 은어만 표준 용어로 바꾼 normalized.
function refinedText(r) {
  if (typeof r.dbText === "string") return r.dbText;
  return r.normalized || r.summary || "";
}

export default function PortalDashboard({ buildings, inspections, ncrs }) {
  const [feed, setFeed] = useState(null); // null = 아직 못 받음
  const [feedError, setFeedError] = useState(false);
  const [glossary, setGlossary] = useState(null);
  const [buildingFilter, setBuildingFilter] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [tradeFolded, toggleTradeFolded] = useFolded("dashTrade"); // '공종별 검측 승인 현황'을 접어 두었는지(이 기기에 기억)

  // 화면이 열려 있는 동안만 실시간으로 받고, 떠나면 바로 끊는다(읽기 한도 절약).
  useEffect(() => {
    setFeedError(false);
    let off = () => {};
    try {
      off = api.subscribeRecentVoiceReports(
        FEED_COUNT,
        (rows) => {
          setFeed(rows);
          setFeedError(false);
        },
        () => setFeedError(true)
      );
    } catch {
      setFeedError(true);
    }
    return () => off();
  }, [reloadKey]);

  useEffect(() => {
    let alive = true;
    api
      .fetchGlossary()
      .then((g) => alive && setGlossary(g))
      .catch(() => alive && setGlossary(false));
    return () => {
      alive = false;
    };
  }, []);

  const today = useMemo(() => {
    const from = startOfToday();
    const rows = (feed || []).filter((r) => (r.timestamp || 0) >= from);
    return {
      count: rows.length,
      // 받은 보고가 모두 오늘 것이면 더 있을 수 있어 "N건 이상"으로 표시한다.
      more: !!feed && feed.length >= FEED_COUNT && rows.length === feed.length,
      voice: rows.filter((r) => r.via !== "text").length,
      text: rows.filter((r) => r.via === "text").length,
    };
  }, [feed]);

  const total = inspections.length;
  const approved = inspections.filter((i) => i.status === "승인").length;
  const rejected = inspections.filter((i) => i.status === "반려").length;
  const pending = inspections.filter((i) => i.status === "대기");
  const pendingUnits = new Set(pending.map((i) => `${i.buildingId}|${i.floor}|${i.unit}`)).size;
  const approvalRate = total ? Math.round((approved / total) * 100) : 0;
  const openNcr = ncrs.filter((n) => n.status !== "완료").length;

  const scoped = buildingFilter ? inspections.filter((i) => i.buildingId === buildingFilter) : inspections;
  const byCategory = CATEGORIES.map((c) => {
    const items = scoped.filter((i) => i.categoryId === c.id);
    const ok = items.filter((i) => i.status === "승인").length;
    return { ...c, total: items.length, approved: ok, percent: items.length ? Math.round((ok / items.length) * 100) : 0 };
  });

  const latest = feed && feed[0];

  return (
    <div className="space-y-6" data-testid="portal-dashboard">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          testId="kpi-today"
          label="금일 음성 보고"
          value={feed === null ? (feedError ? "-" : "…") : `${today.count}${today.more ? "+" : ""}건`}
          tone="text-slate-900"
          icon={<Mic className="w-6 h-6" aria-hidden="true" />}
          iconTone="bg-blue-50 text-blue-600"
          sub={
            <span className="text-emerald-600 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" aria-hidden="true" />
              {feed === null ? "불러오는 중" : `음성 ${today.voice}건 · 직접 입력 ${today.text}건`}
            </span>
          }
        />
        <Kpi
          testId="kpi-approval"
          label="검측 승인율"
          value={`${approvalRate}%`}
          tone="text-blue-600"
          icon={<Activity className="w-6 h-6" aria-hidden="true" />}
          iconTone="bg-emerald-50 text-emerald-600"
          sub={<span className="text-slate-500">{`승인 ${approved} · 반려 ${rejected} · 전체 ${total}건`}</span>}
        />
        <Kpi
          testId="kpi-pending"
          label="검측 대기 호실"
          value={`${pendingUnits}개소`}
          tone="text-amber-600"
          icon={<ClipboardCheck className="w-6 h-6" aria-hidden="true" />}
          iconTone="bg-amber-50 text-amber-600"
          sub={<span className="text-amber-600">{pending.length > 0 ? `승인 대기 ${pending.length}건 · 확인 필요` : "대기 중인 요청 없음"}</span>}
        />
        <Kpi
          testId="kpi-glossary"
          label="등록 은어 딕셔너리"
          value={glossary === null ? "…" : glossary === false ? "-" : `${glossary.terms.length}개`}
          tone="text-purple-600"
          icon={<BookA className="w-6 h-6" aria-hidden="true" />}
          iconTone="bg-purple-50 text-purple-600"
          sub={
            <span className="text-purple-600">
              {glossary ? `비슷한 용어 찾기 ${fuzzyLabel(glossary.fuzzy)}` : "용어 DB 변환 실시간 가동"}
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`lg:col-span-2 ${CARD} p-5 flex flex-col`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${feedError ? "bg-rose-500" : "bg-emerald-500 animate-pulse"}`} aria-hidden="true" />
              <h3 className="font-bold text-slate-900 text-sm">실시간 현장 음성 보고 피드 (Live Feed)</h3>
            </div>
            {feedError ? (
              <button
                type="button"
                data-testid="feed-retry"
                onClick={() => setReloadKey((k) => k + 1)}
                className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:text-blue-700"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" /> 다시 연결
              </button>
            ) : (
              <span className="text-xs text-slate-400 font-medium" data-testid="feed-state">
                {feed === null ? "연결 중…" : "자동 갱신 중"}
              </span>
            )}
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[460px] pr-1" data-testid="feed-list">
            {feedError && feed === null ? (
              <p className="text-xs text-rose-600 py-8 text-center">실시간 보고를 불러오지 못했습니다. 인터넷 연결을 확인하고 '다시 연결'을 눌러주세요.</p>
            ) : feed === null ? (
              <p className="text-xs text-slate-400 py-8 text-center">불러오는 중…</p>
            ) : feed.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center" data-testid="feed-empty">
                아직 접수된 음성 보고가 없습니다. 하도급 반장님이 음성으로 보고하면 여기에 바로 나타납니다.
              </p>
            ) : (
              feed.slice(0, FEED_SHOWN).map((r) => <FeedItem key={r.id} report={r} />)
            )}
          </div>
        </div>

        {/* 접어 두면 카드가 내용만큼만 차지한다(self-start). 펼쳐 둘 때는 옆 카드와 높이를 맞춘다. */}
        <div className={`${CARD} p-5 flex flex-col justify-between${tradeFolded ? " self-start" : ""}`} data-testid="trade-card" data-folded={tradeFolded ? "true" : "false"}>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <PieChart className="w-4 h-4 text-blue-600" aria-hidden="true" />
                공종별 검측 승인 현황
              </h3>
              <div className="flex items-center gap-1.5 ml-auto">
                <select
                  aria-label="동 선택"
                  data-testid="trade-building"
                  value={buildingFilter}
                  onChange={(e) => setBuildingFilter(e.target.value)}
                  className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">전체 동</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <FoldToggle folded={tradeFolded} onToggle={toggleTradeFolded} label="공종별 검측 승인 현황" controls="dash-trade-body" testId="trade-fold" />
              </div>
            </div>
            {tradeFolded ? (
              // 접은 모습: 공종 이름과 승인율만 한 줄로(건수는 펼치면 보인다)
              <div id="dash-trade-body" className="flex flex-wrap gap-x-4 gap-y-2 text-xs" data-testid="trade-summary">
                {byCategory.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 font-semibold text-slate-700" data-testid={`trade-sum-${c.id}`}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
                    {c.name}
                    <span className="font-bold" style={{ color: c.color }}>
                      {c.percent}%
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div id="dash-trade-body" className="space-y-4 text-xs" data-testid="trade-progress">
                {byCategory.map((c) => (
                  <div key={c.id} data-testid={`trade-${c.id}`}>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
                        {c.name}
                        <span className="font-normal text-slate-400">{`${c.approved}/${c.total}건`}</span>
                      </span>
                      <span className="font-bold" style={{ color: c.color }}>
                        {c.percent}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${c.percent}%`, backgroundColor: c.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50 p-3 rounded-xl" data-testid="attention-box">
            <span className="text-[11px] font-bold text-slate-700 block mb-1">현장 확인 필요 사항</span>
            <p className="text-xs text-slate-500">
              {openNcr > 0
                ? `조치가 끝나지 않은 NCR이 ${openNcr}건 있습니다. '6. 검측·NCR·표준 공종' 탭의 NCR 관리에서 확인해주세요.`
                : pending.length > 0
                  ? `승인을 기다리는 공사 확인 요청이 ${pending.length}건 있습니다. '6. 검측·NCR·표준 공종' 탭에서 확인해주세요.`
                  : "미해결 NCR과 승인 대기 요청이 없습니다."}
              {latest ? ` 가장 최근 음성 보고는 ${latest.zone} ${latest.time ? String(latest.time).slice(0, 5) : ""}입니다.` : ""}
            </p>
          </div>
        </div>
      </div>

      <div data-testid="portal-analysis">
        <div className="flex items-center gap-2 px-1 mb-3">
          <h3 className="font-bold text-slate-900 text-sm">검측·NCR 분석</h3>
          <span className="text-[11px] text-slate-400">동별 승인율, NCR 상태, 공종별 부적합, 미해결 지적사항 위치</span>
        </div>
        <Dashboard buildings={buildings} inspections={inspections} ncrs={ncrs} hideStats />
      </div>
    </div>
  );
}

function Kpi({ testId, label, value, tone, icon, iconTone, sub }) {
  return (
    <div className={`${CARD} p-5 flex items-center justify-between gap-3`} data-testid={testId}>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400">{label}</p>
        <h3 className={`text-2xl font-black mt-1 ${tone}`} data-testid={`${testId}-value`}>
          {value}
        </h3>
        <p className="text-[11px] font-semibold mt-1">{sub}</p>
      </div>
      <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${iconTone}`}>{icon}</div>
    </div>
  );
}

function FeedItem({ report: r }) {
  const trade = findTrade(r.trade);
  const color = trade?.color || "#475569";
  const name = tradeName(r.trade) || "공종 미지정";
  const refined = refinedText(r);
  const place = r.elem ? `${r.zone} · ${r.elem}` : r.zone;
  return (
    <div className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition" data-testid="feed-item" data-report-id={r.id}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
          <span className="font-bold text-sm text-slate-900">{place}</span>
          <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded" style={{ backgroundColor: color }}>
            {r.tradeItem ? `${name} · ${r.tradeItem}` : name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-slate-400 font-mono">{r.time ? String(r.time).slice(0, 5) : ""}</span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.progressOff ? "bg-rose-100 text-rose-700" : r.via === "text" ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-700"}`}
          >
            {r.progressOff ? "진행도 제외" : r.via === "text" ? "직접 입력" : "음성"}
          </span>
        </div>
      </div>
      <div className="bg-slate-50 rounded-lg p-3 space-y-2">
        <p className="text-xs italic text-slate-500 flex gap-1.5">
          <Mic className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
          <span data-testid="feed-raw">“{r.rawText}”</span>
        </p>
        <p className="text-xs font-semibold text-emerald-900 flex gap-1.5 border-t border-slate-200 pt-2">
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
          <span data-testid="feed-refined">{refined || "용어 DB에 있는 단어가 없어 순화한 내용이 비어 있습니다."}</span>
        </p>
        <VoiceRecordMeta report={r} prefix="feed" />
      </div>
    </div>
  );
}
