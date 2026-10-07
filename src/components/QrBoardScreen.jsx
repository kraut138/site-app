import React, { useCallback, useEffect, useState } from "react";
import { LanguageProvider, useLanguage } from "../LanguageContext.jsx";
import { LANGUAGES, DEFAULT_LANGUAGE } from "../i18n.js";
import * as api from "../api.js";
import QrComposer from "./QrComposer.jsx";
import QrEntryList from "./QrEntryList.jsx";

/**
 * 관리자가 만든 QR 코드를 스캔했을 때 열리는 독립된 모바일 화면(로그인·사이드바 없음).
 * 메모·사진·음성을 남기고, 같은 QR에 남겨진 다른 사람의 기록도 볼 수 있다.
 * 스캔하는 사람이 외국인 근로자일 수 있어 이 화면에서만 언어를 바로 고를 수 있다(계정과 무관, 이 기기에 기억).
 */

const LANG_KEY = "qrBoardLang";

function initialLanguage() {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    // 저장된 언어를 못 읽으면 아래의 기기 언어 설정을 따른다.
  }
  const nav = ((typeof navigator !== "undefined" && navigator.language) || "").toLowerCase();
  const hit = LANGUAGES.find((l) => nav.startsWith(l.code));
  return hit ? hit.code : DEFAULT_LANGUAGE;
}

function Board({ qrId, lang, onChangeLang }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("loading"); // loading | ready | notfound | error
  const [code, setCode] = useState(null);
  const [entries, setEntries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent) => {
      if (silent) setRefreshing(true);
      else setStatus("loading");
      try {
        const board = await api.fetchQrBoard(qrId);
        if (!board.code) {
          setStatus("notfound");
        } else {
          setCode(board.code);
          setEntries(board.entries);
          setStatus("ready");
        }
      } catch {
        if (!silent) setStatus("error");
      } finally {
        setRefreshing(false);
      }
    },
    [qrId]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  async function handleSubmit(data) {
    const created = await api.createQrEntry({ qrId, ...data });
    setEntries((prev) => [created, ...prev]);
    return created;
  }

  return (
    <div className="qr-screen" data-testid="qr-board">
      <div className="qr-screen-header">
        <div className="qr-board-topline">
          <span className="qr-screen-brand">{t("app.brand")}</span>
          <div className="qr-lang" role="group" aria-label="Language">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                className={`qr-lang-btn${lang === l.code ? " active" : ""}`}
                onClick={() => onChangeLang(l.code)}
                data-testid={`qr-lang-${l.code}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        {status === "ready" && code && (
          <>
            <div className="qr-screen-title" data-testid="qr-board-title">
              {code.title}
            </div>
            {code.note ? <div className="qr-board-note">{code.note}</div> : null}
          </>
        )}
      </div>

      <div className="qr-screen-body">
        {status === "loading" && (
          <div className="card card-pad qr-center" data-testid="qr-board-loading">
            {t("qr.board.loading")}
          </div>
        )}
        {status === "notfound" && (
          <div className="card card-pad qr-center" data-testid="qr-board-notfound">
            {t("qr.board.notFound")}
          </div>
        )}
        {status === "error" && (
          <div className="card card-pad qr-center" data-testid="qr-board-error">
            <div>{t("qr.board.loadError")}</div>
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => load(false)}>
              {t("qr.board.retry")}
            </button>
          </div>
        )}
        {status === "ready" && (
          <>
            <QrComposer onSubmit={handleSubmit} />
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <div className="section-head qr-list-head">
                <div className="section-title" data-testid="qr-list-title">
                  {t("qr.list.title", { n: entries.length })}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => load(true)} disabled={refreshing} data-testid="qr-refresh">
                  {t("qr.list.refresh")}
                </button>
              </div>
              <QrEntryList entries={entries} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function QrBoardScreen({ qrId }) {
  const [lang, setLang] = useState(initialLanguage);

  const changeLang = useCallback((next) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // 기억해 두지 못해도 이번 화면에서는 선택한 언어로 보인다.
    }
  }, []);

  return (
    <LanguageProvider lang={lang} onChange={changeLang}>
      <Board qrId={qrId} lang={lang} onChangeLang={changeLang} />
    </LanguageProvider>
  );
}
