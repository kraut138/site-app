import React, { useState } from "react";
import { useLanguage } from "../LanguageContext.jsx";
import { VOICE_TRADES, tradeLabelKey } from "../voice.js";
import VoiceInspection from "./VoiceInspection.jsx";

/**
 * 로그인해서 들어가는 '하도급 반장 모바일 모드'의 음성 보고 탭.
 * 공종별 QR을 스캔했을 때 열리는 화면(QrTradeScreen)과 같은 화면·같은 기능이다: 공종 이름 상자 → 마이크 위의 '작업 보고 | TBM 회의' 전환 →
 * "101동 502호 도배 완료"처럼 동·호실과 작업을 함께 말하면 말한 호실의 보고로 저장, TBM 회의는 약 5분 녹음 → 칸으로 정리 → 확인 후 서버에 저장(VoiceInspection의 tradeQr · tbm 모드).
 * QR이 공종을 정해 주던 자리만 다르다: 스캔한 QR이 없으니 맨 위의 공종 칩으로 직접 고른다(마지막으로 고른 공종은 이 기기에 기억한다).
 * 동 목록·표준 공종·등록 업체는 앱이 이미 읽어 둔 값을 받아 쓴다(QR 화면은 로그인이 없어 스스로 읽는다).
 * 말하거나 저장하는 동안, 또 TBM 회의를 녹음·저장하는 동안에는 공종을 바꾸지 못하게 잠근다. 공종을 바꾸면 음성 화면을 새로 열어 그 공종으로 시작한다.
 */

const TRADE_KEY = "voiceTradePick"; // 마지막으로 고른 공종(이 기기에 기억한다)

function readPick() {
  try {
    return window.localStorage.getItem(TRADE_KEY) || "";
  } catch {
    return "";
  }
}

function writePick(id) {
  try {
    window.localStorage.setItem(TRADE_KEY, id);
  } catch {
    // 공종을 기억해 두지 못해도 보고를 남기는 데에는 영향이 없다.
  }
}

export default function TradeVoiceScreen({ buildings, checklistItems, authorDefault = "", notify }) {
  const { t } = useLanguage();
  const [pick, setPick] = useState(readPick);
  const [busy, setBusy] = useState(false); // 말하거나 저장하는 중 · TBM 회의를 녹음하거나 저장하는 중
  // 기억해 둔 공종이 지금 없으면(관리자가 직접 추가한 공종을 지웠을 때) 첫 공종으로 시작한다.
  const tradeId = VOICE_TRADES.some((x) => x.id === pick) ? pick : VOICE_TRADES[0].id;

  function choose(id) {
    if (busy || id === tradeId) return;
    setPick(id);
    writePick(id);
  }

  return (
    <div className="trade-voice" data-testid="trade-voice-screen">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4" data-testid="trade-voice-banner">
        <div className="pb-3 border-b border-slate-100">
          <div className="vl-section-label" id="tv-picker-label">
            {t("voice.trade.label")}
          </div>
          <div className="tv-picker" role="group" aria-labelledby="tv-picker-label" data-testid="trade-voice-picker">
            {VOICE_TRADES.map((tr) => (
              <button
                key={tr.id}
                type="button"
                className={`tv-chip${tr.id === tradeId ? " is-active" : ""}`}
                style={{ "--vl": tr.color, "--vl-tint": `${tr.color}1c` }}
                aria-pressed={tr.id === tradeId}
                disabled={busy}
                onClick={() => choose(tr.id)}
                data-testid={`tv-trade-${tr.id}`}
              >
                <span className="tv-chip-dot" aria-hidden="true" />
                <span>{t(tradeLabelKey(tr.id))}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <h2 className="qr-screen-title text-2xl font-black text-slate-900 tracking-tight" data-testid="qr-trade-title">
            {t(`category.${tradeId}.name`)}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{t("qr.trade.sub")}</p>
        </div>
      </div>

      <div className="qr-screen-body" data-trade={tradeId}>
        <VoiceInspection
          key={tradeId}
          buildings={buildings}
          checklistItems={checklistItems}
          tradeQr={tradeId}
          tbm
          authorDefault={authorDefault}
          placeDescKey="voice.place.descPick"
          onBusyChange={setBusy}
          notify={notify}
        />
      </div>
    </div>
  );
}
