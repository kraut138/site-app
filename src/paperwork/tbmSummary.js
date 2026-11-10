// 약 5분 길이의 TBM(작업 전 안전점검회의) 녹음을 받아 적은 글을 읽어, TBM 일지(tbm-log.docx)의 칸에 들어갈 글로 줄인다.
// 서버나 인공지능 서비스에 보내지 않고 이 브라우저 안에서 규칙으로만 읽는다(순수 함수라 화면·저장소와 무관하게 Node에서 그대로 시험한다).
//
// 칸마다 이렇게 찾는다.
//   현장명        "현장명은 OO", "OO아파트 신축공사 현장" 처럼 현장 이름을 말한 앞부분
//   진행자        "OO건설 소속 홍길동입니다", "진행은 OO건설 홍길동 소장입니다", "저는 홍길동 반장입니다"
//   참석 인원     "참석 인원은 열두 명", "오늘 인원 12명" (신규 근로자 수 같은 다른 사람 수는 읽지 않는다)
//   작업 장소     "101동 3층", "102동 지하 1층", "103동 옥상" (작업을 말한 문장의 동·층, 없으면 글 전체)
//   작업 내용     "오늘 작업은 … 도배와 방수입니다" 처럼 오늘 할 작업을 말한 문장의 낱말
//   위험요인·대책 위험 낱말(추락·감전·개구부·미설치 …)이 든 말이 위험요인, 설치·착용·금지·확인 같은 말이 대책이다.
//                 한 문장에 둘이 같이 있거나("추락 위험이 있으니 안전대를 착용하세요") 이어지는 문장에 있으면 한 줄로 묶는다(최대 5줄).
//   점검 항목     보호구·건강 상태·신규/외국인 근로자·장비 반경/신호수·기상을 말하고 확인했다는 말이 함께 있을 때만 표시한다.
//   교육·전달 사항 위에 들어가지 않은 전달·공지·날씨·교육·일반 주의 말(최대 6줄, 칸이 모자라 못 넣은 위험요인도 여기에 둔다)
//
// 원칙(서류 일지라서): 말하지 않은 것은 만들어 내지 않는다. 확실히 읽지 못한 칸은 비워 두고 missing에 알려 준다.
//   글을 줄일 때는 말의 끝맺음("~하세요", "~할 위험이 있습니다")만 개조식("~ 설치", "~ 위험")으로 바꾸고 낱말은 바꾸지 않는다.
//   정규식 lookbehind는 오래된 아이폰 브라우저가 읽지 못해 쓰지 않는다.
import { checkWorkLogInfo } from "../workLogInfo.js";
import { parseSpeakerIntro } from "../speakerIntro.js";
import { joinFloors } from "./textRules.js";

export const TBM_RISK_TEMPLATE = 5; // 양식의 위험요인·대책 표 줄 수(더 많으면 서류를 만들 때 줄을 늘린다)
export const TBM_RISK_MAX = 8; // 한 번에 넣는 위험요인·대책 줄 수(더 있으면 교육·전달 사항에 한 줄로 남긴다)
export const TBM_NOTES_MAX = 6; // 교육·전달 사항 줄 수
export const TBM_TEXT_MAX = 40000; // 읽을 글의 최대 글자 수(이보다 길면 앞부분만 읽는다)

// 점검 항목(양식의 "2. 점검 항목" 다섯 줄)
export const CHECK_KEYS = ["protect", "health", "newcomer", "equipment", "weather"];
export const CHECK_LABELS = {
  protect: "보호구 착용 상태(안전모 턱끈, 안전대, 안전화)",
  health: "작업자 건강 상태 확인(음주·질병·피로)",
  newcomer: "신규·외국인 근로자 확인 및 작업 위치 지정",
  equipment: "장비 작업 반경·신호수 배치 확인",
  weather: "기상(강풍·우천·폭염) 확인 및 작업 조정",
};

// 칸마다 넣을 수 있는 글자 수(칸이 좁아 이보다 길면 서류가 지저분해진다)
export const TBM_LIMITS = { site: 40, leader: 40, place: 80, work: 100, hazard: 70, measure: 90, note: 70 };

// ---------------------------------------------------------------- 칸 값 모양

export function emptyTbmFields() {
  return {
    site: "",
    leader: "",
    headcount: "",
    from: "",
    to: "",
    place: "",
    work: "",
    risks: [],
    checks: { protect: false, health: false, newcomer: false, equipment: false, weather: false },
    notes: [],
  };
}

const oneLine = (s) =>
  String(s == null ? "" : s)
    .replace(/\s+/g, " ")
    .trim();
const squash = (s) => String(s == null ? "" : s).replace(/\s+/g, "");

function cutText(s, max) {
  const t = oneLine(s);
  return t.length > max ? t.slice(0, max).trim() : t;
}

// "7:05", "07:05", "0705"가 아니라 "HH:MM" 한 가지 모양만 받는다(아니면 "")
export function cleanClock(v) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(v == null ? "" : v));
  if (!m) return "";
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

// 저장해 둔 값·화면에서 고친 값을 서류에 넣어도 되는 모양으로 다듬는다(없는 것은 빈 값). 어떤 값이 와도 던지지 않는다.
export function cleanTbmFields(raw) {
  const base = emptyTbmFields();
  const r = raw && typeof raw === "object" ? raw : {};
  const count = String(r.headcount == null ? "" : r.headcount).replace(/[^\d]/g, "");
  const n = count ? Number(count) : 0;
  const risks = (Array.isArray(r.risks) ? r.risks : [])
    .map((x) => ({ hazard: cutText(x && x.hazard, TBM_LIMITS.hazard), measure: cutText(x && x.measure, TBM_LIMITS.measure) }))
    .filter((x) => x.hazard || x.measure)
    .slice(0, TBM_RISK_MAX);
  const notes = (Array.isArray(r.notes) ? r.notes : String(r.notes == null ? "" : r.notes).split(/\n/))
    .map((x) => cutText(x, TBM_LIMITS.note))
    .filter(Boolean)
    .slice(0, TBM_NOTES_MAX);
  const checks = { ...base.checks };
  if (r.checks && typeof r.checks === "object") for (const k of CHECK_KEYS) checks[k] = r.checks[k] === true;
  return {
    site: cutText(r.site, TBM_LIMITS.site),
    leader: cutText(r.leader, TBM_LIMITS.leader),
    headcount: n >= 1 && n <= 9999 ? String(n) : "",
    from: cleanClock(r.from),
    to: cleanClock(r.to),
    place: cutText(r.place, TBM_LIMITS.place),
    work: cutText(r.work, TBM_LIMITS.work),
    risks,
    checks,
    notes,
  };
}

// 회의 내용이 칸에 하나라도 있는가(회의에서 읽었거나 사람이 적은 값). 회의 시각(from·to)만 있는 것은 내용이 아니라서 세지 않는다
// (너무 짧게 녹음해 읽을 것이 없을 때 시각만 남아도 "회의 내용이 있는 서류"로 바뀌지 않게).
export function hasTbmFields(f) {
  const c = cleanTbmFields(f);
  return !!(c.site || c.leader || c.headcount || c.place || c.work || c.risks.length || c.notes.length || CHECK_KEYS.some((k) => c.checks[k]));
}

// 회의에서 찾지 못한(비어 있는) 칸의 이름표들. 고친 값으로 다시 계산해도 된다.
//   site 현장명 · leader 진행자 · headcount 참석 인원 · place 작업 장소 · work 작업 내용 · risks 위험요인 · measures 대책
export function tbmMissing(fields) {
  const c = cleanTbmFields(fields);
  const out = [];
  if (!c.site) out.push("site");
  if (!c.leader) out.push("leader");
  if (!c.headcount) out.push("headcount");
  if (!c.place) out.push("place");
  if (!c.work) out.push("work");
  if (c.risks.length === 0) out.push("risks");
  else if (c.risks.some((r) => !r.measure)) out.push("measures");
  return out;
}

// ---------------------------------------------------------------- 글 준비 · 문장 나누기

function prepare(raw) {
  let s = String(raw == null ? "" : raw);
  try {
    s = s.normalize("NFC");
  } catch {
    // 정규화를 못 하는 기기는 그대로 읽는다
  }
  return s
    .slice(0, TBM_TEXT_MAX)
    .replace(/\r\n?/g, "\n")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/[ \t ]+/g, " ");
}

