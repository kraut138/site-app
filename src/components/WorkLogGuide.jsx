import React from "react";
import { WORKLOG_PARTS } from "../workLogInfo.js";

// 작업일보에 필요한 말 네 가지(업체명·금일 작업인원·위치·작업내용)를 예문 한 문장으로 보여 주는 카드.
// 말하는 글(예문)은 음성 인식이 한국어라 한국어로 고정하고, 이름표와 안내만 화면 언어로 보여 준다.
// example: workLogExample()이 만든 { parts, text }, placeFromScreen: 위치를 이 화면(QR·고른 위치)이 정해 주면 true
export function WorkLogGuide({ t, example, placeFromScreen = false }) {
  const parts = example.parts;
  return (
    <div className="vl-wl" data-testid="vl-worklog">
      <div className="vl-wl-title" data-testid="vl-worklog-title">
        {t("voice.worklog.title")}
      </div>
      <p className="vl-wl-example" lang="ko" data-testid="vl-worklog-example">
        “
        {WORKLOG_PARTS.filter((k) => parts[k]).map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 ? " " : ""}
            <span className="vl-wl-seg" data-part={k}>
              <b className="vl-wl-no" aria-hidden="true">
                {WORKLOG_PARTS.indexOf(k) + 1}
              </b>
              {parts[k]}
            </span>
          </React.Fragment>
        ))}
        ”
      </p>
      <ul className="vl-wl-legend" data-testid="vl-worklog-legend">
        {WORKLOG_PARTS.map((k, i) => (
          <li key={k} data-part={k}>
            <b className="vl-wl-no">{i + 1}</b>
            <span>{t(`voice.worklog.part.${k}`)}</span>
          </li>
        ))}
      </ul>
      <p className="vl-wl-note" data-testid="vl-worklog-note">
        {t("voice.worklog.replace")}
        {placeFromScreen ? ` ${t("voice.worklog.placeScreen")}` : ""}
      </p>
    </div>
  );
}

// 말한 글에서 작업일보에 필요한 말이 빠졌을 때 알려 주는 상자.
//   variant "saved": 기록은 저장됐고 정보만 모자란 경우(다시 말하면 새 기록이 하나 더 저장된다는 것도 알려 준다)
//   variant "also":  위치를 못 읽어 저장하지 못한 경우(위치와 함께 이 정보도 말해 달라고 한다)
// missing: ["company" | "headcount" | "work"] (빠진 것만), example: workLogExample()이 만든 값
export function WorkLogMissing({ t, missing, example, variant = "saved" }) {
  const list = Array.isArray(missing) ? missing : [];
  if (list.length === 0) return null;
  const also = variant === "also";
  const eg = (k) => String((example && example.parts && example.parts[k]) || "").replace(/[.,]$/, "");
  return (
    <div className={`vl-missing is-${variant}`} role="alert" data-testid="vl-missing" data-variant={variant}>
      <div className="vl-missing-title">{t(also ? "voice.worklog.alsoTitle" : "voice.worklog.missingTitle")}</div>
      {!also && <div className="vl-missing-lead">{t("voice.worklog.missingLead")}</div>}
      <ul className="vl-missing-list">
        {list.map((k) => (
          <li key={k} data-testid={`vl-missing-${k}`} data-part={k}>
            <strong>{t(`voice.worklog.part.${k}`)}</strong>
            <span className="vl-missing-eg" lang="ko">
              {t("voice.worklog.eg", { text: eg(k) })}
            </span>
          </li>
        ))}
      </ul>
      {!also && <p className="vl-missing-foot">{t("voice.worklog.missingFoot")}</p>}
    </div>
  );
}
