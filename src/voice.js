// 음성 검측(VOICE-LOCK): 공종 정보, 현장 은어 → 표준 용어 변환, 요약 문장 만들기, 위치(동·층) 도우미, 음성 인식 객체.
// 화면에 보이는 문구는 i18n.js(voice.*)에 있고, 여기에는 저장되는 데이터(한국어 표준 용어)와 계산 로직만 둔다.

// 공종 4가지. color는 화면 테마색, badge는 영문 표시. (철근·설비·형틀은 작업 보고, 품질 승인은 타설 허가 보고)
export const VOICE_TRADES = [
  { id: "rebar", color: "#1D4ED8", badge: "REBAR" },
  { id: "mep", color: "#D97706", badge: "MEP" },
  { id: "formwork", color: "#EA580C", badge: "FORMWORK" },
  { id: "qc", color: "#15803D", badge: "QC" },
];

export function getTrade(id) {
  return VOICE_TRADES.find((t) => t.id === id) || VOICE_TRADES[0];
}

export const VOICE_LIMITS = {
  rawText: 1000, // 저장하는 발화 원문 최대 글자 수
  elem: 40, // 부재 이름 최대 글자 수
  typedText: 500, // 직접 입력할 때 입력창에 넣을 수 있는 최대 글자 수
};

// 부재 이름 입력 칸에 제안으로 보여줄 예시들(직접 입력도 자유롭게 가능).
export const ELEM_SUGGESTIONS = ["C1 기둥", "C2 기둥", "G1 보", "S1 슬래브", "W1 벽체"];

// ---------------- 용어 DB: 현장 은어 → 표준 용어 ----------------
// 실제로 쓰이는 표는 관리자 화면의 "용어 DB" 탭에서 고치는 표(Firestore meta/glossary)다.
// 아래 목록은 "기본 용어"로, 그 표를 관리자가 한 번도 고치지 않았을 때만 그대로 쓰이고(= 탭에도 이 9개가 처음 행으로 보인다),
// 표가 한 번 저장된 뒤에는 저장된 표가 이 목록을 완전히 대신한다(지운 용어는 더 이상 바뀌지 않는다).
export const SLANG_RULES = [
  ["하리", "보(Beam)"],
  ["오사마리", "시공 완료"],
  ["시로바리", "띠철근/스트럽 결속"],
  ["나라시", "고르기/다짐"],
  ["공구리", "콘크리트"],
  ["바라시", "탈형(거푸집 해체)"],
  ["가꾸목", "각재"],
  ["덴바", "상단 마감선"],
  ["메지", "줄눈"],
];

// 표 한 칸의 최대 글자 수와 표 전체의 최대 줄 수. (표 전체가 문서 1개에 들어가므로 줄 수에 상한을 둔다)
export const GLOSSARY_LIMITS = { slang: 40, standard: 80, max: 2000 };

// 기본 용어를 표의 행({ id, slang, standard }) 모양으로 만든다. id(d1, d2…)는 표에 저장된 뒤에도 그대로 유지된다.
export function defaultGlossary() {
  return SLANG_RULES.map(([slang, standard], i) => ({ id: `d${i + 1}`, slang, standard }));
}

const DEFAULT_TERMS = defaultGlossary();

// 입력값 정리: 연속 공백은 하나로, 앞뒤 공백은 지운다.
export function cleanTermText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

// 은어끼리 같은 말인지 비교하는 키: 공백을 모두 없애고 소문자로 바꾼다. ("오사 마리" = "오사마리", "H빔" = "h빔")
export function slangKey(value) {
  return String(value == null ? "" : value).replace(/\s+/g, "").toLowerCase();
}

