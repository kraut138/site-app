import React, { useState } from "react";
import { signUp, logIn } from "../auth.js";
import { useLanguage } from "../LanguageContext.jsx";
import BrandFrame from "../platform/BrandFrame.jsx";

export default function LoginScreen({ onSignedUp }) {
  const { t } = useLanguage();
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
    <BrandFrame center>
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8" data-testid="login-card">
        <div className="text-center mb-5">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">{t("login.title")}</h2>
          <p className="text-xs text-slate-500 mt-1">{mode === "login" ? t("login.subtitleLogin") : t("login.subtitleSignup")}</p>
        </div>

        <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="auth-form">
          <div className="field">
            <label>{t("login.id")}</label>
            <input className="input" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label>{t("login.password")}</label>
            <input className="input" type="password" placeholder="6자 이상" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>

          {mode === "signup" && (
            <>
              <div className="field">
                <label>{t("login.passwordConfirm")}</label>
                <input className="input" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="field">
                <label>{t("login.name")}</label>
                <input className="input" placeholder="예: 김현장" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("login.directorCode")}</label>
                <input className="input" placeholder={t("login.directorCodePlaceholder")} value={directorCode} onChange={(e) => setDirectorCode(e.target.value)} />
              </div>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? t("login.processing") : mode === "login" ? t("login.submitLogin") : t("login.submitSignup")}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-slate-500">
          {mode === "login" ? (
            <>
              {t("login.noAccount")}{" "}
              <button type="button" className="auth-link" onClick={() => switchMode("signup")}>
                {t("login.submitSignup")}
              </button>
            </>
          ) : (
            <>
              {t("login.hasAccount")}{" "}
              <button type="button" className="auth-link" onClick={() => switchMode("login")}>
                {t("login.submitLogin")}
              </button>
            </>
          )}
        </div>
      </div>
    </BrandFrame>
  );
}
