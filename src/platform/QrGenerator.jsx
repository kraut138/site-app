import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Tag, Download, Printer, Smartphone, Link as LinkIcon, Building2 } from "lucide-react";
import { CATEGORIES, unitOptions } from "../data.js";
import { QR_TRADE_IDS, buildUnitDeepLink } from "../qr.js";

// 공종별 QR 생성소(현장통 시안의 1번 탭). 동·층·호실과 공종을 고르면 현장 벽에 붙일 QR 스티커를 만든다.
// QR에는 실제 호실 주소(?b=동&f=층&u=호)와 공종(&t=)이 담겨, 스캔하면 로그인 없이 그 호실의 음성 검측 화면이 열리고
// 고른 공종이 미리 선택되어 있다. 스티커는 고를 때마다 바로 바뀌므로, 화면에 보이는 글과 QR의 내용이 어긋날 일이 없다.
const NEUTRAL = { id: "", name: "공종 지정 안 함", color: "#475569", colorName: "Slate" };
const COLOR_NAMES = { frame: "Blue", finish: "Purple", mep: "Emerald" };
const TRADE_OPTIONS = [
  ...CATEGORIES.filter((c) => QR_TRADE_IDS.includes(c.id)).map((c) => ({ id: c.id, name: c.name, color: c.color, colorName: COLOR_NAMES[c.id] })),
  NEUTRAL,
];