// 저장소에서 읽은 값을 그대로 믿지 않고 표의 행으로 걸러 낸다.
// 은어·표준 용어 중 하나라도 비었거나 글자가 아닌 값이면 버리고, 같은 은어가 두 번 나오면 먼저 나온 것만 남긴다.
export function sanitizeGlossary(list) {
  if (!Array.isArray(list)) return [];
  const seenKeys = new Set();
  const seenIds = new Set();
  const out = [];
  list.forEach((row, i) => {
    if (!row || typeof row !== "object") return;
    const slang = cleanTermText(row.slang).slice(0, GLOSSARY_LIMITS.slang);
    const standard = cleanTermText(row.standard).slice(0, GLOSSARY_LIMITS.standard);
    const key = slangKey(slang);
    if (!slang || !standard || !key || seenKeys.has(key)) return;
    seenKeys.add(key);
    let id = typeof row.id === "string" && row.id ? row.id : `x${i + 1}`;
    while (seenIds.has(id)) id += "_";
    seenIds.add(id);
    out.push({ id, slang, standard });
  });
  return out;
}

// 표에 새 용어를 넣거나(selfId 없음) 한 줄을 고칠 때(selfId = 고치는 줄의 id) 값이 괜찮은지 본다.
// 괜찮으면 { code: "ok", slang, standard }(정리된 값), 아니면 { code: 이유 }를 돌려준다.
export function checkTerm(input, terms, selfId = "") {
  const slang = cleanTermText(input && input.slang);
  const standard = cleanTermText(input && input.standard);
  if (!slang) return { code: "empty-slang" };
  if (!standard) return { code: "empty-standard" };
  if (slang.length > GLOSSARY_LIMITS.slang) return { code: "long-slang" };
  if (standard.length > GLOSSARY_LIMITS.standard) return { code: "long-standard" };
  if (!/[\p{L}\p{N}]/u.test(slang)) return { code: "no-letter" }; // 기호만 있는 은어는 문장 곳곳을 바꿔 버린다
  const key = slangKey(slang);
  if (key === slangKey(standard)) return { code: "same" };
  const list = Array.isArray(terms) ? terms : [];
  const clash = list.find((t) => t.id !== selfId && slangKey(t.slang) === key);
  if (clash) return { code: "duplicate", existing: clash };
  if (!selfId && list.length >= GLOSSARY_LIMITS.max) return { code: "full" };
  return { code: "ok", slang, standard };
}

// 표의 내용으로 만든 짧은 지문(문자열). 저장된 음성 기록에 표를 다시 적용할 때 "마지막으로 적용한 표와 지금 표가 같은가"를 견주는 데 쓴다.
// 줄의 id와 저장 시각은 문장을 바꾸는 결과에 영향이 없으므로 넣지 않고, 은어·표준 용어와 줄의 순서(같은 길이의 은어끼리는 순서가 결과를 정한다)만 본다.
// 같은 내용이면 어느 기기에서 계산해도 같은 값이 나온다. (cyrb53 - 외부 라이브러리 없이 정수 연산만 쓴다)
export function glossaryHash(terms) {
  const rows = sanitizeGlossary(terms);
  let s = String(rows.length);
  for (const t of rows) s += `\u0001${t.slang}\u0002${t.standard}`;
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// checkTerm / 저장소가 돌려주는 이유 코드에 대한 안내 문구(관리자 화면은 한국어만 쓴다).
export const GLOSSARY_MESSAGES = {
  "empty-slang": "현장 은어를 입력해 주세요.",
  "empty-standard": "표준 용어를 입력해 주세요.",
  "long-slang": `현장 은어는 ${GLOSSARY_LIMITS.slang}자 이하로 적어 주세요.`,
  "long-standard": `표준 용어는 ${GLOSSARY_LIMITS.standard}자 이하로 적어 주세요.`,
  "no-letter": "글자나 숫자가 들어 있는 은어를 입력해 주세요.",
  same: "현장 은어와 표준 용어가 같아서 바뀌는 게 없어요.",
  duplicate: "이미 표에 있는 은어예요. 그 줄을 고쳐 주세요.",
  full: `표에는 용어를 ${GLOSSARY_LIMITS.max}개까지 넣을 수 있어요.`,
  "not-found": "이미 지워졌거나 바뀐 용어예요. 목록을 새로 불러왔어요.",
  "no-rows": "올릴 수 있는 용어가 없어요. 파일의 내용을 확인해 주세요.",
  "table-changed": "그 사이 용어 표가 바뀌었어요. 미리보기를 다시 해 주세요.",
};

// ---- 문장 속에서 은어 찾기 ----
// 정규식 하나로 합치면 은어가 수백~수천 개일 때 느려지거나 아예 만들어지지 않는 경우가 있어, 글자를 직접 비교한다.
// 은어를 첫 글자별로 묶어 두고, 문장의 각 글자에서는 그 글자로 시작하는 묶음만 확인한다.
// 결과는 "가장 왼쪽에서 시작하는 것, 같은 자리에서는 가장 긴 은어 먼저"이고, 바뀐 부분은 다시 훑지 않는다.

// 글자(코드 포인트) 하나의 소문자. 대소문자가 없는 글자(한글 등)는 그대로이고, 소문자가 한 글자로 정해지지 않는 드문 글자는 -1.
function lowerCp(cp) {
  if (cp < 128) return cp >= 65 && cp <= 90 ? cp + 32 : cp;
  if (cp >= 0xac00 && cp <= 0xd7a3) return cp; // 한글 음절
  const lower = String.fromCodePoint(cp).toLowerCase();
  const lc = lower.codePointAt(0);
  return lower.length === (lc > 0xffff ? 2 : 1) ? lc : -1;
}

// 띄어쓰기·줄바꿈 등 공백 글자(정규식 \s와 같은 범위)
function isSpaceCp(cp) {
  return (
    cp === 32 || (cp >= 9 && cp <= 13) || cp === 0xa0 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200a) ||
    cp === 0x2028 || cp === 0x2029 || cp === 0x202f || cp === 0x205f || cp === 0x3000 || cp === 0xfeff
  );
}

