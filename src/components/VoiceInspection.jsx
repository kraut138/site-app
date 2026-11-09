import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, EmptyState } from "./UI.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { formatDateTime, getCategory, itemsForCategory } from "../data.js";
import { QR_LIMITS, formatDuration } from "../qr.js";
import * as api from "../api.js";
import {
  VOICE_TRADES,
  VOICE_LIMITS,
  ELEM_SUGGESTIONS,
  getTrade,
  findTrade,
  tradeLabelKey,
  convertVoiceText,
  convertedText,
  buildSummary,
  getSpeechRecognition,
  floorChoices,
  buildZone,
} from "../voice.js";
import { convertVoiceTextSpaced } from "../spacing.js";
import { getGlossaryTerms, getGlossaryOnlyDb, getGlossaryFuzzy, getGlossaryPending, refreshGlossary } from "../glossaryStore.js";
import { analyzeReport, hasEffect, doneItemIdsOf } from "../unitProgress.js";
import { resolveSpokenPlace, resolveSpokenAddress, spokenExample } from "../spokenUnit.js";
import { parseSpeakerIntro } from "../speakerIntro.js";
import { canRecordAudio, canShareMicWithRecognition, startVoiceCapture, primeVoiceAudio, audioNoteKey } from "../voiceAudio.js";
import { SpeakerLine, VoiceAudioPlayer, VoiceRecordMeta } from "./VoiceAudio.jsx";

// "음성 검측" (시안 index.html의 기능). 두 곳에서 쓴다.
//  1) 하도급사 전용 "음성 검측" 탭: 공종(관리자 '표준 공종' 탭의 분류 + 그 아래 세부 공종)을 고르고 위치(동·층·부재)를 정한 뒤 마이크로 말한다.
//  2) 호실 QR 스캔 화면(unit 속성을 줄 때): 위치(동·층·호)는 QR이 이미 정해 주므로 고르지 않고, 로그인이 없으니 이름은 직접 적는다(선택).
//  3) 공종별 QR 스캔 화면(tradeQr 속성을 줄 때): 공종은 QR이 정해 주고, 위치는 고르지 않는다. "101동 502호 도배 완료"처럼 동·호실과 작업을 함께 말하면 말한 글에서 동·층·호실을 읽어
//     그 호실의 보고로 저장한다(spokenUnit.js resolveSpokenAddress). 동·층·호실을 분명하게 말하지 않았으면 저장하지 않고 이유와 말하는 방법을 알려 준다.
//     '완료'라고 말한 항목은 보고와 함께 그 호실의 '음성 완료'에도 기록해, 골구도에 완료로 보인다(api.js unitVoiceDone).
// 말하면 → 음성 인식 → 인식된 글자를 바로 화면에 보여 주고 → 현장 은어를 표준 용어로 바꿔(관리자 "용어 DB" 탭의 표대로) → 공종별 요약 문장을 만들어 → 저장한다.
// 관리자가 '용어 DB에 있는 단어만 남기기'를 켜 두었으면(기본) 바꾼 문장에는 표에 있는 단어만 남고 나머지 말은 빠진다("나라시 시마이 했어요" → "고르기 마무리").
// 음성이 잘못 들려 표에 없는 말이 되었을 때("나라씨 씨마이")는 '비슷한 용어 찾기'(기본 켜짐)가 소리(자모)를 견주는 레벤슈타인 거리로 표의 가장 비슷한 단어를 골라 그 단어로 남긴다(fuzzyTerms.js).
// 결과 상자에는 그렇게 찾아 바꾼 말과 비슷한 정도(%)를 알려 준다 - 저장하는 값은 아니고, 말한 그대로(rawText)는 늘 함께 남는다.
// 호실·공종 진행도를 읽는 계산은 빠진 말("301호", "도배 완료" 등)이 필요하므로 은어만 바꾼 전체 문장(normalized)을 따로 저장해 그 글을 읽는다.
// 호실 QR 화면에서 "102동 502호 도배 완료"처럼 다른 호실을 분명하게 말하면, 그 보고는 말한 호실의 기록(동·층·호실을 말한 곳으로 바꿔)으로 저장한다(spokenUnit.js).
// 그러면 그 호실의 '음성 기록'과 진행도에 그대로 쌓이고, 어느 화면에서 말했는지는 fromUnit에 남는다. 호실을 애매하게 말했거나 이 현장에 없는 곳이면 옮기지 않고 이 호실의 기록으로만 저장하며 이유를 알려 준다.
// 음성 인식이 안 되는 기기(앱 안의 브라우저 등)를 위해 직접 입력으로도 같은 과정을 거치게 했다.
// 말한 글 맨 앞(또는 끝)에 "OOO(협력업체) 소속 OOO(이름)"을 말하면 그 소속·이름을 읽어 음성 기록 아래에 "말한 사람"으로 보여 준다(speakerIntro.js).
// 소개 말은 은어 변환·호실 읽기·진행도 계산에서는 빼고(회사 이름이 작업 내용으로 읽히지 않게), 말한 그대로의 글(rawText)에는 남긴다. 소개 말만 하고 작업 내용이 없으면 저장하지 않고 안내한다.
// 말하는 동안 마이크로 소리도 함께 녹음해(voiceAudio.js) 글 기록을 저장한 뒤 따로 저장한다 - 그래서 음성 기록에서 실제 말한 소리를 다시 들을 수 있다.
// 소리는 곁들이는 것이라, 녹음이 안 되거나 비어 있어도 글 기록은 그대로 저장되고 이유만 알려 준다. 일부 휴대폰은 음성 인식과 녹음을 함께 못 하므로 기기마다 끌 수 있다(기본 켜짐).
// PC의 Chrome·Edge(135 이상)는 음성 인식이 마이크 소리(트랙)를 넘겨받을 수 있어서, 마이크를 한 번만 열고 그 소리를 인식과 녹음이 함께 쓴다(shareMic · voiceAudio.js canShareMicWithRecognition).
// 휴대폰 브라우저는 아직 그 기능이 없어 마이크를 따로 열므로, 기기에 따라 서로 방해할 수 있다(안드로이드는 화면이 위에 있는 앱만 소리를 받고 다른 앱은 무음을 받는다).
// 화면 문구는 하도급사가 외국인 근로자일 수 있어 번역 사전(voice.*)을 쓴다. 저장되는 발화 원문·요약은 말한 그대로(한국어)다.

const STORAGE_KEY = "voiceInspectionSelection";
const UNIT_STORAGE_KEY = "voiceUnitSelection"; // 호실 QR 화면에서는 공종(과 세부 공종)만 기억한다(탭의 위치 선택과 섞이지 않게 따로 둔다)
const AUTHOR_KEY = "qrBoardAuthor"; // QR 기록판과 같은 키 - 한 번 적은 이름을 두 화면에서 함께 쓴다
// 하도급 반장 모바일 모드에서는 '내 목소리도 녹음해 저장'을 쓰지 않는다: 휴대폰은 음성 인식과 녹음이 마이크를 함께 쓰지 못해 인식이 안 되는 경우가 있었다.
// false이면 목소리를 녹음하지 않고(글 기록만 저장) 이 선택 칸도 보이지 않는다. 관리자 포털의 '공사 확인 음성요청 내역'에서 듣는 기능은 이미 저장된 녹음에 그대로 쓰인다.
// 다시 켜려면 true로 바꾸면 된다.
const AUDIO_CAPTURE_ENABLED = false;
const KEEP_AUDIO_KEY = "voiceKeepAudio"; // "내 목소리도 녹음해 저장" 선택(이 기기에 기억한다, 기본 켜짐). "off"일 때만 끈 것.
const PAGE_SIZE = 20;
const UNIT_PAGE_SIZE = 3; // 호실 화면은 길어지지 않도록 처음에는 최근 3건만 보여 준다
const UNIT_PAGE_STEP = 10;
// 공종별 QR 화면에서 말한 글로 호실을 정하지 못했을 때(그 말은 저장하지 않는다) 알려 주는 말의 번역 키
const PLACE_FAIL_KEY = { none: "voice.place.none", partial: "voice.place.partial", multiple: "voice.place.multiple", unknown: "voice.place.unknown" };
const GLOSSARY_WAIT_MS = 2000; // 용어 표를 새로 읽는 중에 말이 끝났을 때, 최신 표를 위해 기다려 주는 최대 시간

function readSaved(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeSaved(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 선택을 기억해 두지 못해도 보고를 남기는 데에는 영향이 없다.
  }
}