const FIELD = "w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function QrGenerator({ buildings, notify, onGoBuildings }) {
  const [buildingId, setBuildingId] = useState(() => buildings[0]?.id || "");
  const [floor, setFloor] = useState(1);
  const [unit, setUnit] = useState("01");
  const [tradeId, setTradeId] = useState("frame");
  const [qrUrl, setQrUrl] = useState("");
  const [qrError, setQrError] = useState(false);

  const building = buildings.find((b) => b.id === buildingId) || buildings[0] || null;
  const floors = Math.max(1, Number(building?.floors) || 1);
  const units = useMemo(() => unitOptions(building?.unitsPerFloor), [building?.unitsPerFloor]);
  // 동을 바꿨을 때 이전에 고른 층·호가 그 동에 없으면 가까운 값으로 맞춘다.
  const floorSafe = Math.min(Math.max(1, floor), floors);
  const unitSafe = units.includes(unit) ? unit : units[0];
  const trade = TRADE_OPTIONS.find((x) => x.id === tradeId) || NEUTRAL;
  const link = building ? buildUnitDeepLink(building.id, floorSafe, unitSafe, trade.id) : "";
  const placeText = building ? `${building.name} ${floorSafe}층 ${unitSafe}호` : "";

  useEffect(() => {
    if (!link) {
      setQrUrl("");
      return undefined;
    }
    let alive = true;
    setQrUrl("");
    setQrError(false);
    QRCode.toDataURL(link, { width: 480, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((url) => alive && setQrUrl(url))
      .catch(() => alive && setQrError(true));
    return () => {
      alive = false;
    };
  }, [link]);

  if (!building) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-500" data-testid="qrgen-empty">
        <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300" aria-hidden="true" />
        먼저 '2. 동.호수 생성' 탭에서 동을 등록해주세요.
        {onGoBuildings && (
          <div className="mt-4">
            <button type="button" onClick={onGoBuildings} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition">
              동.호수 생성으로 가기
            </button>
          </div>
        )}
      </div>
    );
  }

  function download() {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `QR_${building.name}_${floorSafe}층_${unitSafe}호${trade.id ? `_${trade.name.replace(/[\\/]/g, "")}` : ""}.png`;
    a.click();
    if (notify) notify(`${placeText} QR 이미지를 저장했습니다.`);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      if (notify) notify("QR 링크를 복사했습니다.");
    } catch {
      if (notify) notify("복사하지 못했습니다. 링크를 길게 눌러 직접 복사해주세요.");
    }
  }

  function testAsSubcontractor() {
    // 진짜로 스캔한 것과 같은 주소를 새 탭으로 연다: 로그인 없이 그 호실의 음성 검측 화면이 뜬다.
    window.open(link, "_blank", "noopener");
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="qrgen">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:hidden">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 pb-2 border-b border-slate-100">
          <Tag className="w-4 h-4 text-blue-600" aria-hidden="true" /> 현장 부착용 QR 라벨 생성기
        </h3>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="qrgen-building">
            동 선택
          </label>
          <select id="qrgen-building" data-testid="qrgen-building" className={FIELD} value={building.id} onChange={(e) => setBuildingId(e.target.value)}>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="qrgen-floor">
              층수
            </label>
            <select id="qrgen-floor" data-testid="qrgen-floor" className={FIELD} value={floorSafe} onChange={(e) => setFloor(Number(e.target.value))}>
              {Array.from({ length: floors }, (_, i) => i + 1).map((f) => (
                <option key={f} value={f}>
                  {f}층
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="qrgen-unit">
              호수
            </label>
            <select id="qrgen-unit" data-testid="qrgen-unit" className={FIELD} value={unitSafe} onChange={(e) => setUnit(e.target.value)}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}호
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="qrgen-trade">
            공종 (전용 컬러 매핑)
          </label>
          <select id="qrgen-trade" data-testid="qrgen-trade" className={`${FIELD} font-semibold`} value={trade.id} onChange={(e) => setTradeId(e.target.value)}>
            {TRADE_OPTIONS.map((x) => (
              <option key={x.id || "none"} value={x.id}>
                {x.name} ({x.colorName} {x.color})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
            공종을 고르면 스캔한 반장님 화면에 그 공종이 미리 선택됩니다. 호실만 쓰려면 '공종 지정 안 함'을 고르세요.
          </p>
        </div>

        <button
          type="button"
          data-testid="qrgen-download"
          onClick={download}
          disabled={!qrUrl}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition active:scale-95"
        >
          <Download className="w-4 h-4" aria-hidden="true" /> QR 이미지 저장 (PNG)
        </button>
      </div>

      <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
        <p className="text-xs text-slate-400 font-semibold mb-4 print:hidden">현장 벽체 부착용 규격 스티커 미리보기</p>

        <div
          id="printable-qr-sticker"
          data-testid="qrgen-sticker"
          data-link={link}
          className="w-72 bg-white border-4 rounded-2xl p-4 shadow-xl text-center transition-all"
          style={{ borderColor: trade.color }}
        >
          <div
            className="text-white py-1.5 px-3 rounded-lg font-bold text-sm flex items-center justify-between shadow-sm"
            style={{ backgroundColor: trade.color }}
            data-testid="qrgen-sticker-head"
          >
            <span data-testid="qrgen-sticker-trade">{trade.id ? trade.name : "호실 QR"}</span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">{building.name}</span>
          </div>

          <div className="my-4 flex items-center justify-center p-2 bg-white rounded-lg min-h-[140px]">
            {qrError ? (
              <span className="text-xs text-rose-600">QR 생성에 실패했습니다.</span>
            ) : qrUrl ? (
              <img src={qrUrl} alt={`${placeText} QR코드`} className="w-44 h-44" data-testid="qrgen-img" />
            ) : (
              <span className="text-xs text-slate-400">생성 중…</span>
            )}
          </div>

          <div className="border-t border-slate-200 pt-2">
            <h4 className="text-xl font-black text-slate-900 tracking-tight" data-testid="qrgen-sticker-place">
              {placeText}
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">스마트폰 카메라로 스캔 시 즉시 음성기록</p>
          </div>
        </div>

        <p className="mt-4 max-w-md text-center text-[10px] font-mono text-slate-400 break-all print:hidden" data-testid="qrgen-link">
          {link}
        </p>

        <div className="flex flex-wrap justify-center gap-2 mt-5 print:hidden">
          <button
            type="button"
            data-testid="qrgen-print"
            onClick={() => window.print()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition"
          >
            <Printer className="w-4 h-4" aria-hidden="true" /> 라벨지 인쇄
          </button>
          <button
            type="button"
            data-testid="qrgen-copy"
            onClick={copyLink}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
          >
            <LinkIcon className="w-4 h-4" aria-hidden="true" /> 링크 복사
          </button>
          <button
            type="button"
            data-testid="qrgen-test"
            onClick={testAsSubcontractor}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition"
          >
            <Smartphone className="w-4 h-4" aria-hidden="true" /> 반장님 모드로 바로 테스트
          </button>
        </div>
      </div>
    </div>
  );
}
