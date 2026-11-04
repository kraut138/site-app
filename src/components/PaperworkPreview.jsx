import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./UI.jsx";
import { renderDocxPreview } from "../paperwork/docxPreview.js";
import { renderHwpPreview } from "../paperwork/hwpPreview.js";

// "7. 서류 작성"의 미리보기 창. 내려받을 파일(양식에 글을 채운 결과)의 바이트를 그대로 읽어서 종이 모양으로 화면에 그려 보여 준다.
// 그래서 여기서 보이는 내용 = 내려받아 워드(.docx)·한글(.hwp)에서 열었을 때의 내용이다. 서버로 보내거나 새로 내려받는 것은 없다.
// 종이는 원래 크기(1쪽 = 96dpi px)로 그려 두고 화면 너비에 맞게 줄여서(transform) 보여 주며, 확대·축소 단추로 키울 수 있다(이 앱은 손가락 확대를 막아 두었다).

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.25;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

// preview: { kind: "docx" | "hwp", title, fileName, bytes, notice }
export default function PaperworkPreview({ preview, onClose, onDownload, locked = false }) {
  const [paper, setPaper] = useState(null); // { width, height }: 100% 크기의 종이(px)
  const [error, setError] = useState("");
  const [boxW, setBoxW] = useState(0);
  const [view, setView] = useState({ fit: true, zoom: 1 });
  const [saved, setSaved] = useState(false);
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const sheetRef = useRef(null);
  const hostRef = useRef(null);
  const anchorRef = useRef(null); // 확대·축소 직전에 화면 한가운데 있던 종이 위치(비율)
  const savedTimer = useRef(0);
  const act = useRef({});

  // 종이를 그려서 붙인다(파일이 바뀌면 다시)
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    try {
      const res = preview.kind === "hwp" ? renderHwpPreview(preview.bytes) : renderDocxPreview(preview.bytes);
      host.replaceChildren(res.node);
      setPaper({ width: res.width, height: Math.max(res.height, res.node.offsetHeight) });
      setError("");
    } catch (e) {
      host.replaceChildren();
      setPaper(null);
      // 한국어로 된 이유만 보여 준다(개발자용 영어 오류 글은 보여 줘도 도움이 안 된다)
      setError(e && e.message && /[가-힣]/.test(e.message) ? e.message : "파일의 모양을 읽는 중 문제가 생겼습니다.");
    }
    return () => host.replaceChildren();
  }, [preview]);

  // 종이가 들어갈 수 있는 너비(스크롤 영역 너비 − 안쪽 여백): 화면 너비에 맞추려고 잰다
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return undefined;
    const measure = () => {
      const cs = getComputedStyle(box);
      setBoxW(Math.max(0, box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)));
    };
    measure();
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(measure);
      ro.observe(box);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const fitScale = paper && boxW ? clamp(boxW / paper.width, ZOOM_MIN, 1) : 1;
  const scale = view.fit ? fitScale : view.zoom;

  // 크기를 바꾸면 보고 있던 자리(화면 한가운데)가 그대로 가운데에 오도록 스크롤을 맞춘다
  useLayoutEffect(() => {
    const a = anchorRef.current;
    const box = scrollRef.current;
    const sheet = sheetRef.current;
    if (!a || !box || !sheet || !paper) return;
    anchorRef.current = null;
    box.scrollLeft = sheet.offsetLeft + a.fx * paper.width * scale - box.clientWidth / 2;
    box.scrollTop = sheet.offsetTop + a.fy * paper.height * scale - box.clientHeight / 2;
  }, [scale, paper]);

  const rememberCenter = () => {
    const box = scrollRef.current;
    const sheet = sheetRef.current;
    if (!box || !sheet || !paper) return;
    const w = paper.width * scale;
    const h = paper.height * scale;
    anchorRef.current = {
      fx: clamp((box.scrollLeft + box.clientWidth / 2 - sheet.offsetLeft) / w, 0, 1),
      fy: clamp((box.scrollTop + box.clientHeight / 2 - sheet.offsetTop) / h, 0, 1),
    };
  };
  const zoomTo = (next) => {
    const z = clamp(next, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(z - scale) < 0.001) return;
    rememberCenter();
    setView({ fit: false, zoom: z });
  };
  const zoomIn = () => zoomTo(scale * ZOOM_STEP);
  const zoomOut = () => zoomTo(scale / ZOOM_STEP);
  const zoomFit = () => {
    if (view.fit) return;
    rememberCenter();
    setView({ fit: true, zoom: 1 });
  };
  act.current = { onClose, zoomIn, zoomOut, zoomFit };

  // 키보드: Esc 닫기, + − 0 크기, Tab은 이 창 안에서만 돈다. 창이 떠 있는 동안 뒤 화면은 스크롤하지 않는다.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        act.current.onClose();
        return;
      }
      if (e.key === "Tab") {
        const root = rootRef.current;
        if (!root) return;
        const items = Array.from(root.querySelectorAll('button:not([disabled]), [tabindex="0"]'));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const cur = document.activeElement;
        if (!root.contains(cur)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && cur === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && cur === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") act.current.zoomIn();
      else if (e.key === "-" || e.key === "_") act.current.zoomOut();
      else if (e.key === "0") act.current.zoomFit();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const box = scrollRef.current;
    if (box) box.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const download = () => {
    onDownload(preview);
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2500);
  };

  const viewer = preview.kind === "hwp" ? "한글" : "워드";
  const sheetStyle = paper ? { width: paper.width * scale, height: paper.height * scale } : { display: "none" };
  const hostStyle = paper ? { width: paper.width, transform: `scale(${scale})` } : undefined;

  return createPortal(
    <div ref={rootRef} className="pwv-overlay" role="dialog" aria-modal="true" aria-label={`${preview.title} 미리보기`} data-testid="pwv-overlay">
      <div className="pwv-bar">
        <div className="pwv-bar-title">
          <div className="pwv-title" data-testid="pwv-title">
            {preview.title} 미리보기
          </div>
          <div className="pwv-sub" data-testid="pwv-file">
            {preview.fileName}
          </div>
        </div>
        <div className="pwv-zoom" role="group" aria-label="확대·축소">
          <button type="button" className="pwv-zbtn" onClick={zoomOut} disabled={!paper || scale <= ZOOM_MIN + 0.001} aria-label="작게" data-testid="pwv-zoom-out">
            −
          </button>
          <span className="pwv-zlabel" data-testid="pwv-zoom-label">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" className="pwv-zbtn" onClick={zoomIn} disabled={!paper || scale >= ZOOM_MAX - 0.001} aria-label="크게" data-testid="pwv-zoom-in">
            +
          </button>
          <button type="button" className="pwv-zfit" onClick={zoomFit} disabled={!paper || view.fit} data-testid="pwv-zoom-fit">
            화면에 맞춤
          </button>
        </div>
        <button type="button" className="btn btn-primary btn-sm pwv-dl" onClick={download} disabled={locked} data-testid="pwv-download">
          {saved ? <Icon.Check width="14" height="14" /> : <Icon.Download width="14" height="14" />}
          {saved ? "내려받았어요" : "받기"}
        </button>
        <button type="button" className="pwv-close" onClick={onClose} aria-label="닫기" data-testid="pwv-close">
          <Icon.Close width="18" height="18" />
        </button>
      </div>
      {preview.notice ? (
        <div className="pwv-notice" data-testid="pwv-notice">
          {preview.notice}
        </div>
      ) : null}
      <div ref={scrollRef} className="pwv-scroll" tabIndex={0} aria-label="서류 미리보기 내용" aria-busy={!paper && !error} data-testid="pwv-scroll">
        {error ? (
          <div className="pwv-error" role="alert" data-testid="pwv-error">
            <div className="pwv-error-title">미리보기를 그리지 못했어요</div>
            <div className="pwv-error-text">{error}</div>
            <div className="pwv-error-text">위의 「받기」로 파일은 내려받을 수 있어요. 내려받은 파일을 {viewer}에서 열어 확인해 주세요.</div>
          </div>
        ) : null}
        <div ref={sheetRef} className="pwv-sheet" style={sheetStyle} data-testid="pwv-sheet">
          <div ref={hostRef} className="pwv-host" style={hostStyle} data-testid="pwv-paper-host" />
        </div>
      </div>
      <div className="pwv-foot">화면용 미리보기예요. 글꼴·줄 나눔은 {viewer}에서 열었을 때와 조금 다를 수 있어요.</div>
    </div>,
    document.body
  );
}
