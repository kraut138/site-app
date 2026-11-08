import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Tag, Download, Printer, Smartphone, Link as LinkIcon, Building2, Mic, Plus, Trash2 } from "lucide-react";
import { CATEGORIES } from "../data.js";
import { QR_TRADE_IDS, buildTradeLink } from "../qr.js";
import { CUSTOM_TRADE_COLORS, CUSTOM_TRADE_LIMITS, newCustomTradeId } from "../voice.js";
import * as api from "../api.js";
import { spokenExample } from "../spokenUnit.js";

// 공종별 QR 생성소(현장통 시안의 1번 탭). QR은 공종마다 하나씩(골조공사·마감공사·설비/전기) - 호실마다 만들지 않는다.
// QR에는 공종만 담긴 주소(?trade=)가 있어서, 스캔하면 로그인 없이 그 공종의 음성 보고 화면이 열린다.
// 거기서 "101동 502호 도배 완료"처럼 동·호실과 작업을 함께 말하면 말한 호실의 기록으로 저장되고, 골구도와 서류 작성에 쓰인다(QrTradeScreen / VoiceInspection).
// 예전에 호실마다 만들어 붙인 QR(?b=&f=&u=)은 만들지는 않지만 계속 열린다(App.jsx).
// 기본 공종 3종. 관리자가 직접 추가한 공종은 화면이 열릴 때 Firestore(meta/customTrades)에서 읽어 이어 붙인다.
const BASE_TRADES = CATEGORIES.filter((c) => QR_TRADE_IDS.includes(c.id));

