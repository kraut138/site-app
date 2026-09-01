import React from "react";
import { ROLES } from "../data.js";
import { Icon } from "./UI.jsx";

const OPTIONS = [
  {
    role: ROLES.SUB,
    startView: "operations",
    title: "하도급사",
    desc: "공사 확인 요청 제출, NCR 조치 진행",
    accent: "#3f9169",
    accentBg: "#12362a",
    Icon: Icon.Inspection,
  },
  {
    role: ROLES.SUPER,
    startView: "operations",
    title: "감리단 / 소장",
    desc: "전체 현황 관리, 검측 승인·반려, 동 관리",
    accent: "#3e7cb1",
    accentBg: "#0f3252",
    Icon: Icon.Dashboard,
  },
];

export default function RoleSelect({ onSelect }) {
  return (
    <div className="role-select-screen">
      <div className="role-select-bg" aria-hidden="true">
        <SiteIllustration />
      </div>
      <div className="role-select-scrim" aria-hidden="true" />
      <div className="role-select-card">
        <div className="role-select-logo">
          <img src={`${import.meta.env.BASE_URL}logo-kwangwoon.png`} alt="광운건설" />
        </div>
        <h1>현장검측</h1>
        <p>어떤 역할로 접속하시나요?</p>

        <div className="role-select-options">
          {OPTIONS.map((opt) => (
            <button key={opt.role} className="role-select-option" style={{ "--opt-accent": opt.accent, "--opt-accent-bg": opt.accentBg }} onClick={() => onSelect(opt.role, opt.startView)}>
              <span className="role-select-option-icon">
                <opt.Icon width="22" height="22" />
              </span>
              <span className="role-select-option-text">
                <span className="role-select-option-title">{opt.title}</span>
                <span className="role-select-option-desc">{opt.desc}</span>
              </span>
              <Icon.ChevronRight width="18" height="18" className="role-select-option-chevron" />
            </button>
          ))}
        </div>

        <div className="role-select-hint">선택한 역할은 화면 왼쪽 하단에서 언제든 바꿀 수 있습니다.</div>
      </div>
    </div>
  );
}

// 실제 현장 사진 대신, 저작권 걱정 없는 자체 제작 블루프린트 톤 현장 일러스트(스카이라인 + 타워크레인)
function SiteIllustration() {
  const windows = (x, y, w, h, cols, rows, color) => {
    const cells = [];
    const padX = w * 0.14;
    const padY = h * 0.06;
    const cw = (w - padX * 2) / cols;
    const ch = (h - padY * 2) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push(
          <rect
            key={`${r}-${c}`}
            x={x + padX + c * cw + cw * 0.18}
            y={y + padY + r * ch + ch * 0.18}
            width={cw * 0.64}
            height={ch * 0.64}
            fill={color}
          />
        );
      }
    }
    return cells;
  };

  return (
    <svg viewBox="0 0 1600 800" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c3d6e3" />
          <stop offset="100%" stopColor="#e9eef0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1600" height="800" fill="url(#skyGrad)" />
      <rect x="0" y="650" width="1600" height="150" fill="#dbe2df" />

      {/* distant background buildings */}
      <g fill="#a9bdcb" opacity="0.55">
        <rect x="40" y="560" width="60" height="90" />
        <rect x="980" y="580" width="70" height="70" />
        <rect x="1310" y="530" width="55" height="120" />
        <rect x="1460" y="585" width="65" height="65" />
        <rect x="1130" y="600" width="50" height="50" />
      </g>

      {/* completed building A (left) */}
      <rect x="140" y="390" width="190" height="260" fill="#4a6d8f" />
      {windows(140, 390, 190, 260, 4, 6, "#c3d6e3")}

      {/* completed building C (right-mid) */}
      <rect x="1000" y="420" width="150" height="230" fill="#3d5f80" />
      {windows(1000, 420, 150, 230, 3, 5, "#c3d6e3")}

      {/* completed building D (far right) */}
      <rect x="1230" y="470" width="130" height="180" fill="#5c86a8" />
      {windows(1230, 470, 130, 180, 3, 4, "#dbe6ee")}

      {/* under-construction building B (center, tallest) - wireframe, not solid */}
      <g>
        <rect x="430" y="180" width="190" height="470" fill="#eef1ef" fillOpacity="0.35" stroke="#17456f" strokeWidth="4" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1="430" y1={180 + ((i + 1) * 470) / 10} x2="620" y2={180 + ((i + 1) * 470) / 10} stroke="#17456f" strokeWidth="2.5" opacity="0.75" />
        ))}
        <line x1="480" y1="180" x2="480" y2="650" stroke="#17456f" strokeWidth="2" opacity="0.5" />
        <line x1="570" y1="180" x2="570" y2="650" stroke="#17456f" strokeWidth="2" opacity="0.5" />
      </g>

      {/* tower crane */}
      <g stroke="#0f3252" strokeWidth="6" fill="none" strokeLinecap="round">
        <line x1="524" y1="650" x2="524" y2="95" />
        <line x1="524" y1="95" x2="900" y2="108" />
        <line x1="524" y1="95" x2="415" y2="108" />
        <line x1="524" y1="95" x2="700" y2="112" strokeWidth="3" opacity="0.8" />
        <line x1="524" y1="95" x2="480" y2="112" strokeWidth="3" opacity="0.8" />
        <line x1="760" y1="110" x2="760" y2="260" strokeWidth="3" />
      </g>
      <rect x="392" y="100" width="34" height="24" fill="#0f3252" />
      <rect x="742" y="258" width="36" height="26" fill="#0f3252" opacity="0.9" />

      {/* ground safety line */}
      <line x1="0" y1="652" x2="1600" y2="652" stroke="#17456f" strokeWidth="3" strokeDasharray="18 12" opacity="0.35" />
    </svg>
  );
}
