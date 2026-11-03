import React, { useCallback, useEffect, useRef, useState } from "react";
import { QrCode, MapPin } from "lucide-react";
import { LanguageProvider, useLanguage } from "../LanguageContext.jsx";
import { useQrLanguage, QrLangSwitch } from "./QrLanguage.jsx";
import BrandFrame from "../platform/BrandFrame.jsx";
import { getCategory } from "../data.js";
import { Toast } from "./UI.jsx";
import VoiceInspection from "./VoiceInspection.jsx";
import * as api from "../api.js";

/**
 * 공종별 QR(?trade=frame|finish|mep)을 스캔했을 때 열리는 독립된 모바일 화면(로그인·사이드바 없음).
 * 공종은 QR이 정해 주고, 위치는 고르지 않는다. "101동 502호 도배 완료"처럼 동·호실과 작업을 함께 말하면
 * 말한 글에서 동·층·호실을 읽어 그 호실의 보고로 저장하고, '완료'라고 말한 항목은 골구도와 서류 작성에 쓰인다(VoiceInspection의 tradeQr 모드).
 * 이 화면에는 동 목록과 표준 공종 항목만 읽어 온다(검측·NCR 같은 다른 데이터는 읽지 않는다).
 * 스캔하는 사람이 외국인 근로자일 수 있어 화면 위쪽에서 언어를 바로 고를 수 있다(QrLanguage.jsx).
 */

function Body({ tradeId, lang, onChangeLang }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [site, setSite] = useState({ buildings: [], checklistItems: [] });
  const [toast, setToast] = useState("");
  const notify = useCallback((msg) => setToast(msg), []);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await api.fetchSiteCore();
      if (!alive.current) return;
      setSite({ buildings: data.buildings || [], checklistItems: data.checklistItems || [] });
      setStatus("ready");
    } catch {
      if (alive.current) setStatus("error");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const trade = getCategory(tradeId);
  const tradeName = t(`category.${tradeId}.name`);

  return (
    <BrandFrame narrow testId="qr-trade-screen" rootClass="qr-screen" right={<QrLangSwitch lang={lang} onChange={onChangeLang} />}>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4" data-testid="qr-location-banner">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full text-white shadow-sm"
            style={{ backgroundColor: trade ? trade.color : "#475569" }}
            data-testid="qr-trade-badge"
          >
            <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
            {t("qr.trade.badge")}
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
            <MapPin className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
            {t("qr.trade.recognized")}
          </span>
        </div>
        <div className="mt-3">
          <h2 className="qr-screen-title text-2xl font-black text-slate-900 tracking-tight" data-testid="qr-trade-title">
            {tradeName}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{t("qr.trade.sub")}</p>
        </div>
      </div>

      <div className="qr-screen-body">
        {status === "loading" && (
          <div className="card card-pad qr-center" data-testid="qr-trade-loading">
            {t("qr.board.loading")}
          </div>
        )}
        {status === "error" && (
          <div className="card card-pad qr-center" data-testid="qr-trade-error">
            <div>{t("qr.trade.loadError")}</div>
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={load} data-testid="qr-trade-retry">
              {t("qr.board.retry")}
            </button>
          </div>
        )}
        {status === "ready" && <VoiceInspection buildings={site.buildings} checklistItems={site.checklistItems} tradeQr={tradeId} notify={notify} />}
      </div>

      <Toast message={toast} onDone={() => setToast("")} />
    </BrandFrame>
  );
}

export default function QrTradeScreen({ tradeId }) {
  const [lang, changeLang] = useQrLanguage();

  return (
    <LanguageProvider lang={lang} onChange={changeLang}>
      <Body tradeId={tradeId} lang={lang} onChangeLang={changeLang} />
    </LanguageProvider>
  );
}
