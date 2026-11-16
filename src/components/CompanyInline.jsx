import React from "react";
import { useLanguage } from "../LanguageContext.jsx";

// 검측 · NCR · 표준 공종 화면에 보이는 담당 업체 한 줄: [담당 업체] 한빛도배, 삼호 인테리어 외 1곳
// list: 등록한 업체 목록([{ name, ... }]). 비어 있으면 아무것도 그리지 않는다. all이면 줄이지 않고 모두 적는다.
// (업체 이름은 등록한 글 그대로 보이고, '담당 업체' 같은 안내 글만 번역한다)
export default function CompanyInline({ list, show = 2, all = false, testId = "co-inline" }) {
  const { t } = useLanguage();
  if (!Array.isArray(list) || list.length === 0) return null;
  const names = list.map((c) => c.name);
  const text = all || names.length <= show ? names.join(", ") : t("company.more", { names: names.slice(0, show).join(", "), n: names.length - show });
  return (
    <span className="co-inline" data-testid={testId}>
      <span className="co-inline-label">{t("company.label")}</span>
      <span className="co-inline-names">{text}</span>
    </span>
  );
}
