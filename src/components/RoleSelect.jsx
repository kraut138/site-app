import React from "react";
import { ROLES } from "../data.js";
import { Icon } from "./UI.jsx";

const OPTIONS = [
  {
    role: ROLES.SUB,
    startView: "checklist",
    title: "하도급사",
    desc: "체크리스트 확인, 검측 요청 제출, NCR 조치 진행",
    accent: "#3f9169",
    accentBg: "#12362a",
    Icon: Icon.Inspection,
  },
  {
    role: ROLES.SUPER,
    startView: "dashboard",
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
      <div className="role-select-card">
        <div className="role-select-logo">
          <img src="/logo-kwangwoon.png" alt="광운건설" />
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