// 문장이 끝나는 낱말(띄어쓰기 단위). 음성 인식 글에는 마침표가 없어서 끝말로 문장을 자른다.
const END_WORD = /(?:니다|세요|십시오|시오|시죠|해요|에요|예요|어요|아요|여요|죠|지요|네요|군요|까요|나요|가요|래요|데요|거든요|잖아요|할게요|할께요|합시다|하자|바랍니다|드립니다|주세요|줘요|해줘|한다|된다|있다|없다|했다|이다|같다|않다|바람|겠다|고요|겁니다|거죠|거예요|거에요)$/;
const MAX_TOKENS = 46; // 끝말 없이 이만큼 이어지면 이음말에서 억지로 자른다
const SOFT_BREAK = /(?:고|며|서|면서|으니|으니까|니까|는데|인데|지만|으나)$/;

const stripPunct = (t) => String(t).replace(/[,.;:!?~…。、，"'”’)\]]+$/, "");

export function splitSentences(raw) {
  const text = prepare(raw);
  const chunks = [];
  let cur = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") {
      chunks.push(cur);
      cur = "";
    } else if (ch === "." || ch === "!" || ch === "?" || ch === "。" || ch === "！" || ch === "？" || ch === "…") {
      // 숫자 사이의 점은 소수점("1.5미터")이라 문장 끝이 아니다
      if (ch === "." && /\d/.test(text[i - 1] || "") && /\d/.test(text[i + 1] || "")) cur += ch;
      else {
        chunks.push(cur);
        cur = "";
      }
    } else cur += ch;
  }
  chunks.push(cur);

  const out = [];
  for (const chunk of chunks) {
    const tokens = oneLine(chunk).split(" ").filter(Boolean);
    let buf = [];
    const flush = (n = buf.length) => {
      const s = buf.slice(0, n).join(" ").trim();
      if (s.length >= 2) out.push(s);
      buf = buf.slice(n);
    };
    for (const tok of tokens) {
      buf.push(tok);
      if (END_WORD.test(stripPunct(tok))) flush();
      else if (buf.length >= MAX_TOKENS) {
        let at = -1;
        for (let k = buf.length - 1; k >= 8; k -= 1) {
          if (SOFT_BREAK.test(stripPunct(buf[k]))) {
            at = k + 1;
            break;
          }
        }
        flush(at > 0 ? at : buf.length);
      }
    }
    flush();
  }
  return out;
}

// ---------------------------------------------------------------- 낱말 목록 (공백을 뺀 글에서 찾는다)

// 위험 그 자체를 뜻하는 낱말. "무사고"처럼 안전하다는 뜻으로 쓰인 말과 "누전차단기"·"낙하물 방지망" 같은 대책 이름 속의 말은 먼저 빼고 본다.
const NOT_HAZARD = /무사고|무재해|무재난|사고없이|사고가없|사고예방|재해예방|안전사고없|위험하지않|위험없|사고사례|주의보|경보/g;
const MEASURE_NAME = /(?:추락|낙하물?|감전|누전|화재|전도|비래|협착)(?:방호|방지|예방|차단|감시)\S{0,3}|불티\S{0,4}방지\S{0,2}|[가-힣]{1,4}방지(?:포|망|턱|대|판|막|재|구|시설)|안전망|누전차단\S{0,2}|화재감시\S{0,2}|소화기|소화전|방호선반|안전난간|추락방지\S{0,2}|낙하물방지\S{0,2}/g;
const H_EVENT = /추락|떨어질|떨어지|떨어져|낙하|비래|도괴|붕괴|무너|전도|넘어질|넘어지|넘어져|넘어짐|미끄러|미끄럼|협착|끼임|끼일|끼여|끼이|감전|누전|화재|불티|폭발|질식|중독|유해가스|베임|베일|절단사고|절단될|절단위험|찔림|찔릴|화상|열사병|온열|열탈진|충돌|부딪|깔림|깔릴|매몰|침하|익사|안전사고|아차사고|재해|사고|위험|우려|가능성|염려|다칠|다치|큰일|걸려|걸릴/;
// 위험한 상태를 가리키는 낱말(대책을 말하는 문장 안에서는 위험요인으로 보지 않는다: "개구부 덮개를 설치하세요")
const H_STATE = /개구부|미설치|미착용|미고정|파손|탈락|이탈|불량|노출|단부/;
// 위험과 이어질 수 있는 물건·작업 이름. 조심·주의 같은 말이 함께 있을 때만 위험요인으로 본다.
const H_WEAK = /고소|비계|사다리|말비계|양중|크레인|지게차|굴착기|포크레인|덤프|고소작업대|용접|용단|그라인더|절단기|전동공구|가설전기|분전반|전선|멀티탭|단부|슬래브|옥상|지붕|맨홀|밀폐|분진|소음|중량물|인양|적치|자재|통로|계단|바닥|못|철근|동바리|거푸집|갱폼|굴착|터파기|사면|토사|석면|페인트|도료|시너|본드|용제|가스|산소|가연물|폭염|한파|강풍|우천|호우|빗길|결빙|노출/;
const CAUTION = /조심|주의|유의|다칠|다치|큰일|아찔|위태|부주의/;
const hazardTest = (sq) => sq.replace(NOT_HAZARD, "").replace(MEASURE_NAME, "");

// 대책으로 읽는 말
const M_WORD = /설치|착용|확인|점검|금지|통제|배치|고정|결속|체결|덮개|덮어|차단|접근|출입|안전난간|난간|안전대|안전모|안전화|보호구|보안경|방호|안전망|신호수|유도원|수신호|정리|정돈|제거|철거|중지|정지|대기|대피|환기|측정|가동|지급|확보|유지|보양|준수|지키|지켜|삼가|하지마|하지말|금하|휴식|그늘|교대|2인1조|두명이|잡아|감시|잠금|잠가|접지|절연|누전차단기|표지|안내판|라바콘|경고|보고|신고|사용|이용|부착|비치|물을|마시|쉬어|쉬세요/;
// 부탁·다짐·권유하는 말투(이 말투와 대책 낱말이 같이 있으면 대책 문장이다)
const IMPER = /세요|십시오|바랍니다|바라겠습니다|합시다|하겠습니다|하도록|할게요|할께요|해야|하셔야|주세요|주십시오|주시기|마세요|말고|부탁|하시길|하시기|철저히|반드시|꼭\s|하지\s*말|않도록|금지/;

// 전달·공지·날씨·교육 같은 말(교육·전달 사항에 옮길 말)
const INFO = /전달|공지|안내|알려|참고|교육|이수|예정|내일|모레|다음주|이번주|오전|오후|점심|저녁|감리|감독관|본사|발주처|협조|반입|입고|레미콘|변경|폭염|한파|강풍|우천|호우|비가|비예보|비온|비오|눈온|눈오|태풍|장마|눈이|날씨|기상|기온|예보|주의보|경보|미세먼지|신규|외국인|통역|건강|음주|흡연|휴게|식당|주차|출입|점검|순찰|정리정돈|청소|분리수거|안전수칙|보호구|회의|건의|사례|지난|어제|요청/;

// 인사·마무리·구호(내용이 없으면 버린다)
const GREET = /안녕하세요|안녕하십니까|수고하|수고하셨|감사합니다|고맙습니다|시작하겠습니다|시작하도록|시작할게요|시작합니다|마치겠습니다|마칩니다|마무리하겠습니다|이상입니다|이상으로|질문|궁금|구호|제창|파이팅|화이팅|안전제일|무재해|무사고|가시죠|가세요|출발|모여|모이세요|집중|조용히|들어주|들어보|잘들|해산|박수/;
const QUESTION = /있으십니까|있으신가요|없으십니까|없으신가요|괜찮으십니까|괜찮으신가요|아시겠습니까|이해되셨|아셨죠|맞죠$|그렇죠$/;

// ---------------------------------------------------------------- 위치(동·층·구역)

const AREA_WORDS = "옥상|옥탑|지붕층|PIT|피트|지하주차장|주차장|로비|현관|복도|계단실|기계실|전기실|발전기실|물탱크실|옥외|외벽|지하층|커뮤니티|상가|근린생활시설|경로당|부대시설|조경";
// 동 이름이 아닌 "동시에·동안·동의" 같은 낱말은 걷어 낸다
const RE_PLACE = new RegExp(`(?:^|[^A-Za-z0-9])((?:\\d{1,4}|[A-Za-z])\\s*동)(?![시안의일작료선결바영네쪽력원행참반그])|지하\\s*(\\d{1,2})\\s*층|(\\d{1,3})\\s*층|(${AREA_WORDS})`, "g");