function readKeepAudio() {
  try {
    return window.localStorage.getItem(KEEP_AUDIO_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeKeepAudio(on) {
  try {
    window.localStorage.setItem(KEEP_AUDIO_KEY, on ? "on" : "off");
  } catch {
    // 선택을 기억해 두지 못해도 보고를 남기는 데에는 영향이 없다.
  }
}

function readAuthor() {
  try {
    return window.localStorage.getItem(AUTHOR_KEY) || "";
  } catch {
    return "";
  }
}

function writeAuthor(value) {
  try {
    window.localStorage.setItem(AUTHOR_KEY, value);
  } catch {
    // 이름을 기억해 두지 못해도 보고를 남기는 데에는 영향이 없다.
  }
}

// 음성 인식이 돌려주는 오류 코드를 안내 문구 키로 바꾼다. "aborted"(우리가 멈춘 경우)는 안내가 필요 없다.
function errorKey(code) {
  if (code === "not-allowed" || code === "service-not-allowed") return "voice.err.permission";
  if (code === "no-speech") return "voice.err.noSpeech";
  if (code === "audio-capture") return "voice.err.noMic";
  if (code === "network") return "voice.err.network";
  if (code === "aborted") return null;
  return "voice.err.generic";
}

// 은어가 표준 용어로 바뀐 문장을 보여 준다: 바뀐 부분은 강조하고, 마우스를 올리면(title) 원래 말한 낱말이 보인다.
// 비슷한 소리로 찾아 바꾼 부분(p.near)은 점선 밑줄로 달리 보여 준다.
function NormalizedText({ parts }) {
  return parts.map((p, i) =>
    p.from !== undefined ? (
      <mark key={i} className={`vl-mark${p.near ? " vl-mark--near" : ""}`} title={p.from}>
        {p.text}
      </mark>
    ) : (
      <React.Fragment key={i}>{p.text}</React.Fragment>
    )
  );
}

// 방금 저장한 보고가 호실 진행도에 어떻게 반영됐는지 알려 준다.
// 반영된 항목이 있으면 항목별 상태를, 반영하지 못했으면 이유(호실을 모름·여러 호실 등)와 다시 말하는 방법을 보여 준다.
const NO_UNIT_KEY = { none: "voice.progress.noUnit", location: "voice.progress.noUnit", multiple: "voice.progress.multiUnit", conflict: "voice.progress.conflict" };

function phraseList(list) {
  const shown = list.slice(0, 3).map((x) => `“${x.phrase}”`);
  return shown.join(", ") + (list.length > 3 ? " …" : "");
}

// place: 말한 글에서 읽은 호실({ kind: "other" | "unknown" | "partial" | "multiple", place }) - 이 현장에 없는 곳이거나 애매하게 말했으면(옮겨 저장하지 못했으면) 그 이유를 먼저 알려 준다.
// (호실이 여럿이라는 안내는 반영할 항목이 있었을 때만 한다 - 반영할 항목이 없으면 그 말을 먼저 알려 준다)
const PLACE_KEY = { unknown: "voice.progress.noSuchPlace", partial: "voice.progress.partialPlace", multiple: "voice.progress.multiUnit" };

// 반영할 항목 목록을 만들지 못한 경우(표준 공종 항목을 못 읽었을 때)에도 호실 안내는 해야 하므로 비어 있는 분석 결과를 쓴다
const NO_PROGRESS = { resolved: { ok: false, reason: "none" }, analysis: { items: [], categories: [], ambiguous: [], skipped: [] } };

function ProgressNote({ progress, unitLabel, place, t, golgu = false }) {
  const { resolved, analysis } = progress || NO_PROGRESS;
  const effect = hasEffect(analysis);
  const placeKey = place && PLACE_KEY[place.kind] && (place.kind !== "multiple" || effect) ? PLACE_KEY[place.kind] : null;
  return (
    <div className="vl-progress" data-testid="vl-progress">
      <div className="vl-result-sep" />
      <h4 className="vl-progress-title">{t("voice.progress.title")}</h4>
      {placeKey ? (
        <div className="vl-progress-msg is-warn" data-testid="vl-progress-msg">
          {t(placeKey, { place: place.place || "" })}
        </div>
      ) : effect && resolved.ok ? (
        <>
          <div className="vl-progress-msg is-ok" data-testid="vl-progress-msg">
            {t("voice.progress.applied", { unit: unitLabel })}
          </div>
          {golgu && (
            <div className="vl-progress-msg is-ok" data-testid="vl-golgu">
              {t("voice.place.golgu")}
            </div>
          )}
          <ul className="vl-progress-list">
            {analysis.categories.map((c) => (
              <li key={`c-${c.categoryId}`} className="vl-progress-chip is-done" data-testid="vl-progress-item">
                <span>{t("voice.progress.category", { name: (getCategory(c.categoryId) || {}).name || c.categoryId })}</span>
              </li>
            ))}
            {analysis.items.map((i) => (
              <li key={i.itemId} className={`vl-progress-chip ${i.state === "done" ? "is-done" : "is-doing"}`} data-testid="vl-progress-item">
                <span>{i.text}</span>
                <b>{i.state === "done" ? t("voice.progress.done") : t("voice.progress.doing", { n: i.percent })}</b>
              </li>
            ))}
          </ul>
        </>
      ) : effect ? (
        <div className="vl-progress-msg is-warn" data-testid="vl-progress-msg">
          {t(NO_UNIT_KEY[resolved.reason] || "voice.progress.noUnit")}
        </div>
      ) : (
        <div className="vl-progress-msg" data-testid="vl-progress-msg">
          {t("voice.progress.none")}
        </div>
      )}
      {analysis.ambiguous.length > 0 && (
        <div className="vl-progress-note" data-testid="vl-progress-ambiguous">
          {t("voice.progress.ambiguous", { list: phraseList(analysis.ambiguous) })}
        </div>
      )}
      {analysis.skipped.length > 0 && (
        <div className="vl-progress-note" data-testid="vl-progress-skipped">
          {t("voice.progress.skipped", { list: phraseList(analysis.skipped) })}
        </div>
      )}
    </div>
  );
}

// props: buildings, userName(로그인한 계정 이름), notify,
//        unit: { buildingId, floor, unit } - 호실 QR 화면에서만 준다. 주면 위치가 이 호실로 고정되고 이름을 직접 입력받는다.
//        allBuildings: 현장의 모든 동 - 호실 QR 화면에서 다른 동의 호실을 말했을 때 그 동을 찾는 데 쓴다(buildings에는 이 호실의 동만 넘기므로 따로 받는다. 안 주면 buildings).
//        checklistItems: 표준 공종의 세부 항목 목록 - ① 세부 공종 선택 칸의 선택지, ② 말한 내용에서 "도배 완료" 같은 진행 상황을 읽어 호실 진행도에 반영할 때 쓴다(없으면 둘 다 하지 않는다).
//        initialTrade: 예전 호실 QR의 공종(?t=)으로 들어왔을 때 미리 골라 둘 공종(frame·finish·mep). 없으면 지난번에 고른 공종.
//        tradeQr: 공종별 QR(?trade=)로 들어왔을 때의 공종(frame·finish·mep). 주면 공종이 이 공종으로 고정되고, 위치(동·층·호실)는 말한 글에서 읽는다. 이름은 직접 적는다(선택).
//                 이때 buildings는 현장의 모든 동이다(말한 동을 찾는 데 쓴다).
//        compact: 좁은 한 줄 칸(모바일 모드)에 맞춰 호실 QR 화면과 같은 한 줄 배치로 보여 준다.
export default function VoiceInspection({ buildings, allBuildings = null, userName, notify, unit = null, checklistItems = [], initialTrade = "", tradeQr = "", compact = false }) {
  const { t } = useLanguage();
  const unitMode = !!unit;
  const placeMode = !unitMode && VOICE_TRADES.some((x) => x.id === tradeQr); // 공종별 QR 화면: 위치는 말한 글에서 읽는다
  const compactFeed = unitMode || placeMode; // 좁은 화면 배치(처음에는 최근 몇 건만)
  const unitFloor = unitMode ? Number(unit.floor) : 0;
  const unitName = unitMode ? String(unit.unit).trim().slice(0, 30) : ""; // 호수(너무 긴 값은 잘라 쓴다)
  const unitLabel = unitName ? `${unitName}호` : ""; // 부재 칸에 저장되는 값(저장 내용은 한국어 고정). 호수가 비어 있으면 위치를 정할 수 없어 녹음이 잠긴다.
  const [initial] = useState(() => (placeMode ? {} : readSaved(unitMode ? UNIT_STORAGE_KEY : STORAGE_KEY)));
  // initialTrade: "공종별 QR 생성소"에서 만든 QR로 들어왔을 때 그 QR에 담긴 공종(frame·finish·mep). 있으면 지난번에 고른 공종보다 우선한다.
  const qrTrade = placeMode ? tradeQr : VOICE_TRADES.some((x) => x.id === initialTrade) ? initialTrade : "";
  const [tradeId, setTradeId] = useState(() => (qrTrade ? qrTrade : VOICE_TRADES.some((x) => x.id === initial.tradeId) ? initial.tradeId : VOICE_TRADES[0].id));
  // QR의 공종이 지난번 공종과 다르면 지난번에 골라 둔 세부 공종은 이번 공종의 항목이 아니므로 비워 둔다.
  const [tradeItem, setTradeItem] = useState(() =>
    typeof initial.tradeItem === "string" && !(qrTrade && qrTrade !== initial.tradeId) ? initial.tradeItem.slice(0, VOICE_LIMITS.tradeItem) : ""
  );
  const [buildingId, setBuildingId] = useState(() => (buildings.some((b) => b.id === initial.buildingId) ? initial.buildingId : ""));
  const [floor, setFloor] = useState(() => (Number.isInteger(initial.floor) && initial.floor !== 0 ? initial.floor : 1));
  const [elem, setElem] = useState(() => (typeof initial.elem === "string" ? initial.elem.slice(0, VOICE_LIMITS.elem) : ""));
  const [authorName, setAuthorName] = useState(() => (unitMode || placeMode ? readAuthor().slice(0, QR_LIMITS.authorMax) : ""));

  const [supported] = useState(() => !!getSpeechRecognition());
  const [status, setStatus] = useState("idle"); // idle | listening | stopping | saving
  const [message, setMessage] = useState(null); // { kind: "error" | "ok", key }
  const [result, setResult] = useState(null); // 방금 보낸 보고 { id, rawText, summary, ..., state: saving | saved | error }
  const [showText, setShowText] = useState(!supported);
  const [textValue, setTextValue] = useState("");

  const audioOk = AUDIO_CAPTURE_ENABLED && canRecordAudio(); // 이 기기(브라우저)에서 목소리를 함께 녹음할 수 있는지
  const [keepAudio, setKeepAudio] = useState(() => readKeepAudio());
  const [audioHint, setAudioHint] = useState(false); // 음성 인식이 계속 안 될 때 '녹음 저장 끄기'를 권하는 안내
  // 이 브라우저가 음성 인식에 마이크 소리를 넘겨받을 수 있는지(PC의 Chrome·Edge 135 이상). 그러면 마이크를 한 번만 열어 인식과 녹음이 같은 소리를 나눠 쓴다.
  const [shareMic] = useState(() => canShareMicWithRecognition());

  const [reports, setReports] = useState([]);
  const [feedState, setFeedState] = useState("loading"); // loading | ready | error
  const [visible, setVisible] = useState(compactFeed ? UNIT_PAGE_SIZE : PAGE_SIZE);

  // 선택한 값들로 위치를 계산한다. 저장해 둔 동이 없어졌거나 층이 그 동에 없으면 안전한 값으로 대체한다.
  // 호실 QR 화면에서는 QR이 정한 동·층·호를 그대로 쓴다(층 값이 이상하면 위치를 만들지 않아 녹음이 잠긴다).
  const trade = getTrade(tradeId);
  // 세부 공종 선택지: 관리자 '표준 공종' 탭의 이 분류 항목을 그 탭의 순서 그대로. 기억해 둔 항목이 지금 목록에 없으면(관리자가 지웠거나 목록을 못 읽었으면) 고르지 않은 것으로 본다.
  const tradeItems = itemsForCategory(checklistItems, trade.id);
  const itemValue = tradeItems.some((i) => i.text === tradeItem) ? tradeItem : "";
  const building = placeMode ? null : unitMode ? buildings.find((b) => b.id === unit.buildingId) || null : buildings.find((b) => b.id === buildingId) || buildings[0] || null;
  const floors = building ? floorChoices(building.floors) : [];
  const unitFloorOk = Number.isInteger(unitFloor) && unitFloor !== 0;
  const activeFloor = unitMode ? unitFloor : floors.includes(floor) ? floor : 1;
  // 호실 화면에서 층이나 호수가 비정상이면 위치를 만들지 않는다(그러면 목록도 비어 있고 녹음도 잠긴다 - 같은 층 전체 보고가 보이는 일이 없도록).
  const zone = building && (!unitMode || (unitFloorOk && !!unitLabel)) ? buildZone(building.name, activeFloor) : "";
  const elemValue = unitMode ? unitLabel : elem;
  // 공종별 QR 화면은 위치를 말한 글에서 읽으므로, 현장에 동이 하나라도 등록되어 있으면 바로 녹음할 수 있다.
  const canRecord = placeMode ? buildings.length > 0 : !!building && !!zone && elemValue.trim().length > 0;
  // 직접 입력칸은 위치(부재 이름 등)를 정하기 전에도 글을 쓸 수 있게 열어 둔다 - 보내기만 위치를 정한 뒤에 눌린다.
  // (예전에는 위치가 정해지기 전까지 칸 자체가 잠겨 있어서, 눌러도 글이 안 써지는 고장처럼 보였다.)
  // 다만 이 화면에서 사용자가 고칠 수 없는 경우(등록된 동이 없음, 잘못된 호실 QR)에는 그대로 잠근다.
  const canType = unitMode ? canRecord : placeMode ? buildings.length > 0 : !!building;
  const busy = status !== "idle";

  // 음성 인식 이벤트 처리기는 한 번만 만들어 두므로, 최신 값은 ref로 읽는다.
  // elemFilter: 호실 화면에서는 같은 층의 보고 중 이 호실 것만 목록에 보이게 거르는 기준.
  const latest = useRef({});
  latest.current = {
    tradeId,
    tradeItem: itemValue,
    building,
    floor: activeFloor,
    elem: elemValue,
    elemFilter: unitMode ? unitLabel : "",
    userName: unitMode || placeMode ? authorName.trim() : userName,
    zone,
    t,
    notify,
    checklistItems,
    fixedUnit: unitMode ? unitName : "",
    placeMode,
    allBuildings: allBuildings || buildings,
    keepAudio: audioOk && keepAudio,
  };
  const mounted = useRef(true);
  const recRef = useRef(null);
  const gotResult = useRef(false);
  const gotError = useRef(false);
  const lastError = useRef(""); // 이번 인식에서 받은 오류 코드(없으면 "")
  const failStreak = useRef(0); // 글을 얻지 못하고 끝난 인식이 연달아 몇 번인지(녹음이 인식을 방해하는 기기인지 가늠한다)
  const captureRef = useRef(null); // 지금 하는 소리 녹음({ finish, cancel })
  const pendingStart = useRef(false); // 마이크를 나눠 쓰는 방식에서, 마이크가 열리길 기다리느라 음성 인식을 아직 시작하지 못한 동안
  const clipJobs = useRef(new Map()); // 보고 id → 소리 녹음 결과(약속). 글 저장을 다시 보낼 때도 같은 소리를 쓰려고 둔다
  const pendingClips = useRef(new Map()); // 보고 id → 아직 저장하지 못한 소리 { dataUrl, sec }(마지막 하나만)
  const resultRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingStart.current = false;
      dropCapture();
      const rec = recRef.current;
      if (rec) {
        rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
        try {
          rec.abort();
        } catch {
          // 이미 멈춘 상태면 무시
        }
      }
    };
  }, []);

  // 용어 표(관리자가 "용어 DB" 탭에서 고치는 표)는 화면이 열릴 때, 그리고 꺼 둔 화면이 다시 켜질 때 최신으로 읽어 둔다.
  // (녹음을 시작할 때와 직접 입력칸을 누를 때도 다시 읽는다 - 표를 막 고친 뒤에도 바로 그 표로 바뀌게 하려는 것)
  useEffect(() => {
    refreshGlossary();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshGlossary();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (placeMode) return; // 공종은 QR이 정하고 위치는 말한 글에서 읽으므로 기억해 둘 선택이 없다
    if (unitMode) writeSaved(UNIT_STORAGE_KEY, { tradeId, tradeItem });
    else writeSaved(STORAGE_KEY, { tradeId, tradeItem, buildingId: building ? building.id : "", floor: activeFloor, elem });
  }, [placeMode, unitMode, tradeId, tradeItem, building, activeFloor, elem]);

  useEffect(() => {
    if (unitMode || placeMode) writeAuthor(authorName.trim());
  }, [unitMode, placeMode, authorName]);

  // 말을 끝냈다고 눌렀는데 브라우저가 끝났다는 신호를 끝내 보내지 않는 경우에도 화면이 멈춰 있지 않도록 안전장치를 둔다.
  useEffect(() => {
    if (status !== "stopping") return undefined;
    const timer = setTimeout(() => {
      dropCapture();
      setStatus((s) => (s === "stopping" ? "idle" : s));
      setMessage({ kind: "error", key: "voice.err.generic" });
    }, 8000);
    return () => clearTimeout(timer);
  }, [status]);

  // ---------------- 최근 보고 목록 ----------------
  const loadReports = useCallback(async (targetZone) => {
    if (!targetZone) {
      setReports([]);
      setFeedState("ready");
      return;
    }
    setFeedState("loading");
    try {
      const list = await api.fetchVoiceReports(targetZone);
      if (!mounted.current || latest.current.zone !== targetZone) return; // 그 사이 다른 위치로 바꿨으면 버린다
      const only = latest.current.elemFilter;
      setReports(only ? list.filter((r) => r.elem === only) : list);
      setFeedState("ready");
    } catch {
      if (mounted.current && latest.current.zone === targetZone) setFeedState("error");
    }
  }, []);

  useEffect(() => {
    setVisible(compactFeed ? UNIT_PAGE_SIZE : PAGE_SIZE);
    setResult(null);
    setMessage(null);
    loadReports(zone);
  }, [zone, compactFeed, loadReports]);

  // 방금 인식된 글자가 휴대폰 화면 아래쪽(마이크 밑)에 생겨 보이지 않으면, 바로 읽을 수 있도록 필요한 만큼만 스크롤한다.
  // 새 보고가 만들어질 때(id가 바뀔 때)만 움직이고, 같은 보고를 다시 보내거나 저장 결과가 바뀔 때는 움직이지 않는다.
  const resultId = result ? result.id : "";
  useEffect(() => {
    if (!resultId) return;
    const el = resultRef.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    let calm = false;
    try {
      calm = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      calm = false;
    }
    try {
      el.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    } catch {
      el.scrollIntoView();
    }
  }, [resultId]);

  // ---------------- 소리 녹음(글 기록에 곁들인다) ----------------
  // 말하기 시작할 때 녹음을 시작하고(beginCapture), 인식이 글을 돌려주면 녹음을 마무리해 그 결과(약속)를 받는다(takeCapture).
  // 글 기록이 저장된 뒤에 소리를 따로 저장한다(saveClip) - 소리가 크거나 연결이 느려도 글 기록이 막히지 않는다.
  // onMic(track): 마이크를 나눠 쓰는 방식(shareMic)에서만 준다. 녹음용 마이크가 열리면 그 소리 트랙으로, 열지 못했으면 null로 부르고, 그때 음성 인식을 시작한다.
  function beginCapture(onMic = null) {
    dropCapture();
    if (!latest.current.keepAudio) {
      if (onMic) onMic(null);
      return;
    }
    try {
      captureRef.current = startVoiceCapture(onMic ? { onMic } : undefined);
    } catch {
      captureRef.current = null; // 소리 녹음은 곁들이는 것이라, 시작하지 못해도 글 인식은 그대로 한다
      if (onMic) onMic(null);
    }
  }

  function takeCapture() {
    const cap = captureRef.current;
    captureRef.current = null;
    return cap ? cap.finish() : null;
  }

  function dropCapture() {
    const cap = captureRef.current;
    captureRef.current = null;
    if (cap) cap.cancel();
  }

  function changeKeepAudio(on) {
    setKeepAudio(on);
    writeKeepAudio(on);
    if (!on) {
      setAudioHint(false);
      failStreak.current = 0;
      dropCapture();
    }
  }

  // 방금 보고(result)의 소리 저장 상태를 바꾼다. 그 사이 다른 보고로 바뀌었으면 건드리지 않는다.
  function patchResult(id, fields) {
    if (mounted.current) setResult((r) => (r && r.id === id ? { ...r, ...fields } : r));
  }

  async function uploadClip(id, clip) {
    pendingClips.current.clear(); // 저장하지 못한 소리는 마지막 하나만 들고 있는다
    pendingClips.current.set(id, clip);
    patchResult(id, { audio: "saving", audioReason: "" });
    try {
      await api.saveVoiceAudio(id, clip);
      pendingClips.current.delete(id);
      primeVoiceAudio(id, clip); // 방금 저장한 소리는 다시 읽지 않고 바로 들을 수 있게
      patchResult(id, { audio: "saved", audioSec: clip.sec });
      if (mounted.current) setReports((prev) => prev.map((r) => (r.id === id ? { ...r, hasAudio: true, audioSec: clip.sec } : r)));
    } catch {
      patchResult(id, { audio: "error" });
    }
  }

  // 글 기록을 저장한 뒤 부른다: 녹음 결과를 기다려, 쓸 만한 소리면 저장하고 아니면 이유를 알려 준다.
  async function saveClip(id, job) {
    patchResult(id, { audio: "saving", audioReason: "" });
    let outcome;
    try {
      outcome = await job;
    } catch {
      outcome = { ok: false, reason: "error" };
    }
    clipJobs.current.delete(id);
    if (!outcome || !outcome.ok) {
      patchResult(id, { audio: "none", audioReason: outcome ? outcome.reason : "error" });
      return;
    }
    await uploadClip(id, outcome.clip);
  }

  function retryAudio() {
    if (!result) return;
    const clip = pendingClips.current.get(result.id);
    if (clip) uploadClip(result.id, clip);
  }

  // ---------------- 보고 만들기·저장 ----------------
  async function sendReport(entry, audioJob = null) {
    if (audioJob) clipJobs.current.set(entry.id, audioJob);
    const job = audioJob || clipJobs.current.get(entry.id) || null; // 글 저장을 다시 보낼 때는 처음 녹음한 소리를 그대로 쓴다
    setResult({ ...entry, state: "saving", audio: "", audioReason: "" });
    setStatus("saving");
    setMessage(null);
    try {
      const saved = await api.createVoiceReport(entry);
      if (!mounted.current) return;
      setResult({ ...entry, state: "saved", audio: job ? "saving" : "", audioReason: "" });
      setMessage({ kind: "ok", key: "voice.status.done" });
      // 이 화면의 목록에는 이 위치(호실)의 보고만 넣는다 - 같은 층의 다른 호실로 옮겨 저장한 보고(말한 호실의 기록)는 넣지 않는다.
      const only = latest.current.elemFilter;
      // (공종별 QR 화면의 목록은 이 기기에서 방금 남긴 보고들이라, 어느 호실로 저장됐든 모두 넣는다)
      if (latest.current.placeMode || (latest.current.zone === entry.zone && (!only || entry.elem === only))) setReports((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
      latest.current.notify(latest.current.t("voice.sent"));
      if (job) saveClip(saved.id, job); // 글 기록이 저장된 뒤에 소리를 따로 저장한다(기다리지 않는다)
    } catch {
      if (!mounted.current) return;
      setResult({ ...entry, state: "error", audio: "", audioReason: "" });
      setMessage({ kind: "error", key: "voice.err.save" });
    } finally {
      if (mounted.current) setStatus("idle");
    }
  }

  // 말한(또는 입력한) 내용 하나를 보고로 만든다: 은어 변환(용어 DB 표대로) → 공종별 요약 → 저장.
  // 용어 표를 새로 읽는 중이면(녹음을 시작할 때 읽기 시작한다) 최대 2초까지 기다렸다가 최신 표로 바꾼다. 읽는 중이 아니면 기다림 없이 바로 진행한다.
  function handleTranscript(raw, via, audioJob = null) {
    const cur = latest.current;
    if (!cur.building && !cur.placeMode) return;
    const rawText = String(raw || "").trim().slice(0, VOICE_LIMITS.rawText);
    if (!rawText) {
      setStatus("idle");
      setMessage({ kind: "error", key: "voice.err.noSpeech" });
      return;
    }
    // 말한 글 맨 앞(또는 끝)의 "OOO 소속 OOO"에서 말한 사람을 읽고, 소개 말을 뗀 글로 분석한다(말한 그대로의 글은 rawText에 그대로 남는다).
    const intro = parseSpeakerIntro(rawText);
    if (intro.found && !intro.rest) {
      // 소개 말만 하고 작업 내용이 없으면 저장하지 않는다(내용 없는 기록이 쌓이지 않게). 말한 글은 입력칸에 남겨 이어서 쓸 수 있게 한다.
      setStatus("idle");
      setMessage({ kind: "error", key: "voice.speaker.only" });
      setShowText(true);
      setTextValue(rawText);
      return;
    }
    const heard = { body: intro.found ? intro.rest : rawText, speaker: intro.found ? { name: intro.name, company: intro.company } : null, audioJob };
    const pending = getGlossaryPending();
    if (!pending) {
      makeReport(cur, rawText, via, heard);
      return;
    }
    setStatus("saving");
    setMessage(null);
    let timer;
    const limit = new Promise((resolve) => {
      timer = setTimeout(resolve, GLOSSARY_WAIT_MS);
    });
    Promise.race([pending, limit]).then(() => {
      clearTimeout(timer);
      if (mounted.current) makeReport(cur, rawText, via, heard);
    });
  }

  // 공종별 QR 화면: 말한 글에서 동·층·호실을 읽어 그 호실의 보고로 저장한다. 읽지 못하면 저장하지 않고 이유를 결과 상자에 알려 준다(말한 글은 입력칸에 남겨 고쳐서 다시 보낼 수 있게 한다).
  function makePlaceReport(cur, rawText, via, fixed, heard) {
    let spoken = { kind: "none" };
    try {
      spoken = resolveSpokenAddress(fixed.normalized || heard.body, cur.allBuildings);
    } catch {
      spoken = { kind: "none" };
    }
    if (spoken.kind !== "found") {
      setResult({
        id: api.newVoiceReportId(),
        state: "noplace",
        rawText,
        parts: fixed.parts,
        replacedCount: fixed.replacedCount,
        fuzzy: fixed.fuzzy,
        failKind: spoken.kind,
        failPlace: spoken.kind === "unknown" ? spoken.place : "",
        summary: "",
        via,
      });
      setStatus("idle");
      setMessage({ kind: "error", key: PLACE_FAIL_KEY[spoken.kind] || "voice.place.none" });
      setShowText(true);
      setTextValue(rawText);
      return;
    }
    const b = spoken.building;
    const elem = `${spoken.unit}호`;
    let progress = null;
    try {
      if (Array.isArray(cur.checklistItems) && cur.checklistItems.length > 0) {
        progress = analyzeReport({ buildingId: b.id, buildingName: b.name, floor: spoken.floor, elem, normalized: fixed.normalized, rawText: heard.body }, cur.checklistItems, { fixedUnit: spoken.unit, unitsPerFloor: b.unitsPerFloor });
      }
    } catch {
      progress = null;
    }
    // 이 호실에서 '완료'라고 말한 항목: 보고와 함께 모아 두어 골구도에 완료로 보이게 한다. 호실을 확인하지 못한 경우(말한 글에 다른 호실이 섞인 경우 등)에는 모으지 않는다.
    const doneIds = progress && progress.resolved.ok ? doneItemIdsOf(progress.analysis, cur.checklistItems) : [];
    // 세부 공종은 말한 작업 중 이 공종에 속한 항목의 이름이다(서류 작성이 "마감공사 · 도배"처럼 작업 이름을 적는 데 쓴다)
    const ownItems = progress ? progress.analysis.items.filter((i) => i.categoryId === cur.tradeId).map((i) => i.text) : [];
    const tradeItem = ownItems.join("·").slice(0, VOICE_LIMITS.tradeItem);
    sendReport(
      {
        id: api.newVoiceReportId(),
        trade: cur.tradeId,
        tradeItem,
        author: cur.userName,
        buildingId: b.id,
        buildingName: b.name,
        floor: spoken.floor,
        zone: buildZone(b.name, spoken.floor),
        elem,
        place: { kind: "other", buildingName: b.name, floor: spoken.floor, unit: spoken.unit }, // 결과 상자 안내용(저장하지 않는다)
        rawText,
        normalized: fixed.normalized,
        dbText: fixed.dbText,
        ...speakerFields(heard.speaker),
        parts: fixed.parts,
        replacedCount: fixed.replacedCount,
        fuzzy: fixed.fuzzy,
        summary: buildSummary(cur.tradeId, fixed.shown, tradeItem),
        progress,
        done: doneIds.length > 0 ? { buildingId: b.id, floor: spoken.floor, unit: spoken.unit, itemIds: doneIds } : null,
        via,
      },
      heard.audioJob
    );
  }

  // 말한 사람이 있으면 보고에 함께 저장할 필드(없으면 아무것도 넣지 않는다)
  function speakerFields(speaker) {
    return speaker && speaker.name ? { speakerName: speaker.name, speakerCompany: speaker.company || "" } : {};
  }

  // heard: { body(소개 말을 뗀 분석용 글), speaker({ name, company } | null), audioJob(소리 녹음 결과 약속 | null) }
  function makeReport(cur, rawText, via, heard) {
    // 용어 DB 변환 + 음성 보정 관제의 자동 띄어쓰기: 붙여 쓴 글을 용어 DB 단어로 먼저 끊은 뒤 은어·비슷한 용어를 바꾼다(spacing.js). 호실·진행도를 읽는 글(normalized)은 말한 그대로에서 만든다.
    const fixed = convertVoiceTextSpaced(heard.body, getGlossaryTerms(), getGlossaryOnlyDb(), getGlossaryFuzzy());
    if (cur.placeMode) {
      makePlaceReport(cur, rawText, via, fixed, heard);
      return;
    }
    const hereElem = cur.elem.trim();
    // 호실 QR 화면에서 다른 호실을 분명하게 말했으면("102동 502호 도배 완료") 그 호실의 보고로 저장한다: 동·층·호실을 말한 곳으로 바꾸고, 어느 화면에서 말했는지는 fromUnit에 남긴다.
    // 애매하게 말했거나(동만, 호수만) 이 현장에 없는 곳이거나 호실이 여럿이면 옮기지 않고 이 호실의 보고로 저장한다 - 진행도에는 반영하지 않고 그 이유를 결과 상자에서 알려 준다.
    let spoken = { kind: "none" };
    if (cur.fixedUnit) {
      try {
        spoken = resolveSpokenPlace(fixed.normalized || heard.body, { buildingId: cur.building.id, floor: cur.floor, unit: cur.fixedUnit }, cur.allBuildings);
      } catch {
        spoken = { kind: "none" };
      }
    }
    const moved = spoken.kind === "other";
    const loc = moved
      ? { building: spoken.building, floor: spoken.floor, zone: buildZone(spoken.building.name, spoken.floor), elem: `${spoken.unit}호` }
      : { building: cur.building, floor: cur.floor, zone: cur.zone, elem: hereElem };
    const elem = loc.elem;
    // 바뀐 문장에서 어느 호실의 어느 항목이 완료/진행중인지 읽는다(화면에 알려 주는 용도 - 저장하는 값이 아니다).
    // 호실 정보 화면은 저장된 글에서 같은 방법으로 다시 계산하므로, 여기서 보여 주는 내용과 그쪽 결과가 같다.
    let progress = null;
    try {
      if (Array.isArray(cur.checklistItems) && cur.checklistItems.length > 0) {
        progress = analyzeReport(
          { buildingId: loc.building.id, buildingName: loc.building.name, floor: loc.floor, elem, normalized: fixed.normalized, rawText: heard.body },
          cur.checklistItems,
          { fixedUnit: moved ? spoken.unit : cur.fixedUnit, unitsPerFloor: loc.building.unitsPerFloor }
        );
      }
    } catch {
      progress = null;
    }
    sendReport(
      {
        id: api.newVoiceReportId(),
        trade: cur.tradeId,
        tradeItem: cur.tradeItem,
        author: cur.userName,
        buildingId: loc.building.id,
        buildingName: loc.building.name,
        floor: loc.floor,
        zone: loc.zone,
        elem,
        ...(moved ? { fromUnit: `${buildZone(cur.building.name, cur.floor)} ${hereElem}` } : {}), // 말한 호실로 옮겨 저장했으면 말한 화면의 호실("101동 3층 301호")
        place: spoken.kind === "none" || spoken.kind === "same" ? null : moved ? { kind: "other", buildingName: spoken.building.name, floor: spoken.floor, unit: spoken.unit } : spoken, // 말한 호실에 대한 결과 상자 안내용(저장하지 않는다)
        rawText,
        normalized: fixed.normalized, // 은어만 바꾼 전체 문장 - 진행도 계산이 읽는다
        dbText: fixed.dbText, // 용어 DB 단어만 남긴 글(그 방식이 꺼져 있으면 null이라 저장하지 않는다)
        ...speakerFields(heard.speaker), // 말한 글 맨 앞에서 읽은 말한 사람(소개 말이 없었으면 없다)
        parts: fixed.parts, // 화면에서 바뀐 부분을 강조하는 데만 쓴다(저장하지 않는다)
        replacedCount: fixed.replacedCount,
        fuzzy: fixed.fuzzy, // 비슷한 소리로 찾아 바꾼 말들 - 결과 상자에 알려 주는 용도(저장하지 않는다)
        summary: buildSummary(cur.tradeId, fixed.shown, cur.tradeItem),
        progress, // 호실 진행도에 반영된 내용(저장하지 않는다)
        // 이 호실에서 '완료'라고 말한 항목 - 보고와 함께 모아 두어 골구도에 완료로 보이게 한다(호실을 확인하지 못했으면 모으지 않는다)
        done:
          progress && progress.resolved.ok && doneItemIdsOf(progress.analysis, cur.checklistItems).length > 0
            ? { buildingId: progress.resolved.buildingId, floor: progress.resolved.floor, unit: progress.resolved.unit, itemIds: doneItemIdsOf(progress.analysis, cur.checklistItems) }
            : null,
        via,
      },
      heard.audioJob
    );
  }

  // ---------------- 음성 인식 ----------------
  function ensureRecognition() {
    if (recRef.current) return recRef.current;
    const SR = getSpeechRecognition();
    if (!SR) return null;
    const rec = new SR();
    rec.lang = "ko-KR";
    rec.continuous = false; // 한 번 말하면 끝나도록(끊김 방지)
    rec.interimResults = false;
    rec.onresult = (event) => {
      gotResult.current = true;
      const transcript = event && event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
      handleTranscript(transcript, "voice", takeCapture()); // 말이 끝났으니 소리 녹음도 마무리해 글과 함께 넘긴다
    };
    rec.onerror = (event) => {
      gotError.current = true;
      lastError.current = (event && event.error) || "";
      // 마이크를 못 잡는다는 오류(audio-capture)는 소리 녹음과 마이크를 다투는 경우일 수 있어, 녹음 저장을 끄는 방법을 알려 준다.
      if (event && event.error === "audio-capture" && latest.current.keepAudio) setAudioHint(true);
      const key = errorKey(event && event.error);
      if (key) setMessage({ kind: "error", key });
      if (event && (event.error === "not-allowed" || event.error === "service-not-allowed")) setShowText(true); // 마이크를 못 쓰면 직접 입력으로 이어갈 수 있게
    };
    rec.onend = () => {
      // 결과도 오류도 없이 끝난 경우(아무 말도 안 했거나 바로 멈춘 경우)에도 안내를 남긴다.
      if (!gotResult.current && !gotError.current) setMessage({ kind: "error", key: "voice.err.noSpeech" });
      dropCapture(); // 글을 얻지 못하고 끝났으면 녹음한 소리는 버린다(글을 얻었으면 onresult에서 이미 마무리했다)
      // 글을 얻지 못하고 끝난 인식이 연달아 두 번이면(네트워크·마이크 허용 문제가 아닐 때) 소리 녹음이 인식을 방해하는 기기일 수 있어, 녹음 저장을 끄는 방법을 알려 준다.
      if (gotResult.current) failStreak.current = 0;
      else if (latest.current.keepAudio && !["network", "not-allowed", "service-not-allowed"].includes(lastError.current)) {
        failStreak.current += 1;
        if (failStreak.current >= 2) setAudioHint(true);
      }
      setStatus((s) => (s === "listening" || s === "stopping" ? "idle" : s));
    };
    recRef.current = rec;
    return rec;
  }

  // 음성 인식을 시작한다. track(녹음과 같이 쓰는 마이크 소리)이 있으면 그 소리로 인식하고, 없으면 인식이 마이크를 직접 연다.
  // 브라우저가 트랙을 받아 주지 않아 시작하지 못하면 마이크를 직접 여는 방식으로 다시 시도한다(여기서 못 하면 던진다).
  function startOnce(rec, track) {
    if (track) {
      try {
        rec.start(track);
        return;
      } catch {
        // 아래에서 마이크를 직접 여는 방식으로 시도한다
      }
    }
    rec.start();
  }

  function startRecognition(rec, track = null) {
    try {
      startOnce(rec, track);
    } catch {
      // 이미 시작된 상태 등으로 실패하면 한 번 멈췄다가 다시 시작해 본다.
      try {
        rec.stop();
      } catch {
        // 무시
      }
      setTimeout(() => {
        if (!mounted.current) return;
        try {
          startOnce(rec, track);
        } catch {
          dropCapture();
          setStatus("idle");
          setMessage({ kind: "error", key: "voice.err.generic" });
        }
      }, 200);
    }
  }

  function toggleMic() {
    if (!canRecord) return;
    if (status === "listening") {
      // 마이크를 나눠 쓰는 방식에서 마이크가 열리길 기다리는 중이면, 인식이 아직 시작되지 않았으니 시작 자체를 취소한다.
      if (pendingStart.current) {
        pendingStart.current = false;
        dropCapture();
        setStatus("idle");
        setMessage(null);
        return;
      }
      // 말을 끝냈다는 표시 - 지금까지 들은 내용을 결과로 넘겨 달라고 요청한다.
      setStatus("stopping");
      setMessage(null);
      try {
        recRef.current && recRef.current.stop();
      } catch {
        setStatus("idle");
      }
      return;
    }
    if (status !== "idle") return;
    const rec = ensureRecognition();
    if (!rec) return;
    refreshGlossary(); // 말하는 동안 최신 용어 표를 읽어 둔다
    gotResult.current = false;
    gotError.current = false;
    lastError.current = "";
    setMessage(null);
    // 지난 보고의 '저장 완료' 결과는 새 녹음을 시작하면 치운다(저장에 실패한 결과는 다시 보내기 전까지 남겨 둔다).
    setResult((r) => (r && r.state === "saved" ? null : r));
    setStatus("listening");
    if (shareMic && latest.current.keepAudio) {
      // PC의 Chrome·Edge: 마이크를 한 번만 열어, 그 소리를 녹음과 음성 인식이 함께 쓴다(마이크를 두 번 열어 서로 방해하는 일이 없다).
      // 녹음용 마이크가 열리면 그 트랙을 넘겨 인식을 시작한다. 마이크를 못 열었으면(허용 안 함 등) 인식이 직접 마이크를 열어 안내를 받는다.
      pendingStart.current = true;
      beginCapture((track) => {
        if (!pendingStart.current || !mounted.current) return; // 마이크가 열리는 사이 취소됐다
        pendingStart.current = false;
        startRecognition(rec, track);
      });
      return;
    }
    startRecognition(rec);
    // 소리 녹음은 음성 인식을 시작한 뒤에 곁들여 시작한다(인식이 먼저 마이크를 잡게 하고, 녹음이 안 돼도 인식은 그대로 한다)
    beginCapture();
  }

  function submitText(e) {
    e.preventDefault();
    const value = textValue.trim();
    if (!canRecord || busy || !value) return;
    setTextValue("");
    handleTranscript(value, "text");
  }

  // ---------------- 화면 ----------------
  const floorText = (f) => (f < 0 ? t("voice.loc.basementOption", { n: -f }) : t("voice.loc.floorOption", { n: f }));
  const locationLabel = (r) => (r.buildingName && Number.isInteger(r.floor) && r.floor !== 0 ? `${r.buildingName} ${floorText(r.floor)}` : r.zone);

  let micLabel = t("voice.mic.idle");
  if (status === "listening") micLabel = t("voice.mic.listening");
  else if (status === "stopping" || status === "saving") micLabel = t("voice.status.sending");

  let statusText = t("voice.status.idle");
  let statusKind = "";
  if (message) {
    statusText = t(message.key);
    statusKind = message.kind;
  } else if (!canRecord) statusText = placeMode ? t("voice.loc.noBuildings") : t("voice.needLocation");
  else if (status === "listening") statusText = t("voice.status.listening");
  else if (status === "stopping" || status === "saving") statusText = t("voice.status.sending");

  const elemOptions = [...new Set([...reports.map((r) => r.elem).filter(Boolean), ...ELEM_SUGGESTIONS])];
  const shown = reports.slice(0, visible);
  const themeStyle = { "--vl": trade.color, "--vl-tint": `${trade.color}1c` };
  const unitText = unitMode ? t("voice.loc.unitOption", { n: unitName }) : "";
  const example = placeMode ? spokenExample(allBuildings || buildings, tradeId) : ""; // 공종별 QR 안내문의 말하기 예시("101동 502호 도배 완료")
  // 말한 호실로 옮겨 저장했을 때 알려 주는 "102동 5층 02호" / 지금 보고 있는 "101동 3층 301호"
  const movedLabel = (p) => `${p.buildingName} ${floorText(p.floor)} ${t("voice.loc.unitOption", { n: p.unit })}`;
  const hereLabel = building ? `${building.name} ${floorText(activeFloor)} ${unitText}` : "";

  // 로그인이 없는 QR 화면(호실 QR·공종별 QR)에서 이름을 직접 적는 칸
  const nameField = (
    <div className="field vl-name">
      <label htmlFor="vl-name">{t("qr.compose.name")}</label>
      <input
        id="vl-name"
        className="input"
        maxLength={QR_LIMITS.authorMax}
        placeholder={t("qr.compose.namePh")}
        autoComplete="name"
        value={authorName}
        disabled={busy}
        onChange={(e) => setAuthorName(e.target.value)}
        data-testid="vl-name"
      />
    </div>
  );

  return (
    <div className={`vl-page${unitMode || placeMode ? " vl-page--unit" : ""}${compact ? " vl-page--compact" : ""}`} data-testid="vl-page">
      <section className="card card-pad">
        {placeMode && (
          <div className="vl-unit-head">
            <div className="section-title">{t("nav.voice")}</div>
            <p className="vl-unit-desc">{t("voice.place.desc")}</p>
            <p className="vl-unit-desc vl-unit-hint" data-testid="vl-place-hint">
              {t("voice.place.hint", { example })}
            </p>
          </div>
        )}
        {unitMode && (
          <div className="vl-unit-head">
            <div className="section-title">{t("nav.voice")}</div>
            <p className="vl-unit-desc">{t("page.voice.desc")}</p>
            <p className="vl-unit-desc vl-unit-hint" data-testid="vl-unit-hint">
              {t("voice.unit.hint")}
            </p>
          </div>
        )}
        {!placeMode && <div className="vl-section-label">{t("voice.trade.label")}</div>}
        {!placeMode && (
          <div className="vl-trades" role="group" aria-label={t("voice.trade.label")}>
            {VOICE_TRADES.map((tr) => (
              <button
                key={tr.id}
                type="button"
                className={`vl-trade${tr.id === tradeId ? " is-active" : ""}`}
                style={{ "--vl": tr.color, "--vl-tint": `${tr.color}1c` }}
                aria-pressed={tr.id === tradeId}
                disabled={busy}
                onClick={() => {
                  if (tr.id !== tradeId) setTradeItem(""); // 다른 분류의 세부 공종은 이어 가지 않는다
                  setTradeId(tr.id);
                  setResult(null);
                  setMessage(null);
                }}
                data-testid={`vl-trade-${tr.id}`}
              >
                <span className="vl-trade-dot" />
                <span>{t(tradeLabelKey(tr.id))}</span>
              </button>
            ))}
          </div>
        )}
        {!placeMode && tradeItems.length > 0 && (
          <div className="field vl-item">
            <label htmlFor="vl-item">{t("voice.trade.item")}</label>
            <select
              id="vl-item"
              className="input"
              value={itemValue}
              disabled={busy}
              onChange={(e) => {
                setTradeItem(e.target.value);
                setResult(null);
                setMessage(null);
              }}
              data-testid="vl-item"
            >
              <option value="">{t("voice.trade.itemAll", { name: t(tradeLabelKey(trade.id)) })}</option>
              {tradeItems.map((it) => (
                <option key={it.id} value={it.text}>
                  {it.text}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <div className="vl-grid">
        <section className="card vl-recorder" style={themeStyle} data-testid="vl-recorder" data-trade={trade.id}>
          <header className="vl-rec-head">
            <h2 data-testid="vl-title">{t("voice.title", { name: t(tradeLabelKey(trade.id)) })}</h2>
            <span className="vl-badge">{trade.badge}</span>
          </header>

          <div className="vl-rec-body">
            <div className="vl-loc">
              <div className="vl-loc-title">
                <Icon.Pin width="15" height="15" /> {t("voice.loc.title")}
              </div>
              {placeMode ? (
                buildings.length === 0 ? (
                  <div className="vl-note" data-testid="vl-no-buildings">
                    {t("voice.loc.noBuildings")}
                  </div>
                ) : (
                  <>
                    <div className="vl-loc-fixed vl-place-where" data-testid="vl-place-where">
                      {t("voice.place.where")}
                    </div>
                    {nameField}
                  </>
                )
              ) : !building ? (
                <div className="vl-note" data-testid="vl-no-buildings">
                  {t("voice.loc.noBuildings")}
                </div>
              ) : unitMode ? (
                <>
                  <div className="vl-loc-fixed" data-testid="vl-unit-location">
                    {building.name} {floorText(activeFloor)} {unitText}
                  </div>
                  {nameField}
                </>
              ) : (
                <div className="vl-loc-fields">
                  <div className="field">
                    <label htmlFor="vl-building">{t("voice.loc.building")}</label>
                    <select
                      id="vl-building"
                      className="input"
                      value={building.id}
                      disabled={busy}
                      onChange={(e) => setBuildingId(e.target.value)}
                      data-testid="vl-building"
                    >
                      {buildings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="vl-floor">{t("voice.loc.floor")}</label>
                    <select id="vl-floor" className="input" value={activeFloor} disabled={busy} onChange={(e) => setFloor(Number(e.target.value))} data-testid="vl-floor">
                      {floors.map((f) => (
                        <option key={f} value={f}>
                          {floorText(f)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field vl-elem">
                    <label htmlFor="vl-elem">{t("voice.loc.elem")}</label>
                    <input
                      id="vl-elem"
                      className="input"
                      list="vl-elem-list"
                      maxLength={VOICE_LIMITS.elem}
                      placeholder={t("voice.loc.elemPlaceholder")}
                      value={elem}
                      disabled={busy}
                      onChange={(e) => setElem(e.target.value)}
                      data-testid="vl-elem"
                    />
                    <datalist id="vl-elem-list">
                      {elemOptions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                </div>
              )}
            </div>

            <p className="vl-guide" data-testid="vl-guide">
              {placeMode ? t("voice.place.guide", { example }) : itemValue ? t("voice.guide.item", { item: itemValue }) : t(`voice.guide.${trade.id}`)}
            </p>
            <p className="vl-guide vl-speaker-hint" data-testid="vl-speaker-hint">
              {t("voice.speaker.hint")}
            </p>

            {!supported && (
              <div className="vl-note" data-testid="vl-unsupported">
                {t("voice.unsupported")}
              </div>
            )}

            <div className="vl-mic-wrap">
              <button
                type="button"
                className={`vl-mic${status === "listening" ? " is-listening" : ""}`}
                onClick={toggleMic}
                disabled={!supported || !canRecord || status === "stopping" || status === "saving"}
                aria-pressed={status === "listening"}
                data-testid="vl-mic"
              >
                <Icon.Mic width="40" height="40" />
                <span data-testid="vl-mic-text">{micLabel}</span>
              </button>
              <div className={`vl-status${statusKind ? ` is-${statusKind}` : ""}`} role="status" aria-live="polite" data-testid="vl-status">
                {statusText}
              </div>
              {/* 저장에 실패했을 때의 '다시 보내기'는 안내 문구 바로 아래에 둔다(휴대폰에서 결과 상자까지 스크롤하지 않아도 보이도록) */}
              {result && result.state === "error" && (
                <button type="button" className="btn btn-primary vl-retry" onClick={() => sendReport(result)} data-testid="vl-retry">
                  {t("voice.result.retry")}
                </button>
              )}
            </div>

            {result && result.state === "noplace" && (
              <div ref={resultRef} className="vl-result is-error" data-testid="vl-result" data-state="noplace">
                <h3>{t("voice.result.raw")}</h3>
                <div className="vl-result-raw" data-testid="vl-raw">
                  "{result.rawText}"
                </div>
                <div className="vl-result-sep" />
                <div className="vl-progress-msg is-warn" data-testid="vl-place-msg">
                  {t(PLACE_FAIL_KEY[result.failKind] || "voice.place.none", { place: result.failPlace || "", example })}
                </div>
              </div>
            )}
            {result && result.state !== "noplace" && (
              <>
              <div ref={resultRef} className={`vl-result${result.state === "error" ? " is-error" : ""}`} data-testid="vl-result">
                <h3>{t("voice.result.raw")}</h3>
                <div className="vl-result-raw" data-testid="vl-raw">
                  "{result.rawText}"
                </div>
                {result.speakerName && (
                  <div className="vl-meta" data-testid="vl-result-meta">
                    <SpeakerLine speaker={{ name: result.speakerName, company: result.speakerCompany }} prefix="vl-result" />
                  </div>
                )}
                {(result.replacedCount > 0 || (typeof result.dbText === "string" && result.dbText !== "" && result.dbText !== result.rawText)) && (
                  <>
                    <div className="vl-result-sep" />
                    <h3>
                      {t("voice.result.normalized")}
                      {result.replacedCount > 0 && (
                        <span className="vl-result-count" data-testid="vl-replaced">
                          {t("voice.result.replaced", { n: result.replacedCount })}
                        </span>
                      )}
                    </h3>
                    <div className="vl-result-norm" data-testid="vl-norm">
                      <NormalizedText parts={result.parts} />
                    </div>
                    {Array.isArray(result.fuzzy) && result.fuzzy.length > 0 && (
                      <div className="vl-fuzzy" data-testid="vl-fuzzy">
                        <div className="vl-fuzzy-title">{t("voice.result.fuzzy")}</div>
                        <ul className="vl-fuzzy-list">
                          {result.fuzzy.map((f, i) => (
                            <li key={i} data-testid="vl-fuzzy-item">
                              “{f.from}” → {f.text} <span className="vl-fuzzy-sim">({t("voice.result.fuzzySim", { sim: f.sim })})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                <div className="vl-result-sep" />
                <h3>{t("voice.result.summary")}</h3>
                <div className="vl-result-summary" data-testid="vl-summary">
                  {result.summary}
                </div>
                {result.place && result.place.kind === "other" && (
                  <div className="vl-moved" data-testid="vl-moved">
                    <Icon.Pin width="15" height="15" />
                    <span>{placeMode ? t("voice.place.saved", { place: movedLabel(result.place) }) : t("voice.moved.to", { place: movedLabel(result.place), here: hereLabel })}</span>
                  </div>
                )}
                {(result.progress || (result.place && (result.place.kind === "unknown" || result.place.kind === "partial"))) && (
                  <ProgressNote
                    progress={result.progress}
                    unitLabel={
                      result.progress && result.progress.resolved.ok
                        ? `${result.place && result.place.kind === "other" ? `${result.place.buildingName} ` : ""}${floorText(result.progress.resolved.floor)} ${t("voice.loc.unitOption", { n: result.progress.resolved.unit })}`
                        : ""
                    }
                    place={result.place}
                    t={t}
                    golgu={placeMode && !!result.done}
                  />
                )}
                {result.state !== "error" && (
                  <div className="vl-result-foot">
                    {result.state === "saving" && <span className="vl-saving">{t("voice.status.sending")}</span>}
                    {result.state === "saved" && (
                      <span className="vl-saved" data-testid="vl-saved">
                        <Icon.Check width="14" height="14" /> {t("voice.result.saved")}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* 녹음 저장 상태는 결과 상자 '밖' 바로 아래에 둔다: 소리를 저장하는 동안 상자의 높이가 변하지 않아야 방금 말한 글이 화면 안에 그대로 보인다 */}
              {result.state === "saved" && result.audio && (
                <div className={`vl-audio-state is-${result.audio}`} data-testid="vl-audio-state" data-state={result.audio}>
                  {result.audio === "saving" && <span className="vl-saving">{t("voice.audio.saving")}</span>}
                  {result.audio === "saved" && (
                    <>
                      <span className="vl-audio-ok" data-testid="vl-audio-saved">
                        <Icon.Mic width="14" height="14" /> {t("voice.audio.saved", { time: formatDuration(result.audioSec) })}
                      </span>
                      <VoiceAudioPlayer reportId={result.id} sec={result.audioSec} prefix="vl-result" />
                    </>
                  )}
                  {result.audio === "error" && (
                    <>
                      <span className="vl-audio-warn" data-testid="vl-audio-error">
                        {t("voice.audio.saveError")}
                      </span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={retryAudio} data-testid="vl-audio-retry">
                        {t("voice.audio.retry")}
                      </button>
                    </>
                  )}
                  {result.audio === "none" && audioNoteKey(result.audioReason) && (
                    <span className="vl-audio-warn" data-testid="vl-audio-note" data-reason={result.audioReason}>
                      {t(audioNoteKey(result.audioReason))}
                    </span>
                  )}
                </div>
              )}
              </>
            )}

            {!AUDIO_CAPTURE_ENABLED ? null : audioOk ? (
              <div className="vl-keep-wrap">
                <label className="vl-keep" data-testid="vl-keep">
                  <input type="checkbox" checked={keepAudio} disabled={busy} onChange={(e) => changeKeepAudio(e.target.checked)} data-testid="vl-keep-input" />
                  <span className="vl-keep-text">
                    <span className="vl-keep-label">{t("voice.audio.keep")}</span>
                    <span className="vl-keep-note">{t("voice.audio.keepNote")}</span>
                  </span>
                </label>
                {shareMic && keepAudio && (
                  <p className="vl-keep-note" style={compactFeed ? { wordBreak: "keep-all", overflowWrap: "anywhere" } : undefined} data-testid="vl-keep-shared">
                    {t("voice.audio.shared")}
                  </p>
                )}
                {keepAudio && audioHint && (
                  <div className="vl-keep-hint" role="status" data-testid="vl-keep-hint">
                    <span>{t("voice.audio.hint")}</span>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => changeKeepAudio(false)} data-testid="vl-keep-off">
                      {t("voice.audio.hintOff")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="vl-keep-note vl-keep-unsupported" data-testid="vl-keep-unsupported">
                {t("voice.audio.unsupported")}
              </p>
            )}

            <div className="vl-text">
              {supported && (
                <button type="button" className="vl-text-toggle" onClick={() => setShowText((v) => !v)} aria-expanded={showText} data-testid="vl-text-toggle">
                  {t("voice.text.toggle")}
                </button>
              )}
              {showText && (
                <form className="vl-text-form" onSubmit={submitText}>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={VOICE_LIMITS.typedText}
                    placeholder={t("voice.text.placeholder")}
                    value={textValue}
                    disabled={!canType || busy}
                    onChange={(e) => setTextValue(e.target.value)}
                    onFocus={() => refreshGlossary()}
                    data-testid="vl-text"
                  />
                  <button className="btn btn-primary" disabled={!canRecord || busy || !textValue.trim()} data-testid="vl-text-send">
                    {t("voice.text.send")}
                  </button>
                </form>
              )}
              {/* 글은 썼는데 위치가 아직이라 보내기가 잠겨 있을 때만, 왜 안 눌리는지 칸 바로 아래에서 알려 준다 */}
              {showText && canType && !canRecord && textValue.trim() && (
                <div className="vl-note" role="status" data-testid="vl-text-hint">
                  {t("voice.needLocation")}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card vl-feed" data-testid="vl-feed">
          <div className="vl-feed-head">
            <div className="section-title">{t(placeMode ? "voice.feed.titleTrade" : unitMode ? "voice.feed.titleUnit" : "voice.feed.title")}</div>
            <span className="vl-feed-count" data-testid="vl-feed-count">
              {t("voice.feed.count", { n: reports.length })}
            </span>
            {!placeMode && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadReports(zone)} disabled={!zone || feedState === "loading"} data-testid="vl-refresh">
                {t("voice.feed.refresh")}
              </button>
            )}
          </div>
          {!placeMode && <div className="vl-feed-zone">{building ? `${building.name} ${floorText(activeFloor)}${unitMode ? ` ${unitText}` : ""}` : ""}</div>}

          {feedState === "error" ? (
            <div className="vl-note" data-testid="vl-feed-error">
              {t("voice.feed.loadError")}
            </div>
          ) : feedState === "loading" && reports.length === 0 ? (
            <div className="vl-feed-loading">{t("voice.feed.loading")}</div>
          ) : reports.length === 0 ? (
            <EmptyState message={t(placeMode ? "voice.feed.emptyTrade" : "voice.feed.empty")} />
          ) : (
            <div className="vl-feed-list">
              {shown.map((r) => {
                const tr = findTrade(r.trade);
                return (
                  <article key={r.id} className="vl-card" style={{ "--vl": (tr || trade).color }} data-testid="vl-card">
                    <header className="vl-card-head">
                      {tr && <span className="vl-card-trade">{t(tradeLabelKey(tr.id))}</span>}
                      <strong>{r.author || t("qr.list.anonymous")}</strong>
                      {r.via === "text" && <span className="vl-card-via">{t("voice.card.viaText")}</span>}
                      <time className="vl-card-time">{formatDateTime(r.createdAt)}</time>
                    </header>
                    <div className="vl-card-loc">
                      <Icon.Pin width="13" height="13" /> {locationLabel(r)} · {r.elem}
                    </div>
                    <div className="vl-card-raw">"{r.rawText}"</div>
                    {convertedText(r) && convertedText(r) !== r.rawText && (
                      <div className="vl-card-norm" data-testid="vl-card-norm" aria-label={t("voice.result.normalized")}>
                        <span aria-hidden="true">→ </span>
                        {convertedText(r)}
                      </div>
                    )}
                    <div className="vl-card-summary">{r.summary}</div>
                    <VoiceRecordMeta report={r} prefix="vl" />
                  </article>
                );
              })}
              {reports.length > visible && (
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setVisible((v) => v + (compactFeed ? UNIT_PAGE_STEP : PAGE_SIZE))} data-testid="vl-more">
                  {t("voice.feed.more")}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
