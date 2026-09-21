import React, { createContext, useContext, useMemo } from "react";
import { translate, DEFAULT_LANGUAGE } from "./i18n.js";

const LanguageContext = createContext({
  lang: DEFAULT_LANGUAGE,
  setLang: () => {},
  t: (key) => key,
});

// lang: 현재 언어 코드. onChange: 언어를 바꿀 때 호출(App.jsx가 계정 프로필에 저장하는 로직을 여기 연결한다).
export function LanguageProvider({ lang, onChange, children }) {
  const value = useMemo(
    () => ({
      lang,
      setLang: onChange,
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, onChange]
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