// 문장들에서 동·층·구역을 읽어 "101동 3층, 102동 지하1층, 103동 옥상"으로 합친다
function readPlaces(texts) {
  const order = []; // 나온 순서대로 { b, floors:Set, areas:[] }
  const byName = new Map();
  const pick = (name) => {
    if (!byName.has(name)) {
      const e = { b: name, floors: new Set(), areas: [] };
      byName.set(name, e);
      order.push(e);
    }
    return byName.get(name);
  };
  let current = null;
  for (const t of texts) {
    RE_PLACE.lastIndex = 0;
    let m;
    while ((m = RE_PLACE.exec(t)) !== null) {
      if (m[1]) {
        current = pick(m[1].replace(/\s+/g, ""));
      } else if (m[2]) {
        (current || pick("")).floors.add(-Number(m[2]));
      } else if (m[3]) {
        const n = Number(m[3]);
        if (n >= 1 && n <= 120) (current || pick("")).floors.add(n);
      } else if (m[4]) {
        const a = m[4] === "피트" ? "PIT" : m[4];
        const e = current || pick("");
        if (!e.areas.includes(a)) e.areas.push(a);
      }
      if (m.index === RE_PLACE.lastIndex) RE_PLACE.lastIndex += 1;
    }
  }
  const out = [];
  for (const e of order) {
    const floors = joinFloors(Array.from(e.floors));
    if (floors) out.push([e.b, floors].filter(Boolean).join(" "));
    for (const a of e.areas) out.push([e.b, a].filter(Boolean).join(" "));
    if (!floors && e.areas.length === 0 && e.b) out.push(e.b); // 층·구역 없이 동만 말한 경우
  }
  return Array.from(new Set(out));
}

// ---------------------------------------------------------------- 개조식으로 줄이기

// 순서 낱말: 첫 번째·두 번째 … / 첫째·둘째 … / 1번
const ORD = "(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열한|열두|열세|열네|열다섯|열)\\s*번째|(?:첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열한|열두|열)째|\\d{1,2}\\s*번(?:째)?|(?:하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열한|열두|열)(?=\\s+(?!명|개|분|번|시|층|동|호|가지))";
const LEAD_FILLERS = /^(?:자|그럼|그리고|그래서|또한|또|먼저|우선|우선은|다음으로|마지막으로|끝으로|참고로|아울러|특히|그런데|근데|일단|그다음에|다음은|이어서|음|어|아)\s+|^(?:네|예)(?!\s*번째)\s+/;
const LEAD_ENUM = new RegExp(`^(?:${ORD})\\s*(?:로는|로|는|은|으로|,)?\\s*`);
const ENUM_START = new RegExp(`^(?:(?:자|그럼|그리고|그래서|먼저|우선|다음으로|마지막으로|네|예|음)\\s+)*(?:${ORD})`);
const LEAD_LABEL = /^(?:위험\s*요인|위험요소|위험\s*사항|주의\s*사항|유의\s*사항|대책|조치\s*사항|조치|예방\s*대책|안전\s*대책|전달\s*사항|공지\s*사항|참고\s*사항)\s*(?:으로는|으로|은|는|이|가|:)?\s*/;
const MEASURE_LABEL = /^(?:대책|조치\s*사항|조치|예방\s*대책|안전\s*대책)/;
const ADVERBS = /(?:^|\s)(?:반드시|꼭|철저히|항상|다들|모두|여러분|잘|좀|조금|각별히|특히|제발|우선|다시 한번|한번 더)(?=\s)/g;

// 말의 끝맺음을 개조식으로: "안전대를 착용해 주세요" → "안전대 착용", "추락할 위험이 있습니다" → "추락 위험".
// 어떻게 줄일지 확실한 끝맺음만 바꾸고, 모르는 동사("잡아주세요")는 그대로 둔다(잘못 줄이는 것보다 낫다).
const END_RULES = [
  [/\s*(?:하지|하시지)\s*마(?:세요|십시오|시기 바랍니다|시길 바랍니다)$/, " 금지"],
  [/([가-힣]+)지\s*마(?:세요|십시오|시기 바랍니다|시길 바랍니다)$/, "$1지 말 것"],
  [/취해\s*(?:주세요|주시기 바랍니다|주시고요|주시고)$/, "취하기"],
  [/(?:에\s*대해|에\s*관해|에\s*대하여)\s*(?:말씀|설명|공유|안내|전달)\s*(?:드리겠습니다|드릴게요|드립니다|하겠습니다)$/, ""],
  [/(?:하|해|하여)\s*(?:주시기|주시길|주십시오|주세요|주시고요|주시고|주시면|주실 것을|주시기를|주었습니다|줬습니다|주었어요|줬어요)\s*(?:바랍니다|부탁드립니다|부탁드려요|좋겠습니다)?$/, ""],
  [/(이어서|계속)\s*(?:합니다|하겠습니다|해요|할 예정입니다)$/, "$1 진행"],
  [/기로\s*(?:했습니다|하였습니다|했어요|했음)$/, "기로 함"],
  [/(?:하세요|하십시오|하시기 바랍니다|하시길 바랍니다|하시고요|하시고|하셔야 합니다|하셔야 해요|합시다|하도록 합시다|하도록 하겠습니다|하겠습니다|할게요|할께요|하자|해야 합니다|해야 해요|해야 됩니다|해야 돼요|합니다만|합니다|했습니다|했어요|했음|해요|하도록|하였습니다|하였음|한다|했다)$/, ""],
  [/(?:해|하여)\s*(?:야|야만)\s*(?:합니다|해요|됩니다)$/, ""],
  [/([가-힣]{2,})(?:되었습니다|됐습니다|되었어요|됐어요|되었음|됐음)$/, "$1"],
  [/(위험|우려|가능성|염려)(?:이|가|도|은|는)?\s*(?:있|높|크|많)(?:으니까|으니|으므로|어서|아서|은데|는데|기\s*때문에|으며|으나)$/, "$1"],
  [/(위험|우려|가능성|염려)(?:이|가|도|은|는)?\s*(?:있습니다|있어요|높습니다|높아요|큽니다|커요|많습니다|있음)$/, "$1"],
  [/수\s*있(?:으니까|으니|으므로|어서|는데|기\s*때문에)$/, "수 있음"],
  [/([가-힣]+)(?:하니까|하니|하므로|하기\s*때문에)$/, "$1"],
  [/([가-힣])우니(?:까)?$/, "$1움"],
  [/(?:큰일|아찔)\s*납니다$/, "큰일"],
  [/(?:입니다|이에요|예요|이다)$/, ""],
  [/(?:있습니다|있어요)$/, "있음"],
  [/(?:없습니다|없어요)$/, "없음"],
  [/(?:됩니다|돼요)$/, "됨"],
  [/(?:바랍니다|부탁드립니다)$/, ""],
];

