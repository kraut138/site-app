import { useCallback, useState } from "react";
import { LANGUAGES, DEFAULT_LANGUAGE } from "../i18n.js";

// 로그인 없이 QR로 들어온 화면(QR 기록판, 공종별 QR 화면)이 함께 쓰는 언어 고르기.
// 스캔하는 사람이 외국인 근로자일 수 있어 이 화면들에서는 언어를 바로 고를 수 있다(계정과 무관, 이 기기에 기억).
// 처음에는 이 기기에 기억해 둔 언어, 없으면 기기의 언어 설정을 따른다(두 화면이 같은 값을 쓰므로 한 곳에서 고르면 다른 쪽에도 적용된다).

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

// 반환: [현재 언어, 언어를 바꾸는 함수]
export function useQrLanguage() {
  const [lang, setLang] = useState(initialLanguage);
  const changeLang = useCallback((next) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // 기억해 두지 못해도 이번 화면에서는 선택한 언어로 보인다.
    }
  }, []);
  return [lang, changeLang];
}

// 화면 위쪽 띠에 놓는 언어 버튼들
export function QrLangSwitch({ lang, onChange }) {
  return (
    <div className="qr-lang flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700" role="group" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`qr-lang-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all${
            lang === l.code ? " active bg-blue-600 text-white shadow" : " text-slate-400 hover:text-white"
          }`}
          onClick={() => onChange(l.code)}
          data-testid={`qr-lang-${l.code}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
