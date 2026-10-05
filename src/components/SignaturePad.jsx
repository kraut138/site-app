import React, { useRef, useEffect, useState } from "react";
import { useLanguage } from "../LanguageContext.jsx";

// 손글씨 서명 패드. 마우스·터치·펜 모두 지원한다.
// 서명이 있으면 "획이 있는 부분만 잘라낸" PNG 데이터 URL을 onChange로 넘기고, 지우면 null을 넘긴다.
// (여백까지 통째로 줄여 넣으면 서식의 좁은 서명 칸에서 너무 작게 보이기 때문)
export default function SignaturePad({ onChange }) {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const bounds = useRef(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#10151a";
    ctx.fillStyle = "#10151a";
  }, []);

  function pos(e) {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  }

  function grow(p) {
    const b = bounds.current;
    bounds.current = b
      ? { minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }
      : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  }

  function exportCropped() {
    const c = canvasRef.current;
    const b = bounds.current;
    const pad = 8;
    const x0 = Math.max(0, Math.floor(b.minX - pad));
    const y0 = Math.max(0, Math.floor(b.minY - pad));
    const x1 = Math.min(c.width, Math.ceil(b.maxX + pad));
    const y1 = Math.min(c.height, Math.ceil(b.maxY + pad));
    const out = document.createElement("canvas");
    out.width = Math.max(1, x1 - x0);
    out.height = Math.max(1, y1 - y0);
    out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function down(e) {
    e.preventDefault();
    if (canvasRef.current.setPointerCapture) canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    grow(last.current);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function move(e) {
    if (!drawing.current) return;
    const p = pos(e);
    grow(p);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    onChange(exportCropped());
  }

  function clear() {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    bounds.current = null;
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className="sigpad">
      <canvas
        ref={canvasRef}
        width={600}
        height={220}
        className="sigpad-canvas"
        data-testid="sigpad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="sigpad-foot">
        <span className="sigpad-hint">{hasInk ? "" : t("doc.padHint")}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear} data-testid="sigpad-clear">
          {t("doc.padClear")}
        </button>
      </div>
    </div>
  );
}