// 문장 src의 i번째 글자부터 은어(cand)가 그대로 이어지면 그 끝 위치를, 아니면 -1을 돌려준다.
// 글자가 3개 이상인 은어는 글자 사이에 띄어쓰기가 한 칸 끼어 있어도 같은 말로 본다
// (음성 인식이 낯선 말을 "오사 마리"처럼 나눠 적는 경우가 있다). 두 글자짜리는 다른 낱말 사이를 잘못 잇지 않도록 붙어 있을 때만 찾는다.
function matchEnd(src, i, cand) {
  const { codes, gap } = cand;
  let pos = i;
  for (let k = 0; k < codes.length; k += 1) {
    if (pos >= src.length) return -1;
    let cp = src.codePointAt(pos);
    if (k > 0 && gap && isSpaceCp(cp)) {
      pos += 1;
      if (pos >= src.length) return -1;
      cp = src.codePointAt(pos);
    }
    if (lowerCp(cp) !== codes[k]) return -1;
    pos += cp > 0xffff ? 2 : 1;
  }
  return pos;
}

// 표(배열) 하나마다 한 번만 만들어 두는 찾기 도구. 같은 표로 여러 번 바꿀 때(미리보기 입력 등) 다시 만들지 않는다.
const matcherCache = new WeakMap();

function matcherFor(terms) {
  if (!Array.isArray(terms)) return null;
  if (matcherCache.has(terms)) return matcherCache.get(terms);
  const seen = new Set();
  const cands = [];
  for (const t of terms) {
    if (!t || typeof t.slang !== "string" || typeof t.standard !== "string" || !t.standard) continue;
    const key = slangKey(t.slang);
    if (!key || seen.has(key)) continue; // 같은 은어가 두 번 있으면 먼저 나온 줄만 쓴다
    seen.add(key);
    const codes = Array.from(key, (ch) => ch.codePointAt(0));
    cands.push({ codes, gap: codes.length >= 3, term: t });
  }
  let matcher = null;
  if (cands.length > 0) {
    // 긴 은어를 먼저 찾아야 "시로바리"가 "바리"보다 먼저 걸린다. (같은 길이면 표의 순서대로)
    cands.sort((a, b) => b.codes.length - a.codes.length);
    const starts = new Map(); // 첫 글자(소문자) -> 그 글자로 시작하는 은어들(긴 것부터)
    for (const cand of cands) {
      const list = starts.get(cand.codes[0]);
      if (list) list.push(cand);
      else starts.set(cand.codes[0], [cand]);
    }
    matcher = { starts };
  }
  matcherCache.set(terms, matcher);
  return matcher;
}

