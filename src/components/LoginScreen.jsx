import React, { useState } from "react";
import { signUp, logIn } from "../auth.js";

// 배경 일러스트는 기존 역할선택 화면 것을 그대로 재사용한다(styles.css의 .role-select-* 클래스도 공용).
function SiteIllustration() {
  const windows = (x, y, w, h, cols, rows, color) => {
    const cells = [];
    const padX = w * 0.14;
    const padY = h * 0.06;
    const cw = (w - padX * 2) / cols;
    const ch = (h - padY * 2) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push(<rect key={`${r}-${c}`} x={x + padX + c * cw + cw * 0.18} y={y + padY + r * ch + ch * 0.18} width={cw * 0.64} height={ch * 0.64} fill={color} />);
      }
    }
    return cells;
  };
  return (
    <svg viewBox="0 0 1600 800" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c3d6e3" />
          <stop offset="100%" stopColor="#e9eef0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1600" height="800" fill="url(#skyGrad2)" />
      <rect x="0" y="650" width="1600" height="150" fill="#dbe2df" />
      <g fill="#a9bdcb" opacity="0.55">
        <rect x="40" y="560" width="60" height="90" />
        <rect x="980" y="580" width="70" height="70" />
        <rect x="1310" y="530" width="55" height="120" />
        <rect x="1460" y="585" width="65" height="65" />
        <rect x="1130" y="600" width="50" height="50" />
      </g>
      <rect x="140" y="390" width="190" height="260" fill="#4a6d8f" />
      {windows(140, 390, 190, 260, 4, 6, "#c3d6e3")}
      <rect x="1000" y="420" width="150" height="230" fill="#3d5f80" />
      {windows(1000, 420, 150, 230, 3, 5, "#c3d6e3")}
      <rect x="1230" y="470" width="130" height="180" fill="#5c86a8" />
      {windows(1230, 470, 130, 180, 3, 4, "#dbe6ee")}
      <g>
        <rect x="430" y="180" width="190" height="470" fill="#eef1ef" fillOpacity="0.35" stroke="#17456f" strokeWidth="4" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1="430" y1={180 + ((i + 1) * 470) / 10} x2="620" y2={180 + ((i + 1) * 470) / 10} stroke="#17456f" strokeWidth="2.5" opacity="0.75" />
        ))}
        <line x1="480" y1="180" x2="480" y2="650" stroke="#17456f" strokeWidth="2" opacity="0.5" />
        <line x1="570" y1="180" x2="570" y2="650" stroke="#17456f" strokeWidth="2" opacity="0.5" />
      </g>
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
      <line x1="0" y1="652" x2="1600" y2="652" stroke="#17456f" strokeWidth="3" strokeDasharray="18 12" opacity="0.35" />
    </svg>
  );
}

export default function LoginScreen({ onSignedUp }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [directorCode, setDirectorCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next) {
    setMode(next);
    setError("");
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await logIn({ email: email.trim(), password });
      // 로그인 성공 시 App.jsx가 인증 상태 변화를 구독하고 있어 자동으로 다음 화면으로 넘어간다.
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const profile = await signUp({ email: email.trim(), password, name: name.trim(), directorCode: directorCode.trim() });
      // 가입 직후에는 App.jsx의 인증 상태 구독이 Firestore에서 프로필을 다시 읽어오는 시점과
      // 방금 만든 프로필 저장이 완료되는 시점이 미묘하게 어긋날 수 있어(레이스 컨디션),
      // 방금 만든 결과를 바로 넘겨서 확실하게 반영되도록 한다.
      if (onSignedUp) onSignedUp(profile);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

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
        <p>{mode === "login" ? "로그인하고 시작하세요" : "새 계정을 만드세요"}</p>

        <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="auth-form">
          <div className="field">
            <label>아이디 (이메일)</label>
            <input className="input" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label>비밀번호</label>
            <input className="input" type="password" placeholder="6자 이상" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>

          {mode === "signup" && (
            <>
              <div className="field">
                <label>비밀번호 확인</label>
                <input className="input" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="field">
                <label>이름 (선택)</label>
                <input className="input" placeholder="예: 김현장" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>소장 가입 코드 (해당하는 경우만)</label>
                <input className="input" placeholder="감리단/소장이시면 입력하세요" value={directorCode} onChange={(e) => setDirectorCode(e.target.value)} />
              </div>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>

        <div className="role-select-hint">
          {mode === "login" ? (
            <>
              계정이 없으신가요?{" "}
              <button type="button" className="auth-link" onClick={() => switchMode("signup")}>
                회원가입
              </button>
            </>
          ) : (
            <>
              이미 계정이 있으신가요?{" "}
              <button type="button" className="auth-link" onClick={() => switchMode("login")}>
                로그인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
