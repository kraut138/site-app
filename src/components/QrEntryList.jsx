import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./UI.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { formatDateTime } from "../data.js";
import { formatDuration } from "../qr.js";
import { loadQrMedia } from "../qrMedia.js";

// QR에 남겨진 기록 목록. 스캔 화면(누구나 보기)과 관리자 탭(삭제 가능)에서 함께 쓴다.
// 목록에는 작은 미리보기만 들어 있고, 사진을 크게 보거나 음성을 재생할 때만 원본을 불러온다.
// onDelete를 넘기면 각 기록에 삭제 버튼이 생긴다(관리자 탭 전용).

const PAGE_SIZE = 20;

function AudioPlayer({ entry }) {
  const { t } = useLanguage();
  const [state, setState] = useState({ status: "idle", src: "" });

  async function load() {
    setState({ status: "loading", src: "" });
    try {
      const media = await loadQrMedia(entry.id);
      if (!media || !media.audio) throw new Error("no audio");
      setState({ status: "ready", src: media.audio });
    } catch {
      setState({ status: "error", src: "" });
    }
  }

  if (state.status === "ready") {
    // 재생 버튼은 브라우저 기본 플레이어에 맡긴다(자동재생이 막힌 기기에서도 눌러서 들을 수 있도록).
    return <audio className="qr-audio" controls autoPlay src={state.src} data-testid="qr-audio" />;
  }
  return (
    <div className="qr-audio-wrap">
      <button type="button" className="qr-audio-btn" onClick={load} disabled={state.status === "loading"} data-testid="qr-audio-load">
        <Icon.Mic width="15" height="15" />
        {state.status === "loading"
          ? t("qr.list.audioLoading")
          : entry.audioSec > 0
            ? t("qr.list.audio", { time: formatDuration(entry.audioSec) })
            : t("qr.list.audioPlain")}
      </button>
      {state.status === "error" && <span className="qr-media-error">{t("qr.list.mediaError")}</span>}
    </div>
  );
}

function Lightbox({ entry, onClose }) {
  const { t } = useLanguage();
  const [full, setFull] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadQrMedia(entry.id)
      .then((media) => {
        if (!alive) return;
        if (media && media.image) setFull(media.image);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [entry.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="qr-lightbox" onClick={onClose} role="dialog" aria-modal="true" data-testid="qr-lightbox">
      <button type="button" className="qr-lightbox-close" onClick={onClose} aria-label={t("qr.list.close")}>
        <Icon.Close width="18" height="18" />
      </button>
      {(full || entry.thumb) && (
        <img className={`qr-lightbox-img${full ? "" : " is-loading"}`} src={full || entry.thumb} alt="" data-testid="qr-lightbox-img" data-full={full ? "1" : "0"} />
      )}
      {!full && !failed && <div className="qr-lightbox-msg">{t("qr.list.photoLoading")}</div>}
      {failed && <div className="qr-lightbox-msg">{t("qr.list.mediaError")}</div>}
    </div>,
    document.body
  );
}

function EntryCard({ entry, onDelete, onOpenImage }) {
  const { t } = useLanguage();
  return (
    <article className="qr-entry" data-testid="qr-entry">
      <header className="qr-entry-head">
        <span className="qr-entry-author">{entry.author || t("qr.list.anonymous")}</span>
        <span className="qr-entry-time">{formatDateTime(entry.createdAt)}</span>
        {onDelete && (
          <button
            type="button"
            className="btn btn-ghost btn-sm qr-entry-del"
            onClick={() => onDelete(entry)}
            aria-label={t("qr.list.delete")}
            data-testid="qr-entry-delete"
          >
            <Icon.Trash width="14" height="14" />
          </button>
        )}
      </header>
      {entry.text ? <p className="qr-entry-text">{entry.text}</p> : null}
      {(entry.hasImage || entry.hasAudio) && (
        <div className="qr-entry-media">
          {entry.hasImage && (
            <button type="button" className="qr-entry-thumb" onClick={() => onOpenImage(entry)} aria-label={t("qr.list.photoOpen")} data-testid="qr-entry-thumb">
              {entry.thumb ? <img src={entry.thumb} alt="" /> : <Icon.Camera width="22" height="22" />}
            </button>
          )}
          {entry.hasAudio && <AudioPlayer entry={entry} />}
        </div>
      )}
    </article>
  );
}

export default function QrEntryList({ entries, onDelete }) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [lightbox, setLightbox] = useState(null);

  if (entries.length === 0) {
    return (
      <div className="qr-empty" data-testid="qr-empty">
        {t("qr.list.empty")}
      </div>
    );
  }
  return (
    <div className="qr-entries" data-testid="qr-entries">
      {entries.slice(0, visible).map((entry) => (
        <EntryCard key={entry.id} entry={entry} onDelete={onDelete} onOpenImage={setLightbox} />
      ))}
      {entries.length > visible && (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setVisible((v) => v + PAGE_SIZE)} data-testid="qr-more">
          {t("qr.list.more")}
        </button>
      )}
      {lightbox && <Lightbox entry={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