// 문장 속의 현장 은어를 표(terms)의 표준 용어로 한 번에 바꾼다. 문장을 왼쪽부터 한 번만 훑으므로
// 바뀐 결과 안의 글자가 다시 다른 은어로 바뀌는 일은 없다. 영문은 대소문자를 가리지 않는다.
// 돌려주는 값: text(바뀐 전체 문장), parts(화면에 강조해 보여 줄 조각들: 바뀐 조각에는 from=원래 적힌 말),
//              hits(바뀐 용어와 횟수: { id, slang, standard, count })
export function applyGlossary(text, terms) {
  const src = String(text == null ? "" : text);
  const matcher = src ? matcherFor(terms) : null;
  if (!matcher) return { text: src, parts: src ? [{ text: src }] : [], hits: [] };
  const { starts } = matcher;
  const parts = [];
  const hits = new Map();
  let out = "";
  let last = 0;
  let i = 0;
  while (i < src.length) {
    const cp = src.codePointAt(i);
    const list = starts.get(lowerCp(cp));
    let term = null;
    let end = -1;
    if (list) {
      for (const cand of list) {
        end = matchEnd(src, i, cand);
        if (end > i) {
          term = cand.term;
          break;
        }
      }
    }
    if (!term) {
      i += cp > 0xffff ? 2 : 1;
      continue;
    }
    const before = src.slice(last, i);
    if (before) parts.push({ text: before });
    parts.push({ text: term.standard, from: src.slice(i, end) });
    out += before + term.standard;
    last = end;
    i = end;
    const hit = hits.get(term.id) || { id: term.id, slang: term.slang, standard: term.standard, count: 0 };
    hit.count += 1;
    hits.set(term.id, hit);
  }
  const rest = src.slice(last);
  if (rest) parts.push({ text: rest });
  return { text: out + rest, parts, hits: [...hits.values()] };
}

// 바뀐 문장만 필요할 때. terms를 주지 않으면 기본 용어(SLANG_RULES)를 쓴다.
export function normalizeSlang(text, terms = DEFAULT_TERMS) {
  return applyGlossary(text, terms).text;
}

// 공종별 요약 문장 틀. 은어를 바꾼 발화 내용이 괄호 안에 그대로 붙는다.
const SUMMARY_TEMPLATES = {
  rebar: (n) => `주근 규격 및 띠철근 결속 상태 적합, 배근 검측 접수 (${n})`,
  mep: (n) => `슬리브 및 매설 드레인 배관 설계 위치 고정 확인 (${n})`,
  formwork: (n) => `거푸집 조립 및 연직도·타이볼트 체결 이상 무 (${n})`,
  qc: (n) => `품질 관리 기준 적합 검측 완료 (${n})`,
};

export function buildSummary(tradeId, normalized) {
  const make = SUMMARY_TEMPLATES[tradeId] || SUMMARY_TEMPLATES.qc;
  return make(normalized);
}

// 브라우저의 음성 인식(Web Speech API). Chrome·Safari는 지원하고, 앱 안의 브라우저나 Firefox 등은 지원하지 않을 수 있다.
export function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// ---------------- 위치(동·층) ----------------

// 건물 정보에는 지상 층수만 있어서, 지하층(지하 1~5층)은 고정으로 함께 고를 수 있게 한다. 값: 지하는 음수(-1=지하1층), 지상은 양수.
export const MAX_BASEMENT = 5;

export function floorChoices(totalFloors) {
  const top = Math.max(1, Math.floor(Number(totalFloors)) || 1);
  const list = [];
  for (let b = MAX_BASEMENT; b >= 1; b -= 1) list.push(-b);
  for (let f = 1; f <= top; f += 1) list.push(f);
  return list;
}

// 저장되는 위치 이름은 시안과 같은 한국어 형식("101동 3층", "104동 지하1층")으로 통일한다.
export function buildZone(buildingName, floor) {
  return `${buildingName} ${floor < 0 ? `지하${-floor}층` : `${floor}층`}`;
}

export function clockString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
