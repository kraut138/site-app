import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./UI.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { formatDuration } from "../qr.js";
import { loadVoiceAudio } from "../voiceAudio.js";
import { speakerOf } from "../speakerIntro.js";

// 음성 기록 카드 아래에 붙는 두 가지: ① 말한 사람(말한 글 맨 앞의 "OOO 소속 OOO"에서 읽은 소속·이름) ② 실제로 녹음된 소리 듣기.
// 음성 검측 화면의 목록·방금 저장한 결과, 관리자 화면(호실 정보·음성요청 내역·대시보드 피드)이 함께 쓴다.
// prefix는 화면마다 달라지는 data-testid의 머리말이다("vl-speaker" 등).

function PlayIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

// 말한 사람 한 줄: "말한 사람  홍길동 · 대한건설"
export function SpeakerLine({ speaker, prefix = "vl" }) {
  const { t } = useLanguage();
  if (!speaker || !speaker.name) return null;
  return (
    <div className="vl-speaker" data-testid={`${prefix}-speaker`}>
      <Icon.Worker width="14" height="14" />
      <span className="vl-speaker-label">{t("voice.speaker.label")}</span>
      <strong className="vl-speaker-name" data-testid={`${prefix}-speaker-name`}>
        {speaker.name}
      </strong>
      {speaker.company && (
        <span className="vl-speaker-co" data-testid={`${prefix}-speaker-company`}>
          · {speaker.company}
        </span>
      )}
    </div>
  );
}

// 녹음 듣기: 처음에는 버튼만 보이고(목록에는 소리가 없다), 누르면 그 소리를 한 번 읽어 와 재생기를 보여 준다.
// 재생 버튼은 브라우저 기본 재생기에 맡긴다(자동재생이 막힌 기기에서도 눌러서 들을 수 있도록).
export function VoiceAudioPlayer({ reportId, sec = 0, prefix = "vl" }) {
  const { t } = useLanguage();
  const [state, setState] = useState({ status: "idle", src: "" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // 다른 기록으로 바뀌면(목록이 다시 그려질 때 같은 자리의 부품이 재사용될 수 있다) 불러온 소리를 버린다
  useEffect(() => {
    setState({ status: "idle", src: "" });
  }, [reportId]);

  async function load() {
    setState({ status: "loading", src: "" });
    try {
      const media = await loadVoiceAudio(reportId);
      if (!alive.current) return;
      if (!media || !media.audio) throw new Error("no audio");
      setState({ status: "ready", src: media.audio });
    } catch {
      if (alive.current) setState({ status: "error", src: "" });
    }
  }

  if (state.status === "ready") {
    return <audio className="vl-audio" controls autoPlay src={state.src} data-testid={`${prefix}-audio`} />;
  }
  const loading = state.status === "loading";
  return (
    <span className="vl-audio-wrap">
      <button type="button" className="vl-audio-btn" onClick={load} disabled={loading} data-testid={`${prefix}-audio-load`}>
        <PlayIcon width="13" height="13" />
        {loading ? t("voice.audio.loading") : sec > 0 ? t("voice.audio.listen", { time: formatDuration(sec) }) : t("voice.audio.listenPlain")}
      </button>
      {state.status === "error" && (
        <span className="vl-audio-error" role="alert" data-testid={`${prefix}-audio-error`}>
          {t("voice.audio.loadError")}
        </span>
      )}
    </span>
  );
}

// 음성 기록 하나의 "말한 사람 + 녹음 듣기" 줄. 둘 다 없으면 아무것도 그리지 않는다.
export function VoiceRecordMeta({ report, prefix = "vl" }) {
  if (!report) return null;
  const speaker = speakerOf(report);
  const hasAudio = report.hasAudio === true && !!report.id;
  if (!speaker && !hasAudio) return null;
  return (
    <div className="vl-meta" data-testid={`${prefix}-meta`}>
      <SpeakerLine speaker={speaker} prefix={prefix} />
      {hasAudio && <VoiceAudioPlayer reportId={report.id} sec={report.audioSec} prefix={prefix} />}
    </div>
  );
}