function fileSafe(text) {
  return String(text).replace(/[\\/:*?"<>|]/g, "");
}

export default function QrGenerator({ buildings, notify, onGoBuildings }) {
  const [customTrades, setCustomTrades] = useState([]); // 직접 추가한 공종 [{ id, name, color }]
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api.fetchCustomTrades().then((list) => alive && setCustomTrades(list));
    return () => {
      alive = false;
    };
  }, []);

  const TRADES = useMemo(
    () => [...BASE_TRADES, ...customTrades.map((t) => ({ id: t.id, name: t.name, color: t.color, custom: true }))],
    [customTrades]
  );
  // 주소는 현재 사이트 주소 + ?trade=공종. (직접 추가한 공종은 읽어 온 뒤 등록되므로 customTrades가 바뀔 때 다시 만든다)
  const links = useMemo(() => Object.fromEntries(TRADES.map((c) => [c.id, buildTradeLink(c.id)])), [TRADES]);
  const [qrUrls, setQrUrls] = useState({});
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let alive = true;
    setQrUrls({});
    setQrError(false);
    Promise.all(
      TRADES.map((c) =>
        QRCode.toDataURL(links[c.id], { width: 480, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } }).then((url) => [c.id, url])
      )
    )
      .then((pairs) => alive && setQrUrls(Object.fromEntries(pairs)))
      .catch(() => alive && setQrError(true));
    return () => {
      alive = false;
    };
  }, [links, TRADES]);

  async function addTrade(e) {
    if (e) e.preventDefault();
    const name = newName.replace(/\s+/g, " ").trim();
    if (!name) return notify && notify("추가할 공종명을 입력해 주세요.");
    if (name.length > CUSTOM_TRADE_LIMITS.name) return notify && notify(`공종명은 ${CUSTOM_TRADE_LIMITS.name}글자까지 쓸 수 있어요.`);
    const key = (v) => String(v).replace(/\s+/g, "").toLowerCase();
    if (TRADES.some((t) => key(t.name) === key(name) || key(t.shortName || "") === key(name))) return notify && notify(`‘${name}’ 공종은 이미 있어요.`);
    if (customTrades.length >= CUSTOM_TRADE_LIMITS.max) return notify && notify(`공종은 ${CUSTOM_TRADE_LIMITS.max}개까지 추가할 수 있어요.`);
    const color = CUSTOM_TRADE_COLORS[customTrades.length % CUSTOM_TRADE_COLORS.length];
    setSaving(true);
    try {
      const saved = await api.saveCustomTrades([...customTrades, { id: newCustomTradeId(), name, color }]);
      setCustomTrades(saved);
      setNewName("");
      if (notify) notify(`${name} 공종을 추가하고 QR을 만들었습니다.`);
    } catch {
      if (notify) notify("공종을 저장하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTrade(c) {
    if (!window.confirm(`‘${c.name}’ 공종을 삭제할까요?\n이미 붙여 둔 이 공종의 QR은 더 이상 쓸 수 없고, 저장된 보고의 공종 이름은 보이지 않게 됩니다.`)) return;
    setSaving(true);
    try {
      setCustomTrades(await api.saveCustomTrades(customTrades.filter((t) => t.id !== c.id)));
      if (notify) notify(`${c.name} 공종을 삭제했습니다.`);
    } catch {
      if (notify) notify("공종을 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  function download(c) {
    const url = qrUrls[c.id];
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR_공종별_${fileSafe(c.name)}.png`;
    a.click();
    if (notify) notify(`${c.name} QR 이미지를 저장했습니다.`);
  }

  async function copyLink(c) {
    try {
      await navigator.clipboard.writeText(links[c.id]);
      if (notify) notify(`${c.name} QR 링크를 복사했습니다.`);
    } catch {
      if (notify) notify("복사하지 못했습니다. 링크를 길게 눌러 직접 복사해주세요.");
    }
  }

  function testAsSubcontractor(c) {
    // 진짜로 스캔한 것과 같은 주소를 새 탭으로 연다: 로그인 없이 그 공종의 음성 보고 화면이 뜬다.
    window.open(links[c.id], "_blank", "noopener");
  }

  const hasBuildings = Array.isArray(buildings) && buildings.length > 0;

  return (
    <div className="space-y-6" data-testid="qrgen">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3 print:hidden">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 pb-2 border-b border-slate-100">
          <Tag className="w-4 h-4 text-blue-600" aria-hidden="true" /> 공종별 QR 라벨
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed" data-testid="qrgen-intro">
          QR은 <strong>공종마다 하나씩</strong>이에요(골조·마감·설비/전기 외에 아래에서 직접 추가할 수 있어요). 호실마다 만들 필요가 없어요. 작업자가 해당 공종의 QR을 스캔해서 <strong>“101동 502호 도배 완료”</strong>처럼 동·호실과 작업을 말하면,
          그 호실의 작업이 완료로 기록되어 <strong>골구도</strong>에 표시되고 <strong>서류 작성</strong>에도 쓰여요.
        </p>
        <form onSubmit={addTrade} className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100" data-testid="qrgen-add-form">
          <label htmlFor="qrgen-new-trade" className="text-xs font-bold text-slate-700">
            공종 추가
          </label>
          <input
            id="qrgen-new-trade"
            type="text"
            value={newName}
            maxLength={CUSTOM_TRADE_LIMITS.name}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="공종명을 입력하세요 (예: 도장공사)"
            className="flex-1 min-w-[10rem] px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-600"
            data-testid="qrgen-new-trade"
          />
          <button
            type="submit"
            disabled={saving}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-xs flex items-center gap-1.5 shadow transition active:scale-95"
            data-testid="qrgen-add-trade"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> 공종 추가
          </button>
          <p className="basis-full text-[11px] text-slate-400">공종명을 적고 ‘공종 추가’를 누르면 골조·마감·설비/전기처럼 그 공종의 QR이 바로 만들어져요.</p>
        </form>
        {!hasBuildings && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800" data-testid="qrgen-nobuilding">
            <Building2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">아직 등록된 동이 없어요. 말한 동·호실을 찾으려면 먼저 ‘2. 동.호수 생성’에서 동을 등록해 주세요.</span>
            {onGoBuildings && (
              <button type="button" onClick={onGoBuildings} className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-sm transition">
                동.호수 생성으로 가기
              </button>
            )}
          </div>
        )}
      </div>

      <div id="printable-qr-sheet" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 justify-items-center" data-testid="qrgen-sheet">
        {TRADES.map((c) => {
          const link = links[c.id];
          const qrUrl = qrUrls[c.id];
          const example = spokenExample(buildings, c.id);
          return (
            <div key={c.id} className="w-full max-w-[18rem] flex flex-col items-center" data-testid={`qrgen-card-${c.id}`}>
              <div
                data-testid={`qrgen-sticker-${c.id}`}
                data-link={link}
                className="qrgen-sticker w-full bg-white border-4 rounded-2xl p-4 shadow-xl text-center transition-all"
                style={{ borderColor: c.color }}
              >
                <div className="text-white py-1.5 px-3 rounded-lg font-bold text-sm flex items-center justify-between shadow-sm" style={{ backgroundColor: c.color }} data-testid={`qrgen-sticker-head-${c.id}`}>
                  <span data-testid={`qrgen-sticker-trade-${c.id}`}>{c.name}</span>
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">{c.custom ? "추가 공종 QR" : "공종별 QR"}</span>
                </div>

                <div className="my-4 flex items-center justify-center p-2 bg-white rounded-lg min-h-[140px]">
                  {qrError ? (
                    <span className="text-xs text-rose-600">QR 생성에 실패했습니다.</span>
                  ) : qrUrl ? (
                    <img src={qrUrl} alt={`${c.name} 공종별 QR코드`} className="w-44 h-44" data-testid={`qrgen-img-${c.id}`} />
                  ) : (
                    <span className="text-xs text-slate-400">생성 중…</span>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-2">
                  <h4 className="text-xl font-black text-slate-900 tracking-tight" data-testid={`qrgen-sticker-name-${c.id}`}>
                    {c.name}
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">스마트폰 카메라로 스캔하고 말씀해 주세요</p>
                  <p className="mt-2 text-xs font-bold text-slate-800 flex items-center justify-center gap-1" data-testid={`qrgen-example-${c.id}`}>
                    <Mic className="w-3.5 h-3.5" style={{ color: c.color }} aria-hidden="true" />
                    <span>“{example}”</span>
                  </p>
                </div>
              </div>

              <p className="mt-3 max-w-full text-center text-[10px] font-mono text-slate-400 break-all print:hidden" data-testid={`qrgen-link-${c.id}`}>
                {link}
              </p>

              <div className="flex flex-wrap justify-center gap-2 mt-3 print:hidden">
                <button
                  type="button"
                  data-testid={`qrgen-download-${c.id}`}
                  onClick={() => download(c)}
                  disabled={!qrUrl}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-1.5 shadow transition active:scale-95"
                >
                  <Download className="w-4 h-4" aria-hidden="true" /> 이미지 저장
                </button>
                <button
                  type="button"
                  data-testid={`qrgen-copy-${c.id}`}
                  onClick={() => copyLink(c)}
                  className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <LinkIcon className="w-4 h-4" aria-hidden="true" /> 링크 복사
                </button>
                <button
                  type="button"
                  data-testid={`qrgen-test-${c.id}`}
                  onClick={() => testAsSubcontractor(c)}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition"
                >
                  <Smartphone className="w-4 h-4" aria-hidden="true" /> 바로 테스트
                </button>
                {c.custom && (
                  <button
                    type="button"
                    data-testid={`qrgen-remove-${c.id}`}
                    onClick={() => removeTrade(c)}
                    disabled={saving}
                    className="px-3 py-2 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" /> 삭제
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center print:hidden">
        <button
          type="button"
          data-testid="qrgen-print"
          onClick={() => window.print()}
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow transition"
        >
          <Printer className="w-4 h-4" aria-hidden="true" /> {TRADES.length}종 라벨 인쇄
        </button>
      </div>
    </div>
  );
}