function nominalize(text) {
  let s = oneLine(text);
  // 이어진 부분: "설치하고 착용하고" → "설치, 착용", "투입되었는데 교육받았고" → "투입, 교육받음,"
  s = s.replace(/(?:되었|됐)(?:고요|고|으며|는데|으나)\s+(?=\S)/g, ", ");
  s = s.replace(/받았(?:고요|고|으며|는데|으나)\s+(?=\S)/g, "받음, ");
  s = s.replace(/([가-힣]{2,})(?:했|하였)(?:고요|고|으며|는데|으나|지만)\s+(?=\S)/g, "$1, ");
  s = s.replace(/(?:하고요|하시고요|하시며|하며|하고|하시고|하여)\s+(?=\S)/g, ", ");
  s = s.replace(/([가-힣A-Za-z0-9])(?:에는|에서는)(?=\s|$)/g, "$1");
  s = s.replace(/([가-힣A-Za-z0-9])[을를]\s+(?=[가-힣A-Za-z0-9]{2,})/g, "$1 ");
  s = s.replace(/([가-힣]{2,})할\s*(위험|우려|가능성)/g, "$1 $2");
  for (let pass = 0; pass < 2; pass += 1) {
    let hit = false;
    for (const [re, to] of END_RULES) {
      if (re.test(s)) {
        s = s.replace(re, to);
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  return s;
}

function stripLead(text) {
  let s = oneLine(text);
  for (let i = 0; i < 6; i += 1) {
    const before = s;
    s = s.replace(LEAD_FILLERS, "").replace(LEAD_ENUM, "").replace(LEAD_LABEL, "");
    if (s === before) break;
  }
  return s;
}

// 문장 하나를 칸에 넣을 짧은 글로(어떤 글이 와도 던지지 않는다)
function bullet(text, max) {
  try {
    let s = stripLead(text);
    s = s.replace(ADVERBS, " ");
    s = nominalize(s);
    s = s
      .replace(/\s*,\s*(?:,\s*)+/g, ", ")
      .replace(/\s+,/g, ",")
      .replace(/,\s*(?:작업|실시|진행)$/, "")
      .replace(/[,\s]+$/g, "")
      .replace(/^[,\s]+/g, "")
      .replace(/([가-힣]{2,})[을를]$/, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (s.length > max) {
      const head = s.slice(0, max);
      const cut = Math.max(head.lastIndexOf(", "), head.lastIndexOf(" "));
      s = `${(cut > max * 0.5 ? head.slice(0, cut) : head).replace(/[,\s]+$/g, "")} 등`;
    }
    return s;
  } catch {
    return cutText(text, max);
  }
}

// 알림만 하고 내용이 없는 말("지금부터 위험요인을 말씀드리겠습니다")의 알맹이 길이
// 알리는 말과, 그 말 바로 뒤에 붙은 조사만 뺀다. 낱말 가운데의 글자(도배의 "도", 가설의 "가")는 세어야 하므로 조사 글자를 통째로 지우지 않는다.
const ANNOUNCE_WORDS = "지금부터|이제|그럼|오늘|금일|위험요인|위험요소|대책|조치|전달사항|점검항목|점검|말씀|설명|공유|전달|발표|안내|시작|드리겠습니다|드릴게요|하겠습니다|합니다|입니다|하도록|해서|에대해|대해|하나씩|차례로|순서대로|먼저|다음으로|마지막으로|작업|내용|사항|항목|순서";
const ANNOUNCE_CORE = new RegExp(`(?:${ANNOUNCE_WORDS})(?:에서는|에서|에는|으로는|으로|은|는|이|가|을|를|에|의|도|로|과|와)?`, "g");
function coreLength(text) {
  return squash(stripLead(text)).replace(ANNOUNCE_CORE, "").length;
}

const ANNOUNCE_VERB = /말씀|설명|공유|발표|안내|드리겠|드릴게|시작|살펴|알려|이야기|얘기|넘어가|보겠습니다|하겠습니다$/;
// "먼저 오늘 작업 내용을 말씀드리겠습니다"처럼 다음에 올 말을 알리기만 하는 문장인가
const HEADING = /^(?:점검항목|점검사항|전달사항|공지사항|위험요인|위험요소|대책|조치사항|안전수칙|작업내용|주의사항|유의사항|참고사항|건의사항|교육내용|교육사항|기타사항|기타)(?:은|는|이|가)?(?:입니다|이에요|이었습니다|이겠습니다)?$/;
function isAnnounce(text) {
  const sq = squash(stripLead(text)).replace(/[,.;:!?~…]+$/g, "");
  if (HEADING.test(sq)) return true;
  return ANNOUNCE_VERB.test(squash(text)) && coreLength(text) < 3;
}

// ---------------------------------------------------------------- 사람 이름

const SURNAMES = new Set(
  "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부가갈".split("")
);
const DOUBLE_SURNAMES = new Set(["남궁", "황보", "제갈", "선우", "독고", "사공"]);
const NAME_STOP = new Set([
  "오늘", "이번", "정말", "안전", "주의", "조심", "신규", "작업", "진행", "시작", "한번", "고소", "강풍", "정리", "정돈", "정리정돈", "장비", "지하", "하나", "한분", "소장", "반장", "팀장", "과장", "부장", "관리", "공사", "현장", "회사", "업체", "인원", "근로", "전달", "점검", "확인", "주변", "우리", "저희", "여러", "금일", "참석", "고용", "기사",
  "고정", "유의", "신호", "신호수", "이상", "이어", "오전", "오후", "전기", "전원", "공통", "공무", "설치", "설비", "소화", "소음", "주차", "주로", "도배", "방수", "배관", "배선", "마감", "미장", "타일", "도장", "용접", "철근", "형틀", "양중", "임시", "하부", "상부", "한성", "대한",
]);
const TITLE = "(?:안전관리자|관리감독자|안전팀장|공무팀장|현장소장|소장|부장|과장|차장|팀장|반장|조장|대리|주임|공무|공장|기사|감독|책임|실장|이사|대표|관리자)";
const COMPANY_END = /(?:건설|산업|기업|공업|개발|토건|전기|설비|엔지니어링|이엔씨|이앤씨|E&C|ENC|테크|물산|상사|종합|인테리어|전력|통신|소방|조경|도장|방수|타일|도배|미장|철근|형틀|콘크리트|판넬|유리|창호|하우징|건축|토목|이엔지|ENG)$/i;
const TITLE_RE = new RegExp(`^${TITLE}$`);

function isName(w) {
  if (!/^[가-힣]{2,4}$/.test(w) || NAME_STOP.has(w) || COMPANY_END.test(w)) return false;
  return SURNAMES.has(w[0]) || DOUBLE_SURNAMES.has(w.slice(0, 2));
}
const isCompanyToken = (w) => /^[가-힣A-Za-z0-9&·()㈜]{2,16}$/.test(w) && (COMPANY_END.test(w) || /^(?:\(주\)|㈜|주식회사)/.test(w));

// 낱말 끝의 끝맺음·조사를 한두 겹 떼어 낸 모양들(원래 낱말이 맨 앞)
const END_PEEL = /(?:입니다만|입니다|이에요|예요|이고요|이며|이고|인데요|인데|이라고|라고|께서|님이|님|씨|이|가|은|는)$/;
function peelAll(w) {
  const out = [w];
  let cur = w;
  for (let k = 0; k < 2; k += 1) {
    const m = END_PEEL.exec(cur);
    if (!m || cur.length - m[0].length < 1) break;
    cur = cur.slice(0, cur.length - m[0].length);
    out.push(cur);
  }
  return out;
}
const nameOf = (w) => {
  const c = peelAll(String(w || ""));
  for (let k = c.length - 1; k >= 0; k -= 1) if (isName(c[k])) return c[k];
  return "";
};
const titleOf = (w) => {
  for (const c of peelAll(String(w || ""))) if (TITLE_RE.test(c)) return c;
  return "";
};

// 소개 말을 하는 낱말: "저는", "진행은" …
const CUE_WORD = /^(?:저는|제가|저희는|저희가|진행은|진행자는|진행자로|진행을|사회는|사회를|관리감독자는|담당은|담당자는|진행자|사회자|관리감독자|진행|사회)$/;
const INTRO_END = /(?:입니다|이에요|예요|이라고|이고요|이며|입니다만|인데요|하겠습니다|합니다|맡겠습니다|맡습니다)$/;
const COMPANY_LIKE = /^[가-힣A-Za-z0-9&·()㈜]{2,12}$/;

function leaderFromTokens(tokens) {
  let cueIdx = -1;
  tokens.forEach((w, i) => {
    if (cueIdx < 0 && CUE_WORD.test(w)) cueIdx = i;
  });
  for (let k = 0; k < tokens.length; k += 1) {
    const name = nameOf(tokens[k]);
    if (!name) continue;
    const title = titleOf(tokens[k + 1] || "");
    const ended = [tokens[k], tokens[k + 1] || "", tokens[k + 2] || "", tokens[k + 3] || ""].some((w) => INTRO_END.test(w));
    const cued = cueIdx >= 0 && cueIdx < k && k - cueIdx <= 4;
    const company = [];
    for (let j = k - 1; j >= 0 && company.length < 2; j -= 1) {
      const w = tokens[j];
      if (j <= cueIdx || CUE_WORD.test(w)) break;
      if (isCompanyToken(w) || (cued && COMPANY_LIKE.test(w) && !NAME_STOP.has(w) && !SITE_STOP.test(w) && !/(?:은|는|이|가|도)$/.test(w))) company.unshift(w);
      else break;
    }
    const strongCompany = company.some((w) => isCompanyToken(w));
    if ((cued && (title || ended)) || (strongCompany && title && ended)) return [company.join(" "), name, title].filter(Boolean).join(" ");
  }
  return "";
}

// 진행자("OO건설 홍길동 소장")를 찾는다. 못 찾으면 { value: "", idx: -1 }.
function findLeader(sentences) {
  const head = sentences.slice(0, 25);
  // 1) "소속"이 든 소개 말(음성 검측과 같은 읽기). "진행은 대한건설 소속 홍길동 소장"처럼 앞에 붙은 "진행은"은 회사 이름이 아니다.
  for (const s of head) {
    let p;
    try {
      p = parseSpeakerIntro(s.text);
    } catch {
      continue;
    }
    if (!p.found || !p.name || !isName(p.name)) continue;
    const company = oneLine(p.company)
      .split(" ")
      .filter((w) => w && !CUE_WORD.test(w) && !(/(?:은|는)$/.test(w) && !isCompanyToken(w)))
      .join(" ");
    const tokens = oneLine(s.text).split(" ").map(stripPunct);
    const at = tokens.findIndex((w) => nameOf(w) === p.name);
    const title = at >= 0 ? titleOf(tokens[at + 1] || "") : "";
    return { value: [company, p.name, title].filter(Boolean).join(" "), idx: s.i };
  }
  // 2) "저는 한성전기 김철수 반장입니다", "진행은 OO건설 홍길동 소장입니다"
  for (const s of head) {
    const tokens = oneLine(s.text).split(" ").map(stripPunct).filter(Boolean);
    const v = leaderFromTokens(tokens);
    if (v) return { value: v, idx: s.i };
  }
  return { value: "", idx: -1 };
}

// ---------------------------------------------------------------- 현장명

const SITE_STOP = /^(?:오늘|금일|이번|우리|저희|각|해당|본|현재|지금|이|그|저|다른|모든|전체|작업|공사|건설|안전|신규|타|새로운|담당|관리|현|여기|그리고|그래서|먼저|자|네|예|어제|내일|아침|저녁|안녕하세요|바로|이제|일찍)$/;
const SITE_GENERIC = /^(?:신축|증축|개축|리모델링|재건축|재개발|공사|건설|현장|아파트|공동주택|신축공사|증축공사|건축공사|토목공사|공구|단지)$/;
const SITE_SUFFIX = /(?:아파트|신축공사|증축공사|건축공사|리모델링|공사|센터|타워|빌딩|오피스텔|단지|지구|캠퍼스|공장|병원|학교|호텔|리조트|프로젝트|푸르지오|자이|힐스테이트|래미안|아이파크|캐슬|편한세상|더샵|뷰|포레나|센트럴|파크|시티|하임|트윈|스퀘어)$/;
const MEETING_CUE = /회의|TBM|티비엠|안전점검|작업전|시작|인사|모이|모였/i;

function cleanSite(phrase) {
  let tokens = oneLine(phrase).split(" ").filter(Boolean);
  while (tokens.length && (SITE_STOP.test(tokens[0]) || /(?:부터|까지|하세요|합니다|입니다|에서|께서)$/.test(tokens[0]))) tokens.shift();
  while (tokens.length && SITE_STOP.test(tokens[tokens.length - 1])) tokens.pop();
  tokens = tokens.map((t) => t.replace(/(?:에서|에는|에|의|은|는|이|가)$/, (x) => (t.length > 3 ? "" : x)));
  const s = tokens.join(" ").trim();
  if (s.length < 2 || s.length > 28) return "";
  if (tokens.every((t) => SITE_GENERIC.test(t) || SITE_STOP.test(t))) return "";
  return s;
}

function findSite(sentences) {
  for (const s of sentences.slice(0, 14)) {
    let m = /현장\s*명\s*(?:은|이|:)?\s*([가-힣A-Za-z0-9·\-]+(?:\s[가-힣A-Za-z0-9·\-]+){0,3})/.exec(s.text);
    if (m) {
      const v = cleanSite(m[1].replace(/\s*(?:입니다|이에요|이고|이며)\s*$/, ""));
      if (v) return { value: v, idx: s.i };
    }
    m = /((?:[가-힣A-Za-z0-9·\-]+\s+){0,3}[가-힣A-Za-z0-9·\-]+)\s*현장(?=[\s,]|에서|에|의|은|는|이|입니다|$)/.exec(s.text);
    if (m) {
      const v = cleanSite(m[1]);
      // "아침 일찍 현장에서"처럼 현장 이름이 아닌 말을 거르려고, 회의 시작 말이거나 현장 이름다운 끝말일 때만 받는다
      if (v && (SITE_SUFFIX.test(v) || MEETING_CUE.test(s.sq))) return { value: v, idx: s.i };
    }
  }
  return { value: "", idx: -1 };
}

// ---------------------------------------------------------------- 참석 인원

const ATT_STRONG = /참석|출석|인원|전원|총원|모인|출역|투입|근로자|작업자|인력/;
const NOT_ATT = /신규|외국인|결원|결근|불참|휴가|신호수|유도원|감시|혈압|건강|아프|교육대상|이수|통역|보조|지원|연장|명확|명단|명령|유명|단위/;

function findHeadcount(sentences) {
  let best = null;
  sentences.forEach((s, i) => {
    if (!ATT_STRONG.test(s.sq)) return;
    let h;
    try {
      h = checkWorkLogInfo(s.text.replace(/(열|스물|서른|마흔|쉰|예순|일흔|여든|아흔)\s+(한|두|세|네|다섯|여섯|일곱|여덟|아홉)(?=\s*[명분])/g, "$1$2")).headcount;
    } catch {
      return;
    }
    if (!h || !h.ok || !h.count) return;
    const score = (/참석|출석|전원|총원|모인|출역/.test(s.sq) ? 3 : /인원/.test(s.sq) ? 2 : 1) - (NOT_ATT.test(s.sq) ? 3 : 0) - (i > 30 ? 1 : 0);
    if (score < 1) return;
    if (!best || score > best.score) best = { score, count: h.count, idx: s.i };
  });
  return best ? { value: String(best.count), idx: best.idx } : { value: "", idx: -1 };
}

// ---------------------------------------------------------------- 작업 내용

const WORK_CUE = /(?:오늘|금일|이번)\s*(?:의)?\s*(?:주요\s*)?(?:작업|공정|일정|할\s*일|업무|공사)(?!자|인원)|작업\s*내용|작업\s*(?:예정|계획|사항|일정)/;
const WORK_CUE_STRIP = /(?:오늘|금일|이번)\s*(?:의)?\s*(?:주요\s*)?(?:작업|공정|일정|할\s*일|업무|공사)(?!자|인원)\s*(?:내용)?\s*(?:은|는|으로는|으로|을|를|이|가|:)?|작업\s*(?:내용|예정|계획|사항|일정)\s*(?:은|는|으로는|으로|을|를|이|가|:)?/g;
const WORK_TAIL = /(?:\s*(?:작업|공사|시공|진행|예정|실시|있습니다|있어요|입니다|합니다|하겠습니다|할\s*예정입니다|할\s*예정|이\s*있습니다|가\s*있습니다|이\s*예정|이\s*진행|을\s*합니다|를\s*합니다|도\s*있습니다|도\s*합니다|이에요|예요|이다|합니다))+$/;
const WORK_STOP = new Set(["오늘", "금일", "작업", "공사", "시공", "진행", "예정", "이번", "다음", "그리고", "먼저", "우선", "그", "이", "저", "내용", "관련", "대한", "위한", "주요", "및", "등", "다음으로", "그다음에", "그리고는", "이어서", "우리", "저희"]);
const WORK_SKIP = /말씀|설명|공유|발표|안내|드리겠|회의|전달|시작|인원|명입니다/;

// 오늘 할 작업을 말한 문장인가: "오늘 작업은 …"이거나 "오늘 우리는 102동 5층 배관 작업합니다"처럼 오늘 + 장소 + 작업합니다
function isWorkSentence(s) {
  if (s.question) return false;
  if (s.workCue) return true;
  if (s.hazard || !s.hasPlace) return false;
  return /^(?:(?:자|그럼|먼저|그리고|우선|네)\s+)*(?:오늘|금일|이번)/.test(s.text) && /(?:작업|공사|시공)(?:을|를)?(?:합니다|하겠습니다|할예정|해요|한다)|(?:작업|공사)$/.test(s.sq);
}

function workPhrases(texts) {
  const out = [];
  for (const t of texts) {
    let s = t.replace(WORK_CUE_STRIP, " ").replace(RE_PLACE, " | ");
    s = s.replace(/(?:^|\s)(?:우리는|저희는|우리가|우리|저희|오늘은|오늘|금일|이번|지금부터)(?=\s|$)/g, " ");
    s = s.replace(/([가-힣])(?:과|와)\s+/g, "$1|").replace(/\s*(?:,|·|\/|그리고|및|하고|랑|이랑)\s*/g, "|");
    for (let part of s.split("|")) {
      part = oneLine(part)
        .replace(WORK_TAIL, "")
        .replace(/[을를이가은는도로]$/, (x, off, all) => (all.length > 3 ? "" : x))
        .replace(/(?:과|와)$/, (x, off, all) => (all.length > 3 ? "" : x))
        .trim();
      part = part.replace(/^(?:에서는|에서|에는|에|의|으로|로|오늘|금일|이번|그리고|먼저|우선|다음으로|지금부터|자|네)(?:\s+|$)/, "").trim();
      if (part.length < 2 || WORK_STOP.has(part) || WORK_SKIP.test(part)) continue;
      if (!/[가-힣A-Za-z]{2,}/.test(part)) continue;
      if (/\d$/.test(part) && part.length < 4) continue;
      if (!out.includes(part)) out.push(part);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 점검 항목

const CHECK_RULES = {
  protect: { topic: /보호구|안전모|턱끈|안전대|안전화|보안경|안전벨트|안전띠|착용상태|복장/, act: /확인|점검|이상|상태|검사|착용했|착용하고\s*있|지급/ },
  health: { topic: /건강|컨디션|음주|혈압|몸상태|몸이|아프|피로|졸림|질병|체온|수면|문진/, act: /확인|점검|상태|체크|괜찮|이상|문진|측정|물어/ },
  newcomer: { topic: /신규|외국인|신입|처음|통역|이주|베트남|중국|조선족|태국|네팔|우즈베키스탄|캄보디아|필리핀|인도네시아|몽골|스리랑카|미얀마|카자흐스탄|러시아/, act: /확인|교육|지정|위치|배치|안내|통역|이수|소개|투입|인사|오셨|왔|새로/ },
  equipment: { topic: /신호수|유도원|작업반경|회전반경|장비|굴착기|포크레인|크레인|지게차|덤프|고소작업대|양중/, act: /배치|확인|통제|반경|출입|금지|점검|신호/ },
  weather: { topic: /날씨|기상|강풍|바람|비가|비예보|비온|비오|비와|비올|우천|폭염|더위|한파|추위|눈이|눈온|눈오|태풍|장마|미세먼지|기온|예보|풍속|호우/, act: /확인|예보|조정|주의|중지|대비|예상|예정|온다|옵니다|내립|불어|분다|중단|하니까|한다고/ },
};
const CHECK_WORDS = /보호구|안전모|턱끈|안전대|안전화|보안경|착용|건강|컨디션|음주|혈압|상태|확인|점검|이상|없습니다|했습니다|하였습니다|모두|전원|전부|다|오늘|아침|작업자|신호수|유도원|배치|반경|장비|크레인|지게차|굴착기|양중|통제|출입|금지|체크|신규|외국인|근로자|신입|위치|지정|교육|투입|통역|처음|했고|했는데|했으며|하였|되었|됐|받았|습니다|합니다|입니다|두명|세명|한명/g;

const WEATHER_WORDS = /날씨|기상|예보|강풍|바람|비가|우천|폭염|한파|풍속|기온/g;

function readChecks(sentences) {
  const out = { protect: false, health: false, newcomer: false, equipment: false, weather: false };
  const only = new Set(); // 확인만 한 말(교육·전달 사항에 또 적지 않는다)
  const partly = new Set(); // 확인에 덧붙인 말이 있는 문장(덧붙인 말만 교육·전달 사항에 적는다)
  for (const s of sentences) {
    let confirm = false;
    for (const k of CHECK_KEYS) {
      const r = CHECK_RULES[k];
      if (r.topic.test(s.sq) && r.act.test(s.sq)) {
        out[k] = true;
        if (k !== "newcomer") confirm = true; // 신규 근로자 이야기는 교육·전달 사항에 남긴다
      }
    }
    if (confirm) {
      const rest = s.sq.replace(CHECK_WORDS, "").replace(WEATHER_WORDS, "").replace(/[은는이가을를에의도로과와만]/g, "");
      if (rest.length < 8) only.add(s.i);
      else partly.add(s.i);
    }
  }
  return { checks: out, only, partly };
}

// ---------------------------------------------------------------- 문장 하나 살펴보기

const OPENER = /(?:회의|TBM|티비엠|미팅|조회).{0,8}(?:시작|개시)|시작.{0,6}(?:회의|TBM|티비엠)/i;
const ANN = /내일|모레|다음주|이번주|전달|공지|안내|감리|본사|발주처|협조|점심|교육|건의|참고/;

function analyze(text, i) {
  const sq = squash(text);
  const clean = hazardTest(sq);
  const lead = oneLine(text).replace(LEAD_FILLERS, "").replace(LEAD_ENUM, "");
  const mlabelStart = MEASURE_LABEL.test(lead);
  const imper = IMPER.test(text) || IMPER.test(sq);
  const measure = M_WORD.test(sq) || mlabelStart || (imper && !GREET.test(sq) && !INFO.test(sq));
  const strong = !mlabelStart && (H_EVENT.test(clean) || (H_STATE.test(clean) && !(measure && imper)));
  const weak = !strong && !mlabelStart && H_WEAK.test(clean) && CAUTION.test(clean);
  return {
    i,
    text,
    sq,
    hazard: strong || weak,
    strong,
    measure,
    imper,
    mlabelStart,
    enumStart: ENUM_START.test(oneLine(text)),
    label: /위험요인|위험요소/.test(sq),
    info: INFO.test(sq),
    ann: ANN.test(sq),
    greet: GREET.test(sq) || OPENER.test(sq),
    opener: OPENER.test(sq) && !H_EVENT.test(clean),
    question: QUESTION.test(sq) || /[?？]$/.test(text),
    workCue: WORK_CUE.test(text),
    hasPlace: (RE_PLACE.lastIndex = 0, RE_PLACE.test(text)),
  };
}

// ---------------------------------------------------------------- 한 문장 안의 위험과 대책 나누기

// 위험요인은 X이고 대책은 Y입니다
const SPLIT_LABEL = /^(.+?)(?:\s*,\s*|이고요|이고|이며|입니다|이구요|인데)\s*(?:그리고\s*)?(?:대책|조치|예방\s*대책|안전\s*대책)\s*(?:은|는|으로는|으로|:)\s*(.+)$/;
// 추락 위험이 있는 곳에는 안전난간을 설치하세요
const SPLIT_PLACE = /^(.*?(?:위험|우려|가능성|염려)\S*?\s*(?:이|가)?\s*있는\s*(?:곳|장소|구간|부위|작업|경우|개소)\S*)\s+(.+)$/;
// 추락 방지를 위해 안전난간을 설치하세요
const SPLIT_PURPOSE = /^(.+?)\s*(?:을|를|이|가)?\s*(?:방지하기|예방하기|방지|예방|막기|막으려)\s*(?:를|을)?\s*(?:위해서는|위해서|위하여|위해|위한)\s+(.+)$/;
// 추락하지 않도록 안전대를 착용하세요
const SPLIT_AVOID = /^(.+?)(?:하|되)?지\s*않도록\s+(.+)$/;
// 앞뒤를 이은 낱말: "위험이 있으니 …", "미끄러우니 …", "예보가 있으므로 …"
const CONNECT_TOKEN = /(?:으니까|으니|우니|하니까|하니|되니까|되니|이니까|이니|니까|므로|어서|아서|해서|라서|는데|인데|한데|때문에)$/;
const NOUN_EVENT = /추락|낙하|협착|감전|누전|화재|붕괴|전도|질식|충돌|도괴|비래|폭발|중독|매몰|침하|화상|절단/;

function splitClause(text) {
  const tokens = oneLine(text).split(" ");
  for (let k = 1; k < tokens.length - 1; k += 1) {
    if (!CONNECT_TOKEN.test(stripPunct(tokens[k]))) continue;
    const before = tokens.slice(0, k + 1).join(" ");
    const after = tokens.slice(k + 1).join(" ");
    const bq = hazardTest(squash(before));
    if (!H_EVENT.test(bq) && !H_STATE.test(bq)) continue; // 앞부분이 위험을 말해야 한다
    if (!M_WORD.test(squash(after)) || squash(after).length < 5) continue;
    return { hazard: before, measure: after };
  }
  return null;
}

function splitHazardMeasure(text) {
  let m = SPLIT_LABEL.exec(text);
  if (m && squash(m[1]).length >= 3) return { hazard: m[1], measure: m[2] };
  const c = splitClause(text);
  if (c) return c;
  m = SPLIT_PLACE.exec(text);
  if (m && M_WORD.test(squash(m[2]))) return { hazard: m[1], measure: m[2] };
  m = SPLIT_PURPOSE.exec(text);
  if (m && squash(m[1]).length >= 2 && H_EVENT.test(hazardTest(squash(m[1]))) && M_WORD.test(squash(m[2]))) return { hazard: m[1], measure: m[2] };
  m = SPLIT_AVOID.exec(text);
  if (m && squash(m[1]).length >= 2 && H_EVENT.test(hazardTest(squash(m[1]))) && M_WORD.test(squash(m[2]))) {
    const h = oneLine(m[1]);
    return { hazard: NOUN_EVENT.test(h) ? h : `${h}지 않도록`, measure: m[2] };
  }
  return null;
}

// "네 번째로 양중 작업 시 신호수를 배치하고 …"처럼 위험 낱말 없이 번호를 붙여 말한 항목: "양중 작업 시"를 위험요인 자리에, 나머지를 대책 자리에
function topicRow(s) {
  const body = stripLead(s.text);
  const m = /^(.+?\s(?:시|때|중|경우|동안))\s+(.+)$/.exec(body) || /^(.+?(?:할\s*때는|할\s*때|때는|시에는|시에))\s+(.+)$/.exec(body);
  if (!m || !M_WORD.test(squash(m[2]))) return null;
  const hazard = m[1].replace(/\s*(?:할\s*때는|할\s*때|때는|시에는|시에|시|때|중|경우|동안)$/, "").trim();
  if (squash(hazard).length < 2) return null;
  return { hazard, measure: m[2] };
}

// ---------------------------------------------------------------- 위험요인·대책 줄 만들기

function riskScore(r) {
  return (r.place ? 2 : 0) + (r.strong ? 2 : 0) + (r.measures.length ? 1 : 0) + (r.explicit ? 2 : 0) + (r.topic ? -1 : 0);
}

// 앞 문장의 "~할 때는"을 짧은 위험 말 앞에 붙이는 데 쓰는 틀
const TRIGGER = /^(.+?(?:때는|때에는|때|시에는|시|경우에는|경우|중에는|중에))\s+(.+)$/;

function buildRows(sentences, skip) {
  const rows = [];
  const pending = []; // 위험요인보다 먼저 나온 대책 문장
  const leftovers = []; // 어느 위험요인에도 못 붙인 대책 문장(교육·전달 사항 후보)
  let open = null; // 대책을 붙여 갈 줄
  let lastIdx = -99;
  const seen = new Set();
  const keyOf = (t) => squash(t).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

  const addRow = (s, hazardText, measureText, extra = {}) => {
    const hz = bullet(hazardText, TBM_LIMITS.hazard);
    if (!hz || squash(hz).length < 2) return null;
    const k = keyOf(hz);
    if (seen.has(k)) return null; // 같은 말을 두 번 받아 적은 경우
    seen.add(k);
    const row = { hazard: hz, measures: [], place: s.hasPlace, strong: s.strong, explicit: s.label, idx: s.i, used: [s.i], ...extra };
    const mm = measureText ? bullet(measureText, TBM_LIMITS.measure) : "";
    if (mm) row.measures.push(mm);
    rows.push(row);
    open = row;
    lastIdx = s.i;
    return row;
  };
  const attach = (row, s) => {
    const mm = bullet(s.text, TBM_LIMITS.measure);
    if (!mm) return false;
    row.measures.push(mm);
    row.used.push(s.i);
    lastIdx = s.i;
    return true;
  };

  for (let n = 0; n < sentences.length; n += 1) {
    const s = sentences[n];
    if (skip.has(s.i) || s.question || isAnnounce(s.text)) continue;
    const nxt = sentences[n + 1];
    const nextIsHazardOnly = !!nxt && !skip.has(nxt.i) && nxt.hazard && !nxt.measure && !nxt.enumStart;

    if (s.hazard) {
      const sp = splitHazardMeasure(s.text);
      let hzText = sp ? sp.hazard : s.text;
      let mText = sp ? sp.measure : "";
      let used = null;
      const p = pending[pending.length - 1];
      if (!mText && p && s.i - p.i <= 1) {
        used = p;
        mText = p.text;
        // 위험 말이 짧으면("넘어지면 큰일 납니다") 앞 문장의 "사다리 쓸 때는"을 앞에 붙인다
        if (squash(bullet(hzText, TBM_LIMITS.hazard)).length <= 12) {
          const t = TRIGGER.exec(stripLead(p.text));
          if (t && M_WORD.test(squash(t[2]))) {
            hzText = `${t[1]} ${hzText}`;
            mText = t[2];
          }
        }
      }
      const row = addRow(s, hzText, mText);
      if (row && used) {
        pending.pop();
        row.used.push(used.i);
      }
      continue;
    }

    if (s.measure && (s.imper || s.mlabelStart || s.enumStart || !s.info)) {
      const gap = s.i - lastIdx;
      if (s.enumStart) {
        // 번호를 붙여 새 항목을 시작한 말
        const t = topicRow(s);
        if (t) addRow(s, t.hazard, t.measure, { topic: true });
        else {
          leftovers.push(s);
          open = null;
        }
      } else if (s.mlabelStart && open && gap <= 3) {
        attach(open, s);
      } else if (open && gap <= 1 && open.measures.length === 0) {
        attach(open, s);
      } else if (nextIsHazardOnly) {
        pending.push(s);
      } else if (open && gap <= 2 && open.measures.length < 3 && !s.ann) {
        attach(open, s);
      } else {
        leftovers.push(s);
      }
    }
    // 그 밖의 문장은 건너뛴다
  }
  const unused = pending.filter((p) => !rows.some((r) => r.used.includes(p.i)));
  return { rows, leftovers: leftovers.concat(unused) };
}

// ---------------------------------------------------------------- 교육·전달 사항

// 긴 문장을 "~해 주시고"에서 끊는다("내일 감리 점검이 있으니 정리정돈 해 주시고 | 폭염 주의보가 예상되니 물을 자주 마시고")
function splitClauses(text) {
  const t = oneLine(text);
  if (t.length < 40) return [t];
  const out = [];
  let cur = [];
  for (const tk of t.split(" ")) {
    cur.push(tk);
    if (cur.length >= 3 && /(?:주시고|주시고요|하시고|하시고요|드리고|드리며|하시며|부탁드리고|바라며)$/.test(stripPunct(tk))) {
      out.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(" "));
  // 너무 짧은 끝 조각은 앞 조각에 붙인다
  if (out.length > 1 && squash(out[out.length - 1]).length < 6) out[out.length - 2] += ` ${out.pop()}`;
  return out;
}

// "작업자 건강 상태도 확인했는데 혈압이 높으신 분은 낮은 곳에서만 작업하기로 했습니다" → 확인한 부분은 점검 항목에 있으니 덧붙인 말만
function afterConfirm(text) {
  const m = /^(.*?(?:했는데|했으며|했고|했으나|하였는데|한데))\s+(.+)$/.exec(oneLine(text));
  return m && squash(m[2]).length >= 10 ? m[2] : text;
}

function buildNotes(sentences, skip, extra, partly) {
  const list = [];
  const seen = new Set();
  const add = (text, score, idx) => {
    const b = bullet(text, TBM_LIMITS.note);
    if (!b || squash(b).length < 4) return;
    const k = squash(b).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ text: b, score, idx });
  };
  for (const s of sentences) {
    if (skip.has(s.i) || s.question || isAnnounce(s.text)) continue;
    if (!(s.info || (s.measure && s.imper) || s.hazard)) continue;
    if (s.opener || (s.greet && !(s.info || s.hazard))) continue;
    const t = partly.has(s.i) ? afterConfirm(s.text) : s.text;
    for (const c of splitClauses(t)) {
      const cq = squash(c);
      if (!(INFO.test(cq) || (M_WORD.test(cq) && IMPER.test(cq)) || s.hazard || partly.has(s.i))) continue;
      let score = 1;
      if (/전달|공지|안내|예정|내일|예보|주의보|교육|감리|협조|금지|반드시|꼭/.test(cq)) score += 2;
      if (IMPER.test(cq) || IMPER.test(c)) score += 1;
      add(c, score, s.i);
    }
  }
  // 칸이 모자라 위험요인 표에 못 넣은 것은 한 줄로 합쳐서 남긴다
  if (extra.length) {
    const lines = [];
    let cur = "";
    for (const h of extra) {
      const next = cur ? `${cur}, ${h}` : h;
      if (cur && next.length > TBM_LIMITS.note - 12) {
        lines.push(cur);
        cur = h;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    lines.forEach((l, n) => add(`${n === 0 ? "그 밖의 위험요인: " : "· "}${l}`, 9, 1e6 + n));
  }
  // 점수가 높은 것을 고르되 말한 순서는 지킨다
  return list
    .map((x, n) => ({ ...x, n }))
    .sort((a, b) => b.score - a.score || a.n - b.n)
    .slice(0, TBM_NOTES_MAX)
    .sort((a, b) => a.n - b.n)
    .map((x) => x.text);
}

// ---------------------------------------------------------------- 본체

// rawText: 받아 적은 글, opts: { from: "07:30", to: "07:35" }(녹음 시작·끝 시각, 없으면 빈 칸)
// 반환: { fields(cleanTbmFields 모양), missing(tbmMissing), stats }
export function summarizeTbm(rawText, opts = {}) {
  const f = emptyTbmFields();
  f.from = cleanClock(opts && opts.from);
  f.to = cleanClock(opts && opts.to);
  let stats = { sentences: 0, hazards: 0, rows: 0 };
  try {
    const sentences = splitSentences(rawText).map((t, i) => analyze(t, i));
    stats.sentences = sentences.length;
    if (sentences.length > 0) {
      const skip = new Set(); // 다른 칸에 쓴 문장(교육·전달 사항·위험요인에 또 넣지 않는다)
      const usedFor = (idx) => {
        const s = sentences[idx];
        if (s && !s.hazard) skip.add(idx);
      };

      // 현장명 · 진행자 · 참석 인원
      const site = findSite(sentences);
      const leader = findLeader(sentences);
      const head = findHeadcount(sentences);
      f.site = site.value;
      f.leader = leader.value;
      f.headcount = head.value;
      [site.idx, leader.idx, head.idx].forEach((i) => i >= 0 && usedFor(i));

      // 작업 장소 · 작업 내용
      const workAll = sentences.filter((s) => isWorkSentence(s));
      workAll.forEach((s) => {
        if (isAnnounce(s.text) || coreLength(s.text.replace(WORK_CUE_STRIP, " ").replace(RE_PLACE, " ")) < 2) skip.add(s.i);
      });
      const workSents = workAll.filter((s) => !skip.has(s.i));
      workSents.forEach((s) => {
        if (!s.hazard) skip.add(s.i);
      });
      const placeTexts = (workSents.length ? workSents : sentences.slice(0, 40)).map((s) => s.text);
      f.place = cutText(readPlaces(placeTexts).join(", "), TBM_LIMITS.place);
      if (!f.place && workSents.length) f.place = cutText(readPlaces(sentences.map((s) => s.text)).slice(0, 4).join(", "), TBM_LIMITS.place);
      f.work = cutText(workPhrases(workSents.map((s) => s.text)).slice(0, 8).join(", "), TBM_LIMITS.work);

      // 점검 항목
      const { checks, only, partly } = readChecks(sentences);
      f.checks = checks;
      for (const i of only) {
        const s = sentences[i];
        if (!s.hazard) skip.add(i);
      }

      // 위험요인 · 대책
      const { rows } = buildRows(sentences, skip);
      let kept = rows;
      let extra = [];
      if (rows.length > TBM_RISK_MAX) {
        const ranked = rows.map((r, n) => ({ r, n, sc: riskScore(r) })).sort((a, b) => b.sc - a.sc || a.n - b.n);
        const keepSet = new Set(ranked.slice(0, TBM_RISK_MAX).map((x) => x.n));
        kept = rows.filter((_, n) => keepSet.has(n));
        extra = rows.filter((_, n) => !keepSet.has(n)).map((r) => r.hazard);
      }
      f.risks = kept.map((r) => ({ hazard: r.hazard, measure: cutText(r.measures.join(", "), TBM_LIMITS.measure) }));
      for (const r of rows) for (const i of r.used) skip.add(i);
      stats.hazards = rows.length;

      // 교육·전달 사항
      f.notes = buildNotes(sentences, skip, extra, partly);
    }
  } catch {
    // 어떤 글이 와도 던지지 않는다: 읽은 데까지만 돌려준다
  }
  const out = cleanTbmFields(f);
  stats = { ...stats, rows: out.risks.length };
  return { fields: out, missing: tbmMissing(out), stats };
}

// ---------------------------------------------------------------- 말하기 예문 (화면의 안내 카드)

// 한 문장씩, 어느 칸이 채워지는지와 함께. 예문대로 말하면 칸이 채워지는지는 시험이 지킨다.
export const TBM_EXAMPLE = [
  { no: 1, fills: ["현장명", "진행자"], text: "OO아파트 신축공사 현장 작업 전 안전점검회의를 시작하겠습니다. 진행은 OO건설 홍길동 소장입니다." },
  { no: 2, fills: ["참석 인원"], text: "오늘 참석 인원은 12명입니다." },
  { no: 3, fills: ["작업 장소", "작업 내용"], text: "오늘 작업은 101동 3층 도배, 102동 지하 1층 방수입니다." },
  { no: 4, fills: ["위험요인", "대책"], text: "첫 번째 위험요인은 101동 3층 개구부 추락입니다. 대책으로 안전난간을 설치하고 안전대를 착용하겠습니다. 두 번째 위험요인은 102동 지하 1층 방수 작업 중 질식입니다. 대책으로 환기팬을 가동하고 산소 농도를 측정하겠습니다." },
  { no: 5, fills: ["점검 항목"], text: "보호구 착용 상태와 작업자 건강 상태를 확인했습니다. 신규 근로자는 작업 위치를 지정했고 장비 작업 반경과 신호수 배치도 확인했습니다. 오늘 기상 예보도 확인했습니다." },
  { no: 6, fills: ["교육·전달 사항"], text: "전달 사항입니다. 오후에 비 예보가 있으니 작업 전 기상을 확인해 주세요. 작업이 끝나면 정리정돈 해 주세요." },
];
export const TBM_EXAMPLE_TEXT = TBM_EXAMPLE.map((p) => p.text).join(" ");

// 요약에서 못 찾은 칸을 알릴 때 보여 줄 칸 이름과 말하기 예문(tbmMissing의 이름표와 같은 이름). 예문 한 문장만 말해도 그 칸이 채워지는지는 시험이 지킨다.
export const TBM_MISSING_HINTS = {
  site: { label: "현장명", example: "OO아파트 신축공사 현장 작업 전 안전점검회의를 시작하겠습니다." },
  leader: { label: "진행자", example: "진행은 OO건설 홍길동 소장입니다." },
  headcount: { label: "참석 인원", example: "오늘 참석 인원은 12명입니다." },
  place: { label: "작업 장소", example: "오늘 작업은 101동 3층 도배입니다." },
  work: { label: "작업 내용", example: "오늘 작업은 101동 3층 도배입니다." },
  risks: { label: "위험요인", example: "첫 번째 위험요인은 101동 3층 개구부 추락입니다." },
  measures: { label: "대책", example: "첫 번째 위험요인은 101동 3층 개구부 추락입니다. 대책으로 안전난간을 설치하겠습니다." },
};
