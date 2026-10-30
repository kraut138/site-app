// 음성 검측(VOICE-LOCK): 공종 정보, 현장 은어 → 표준 용어 변환, 요약 문장 만들기, 위치(동·층) 도우미, 음성 인식 객체.
// 화면에 보이는 문구는 i18n.js(voice.*)에 있고, 여기에는 저장되는 데이터(한국어 표준 용어)와 계산 로직만 둔다.
import { CATEGORIES, getCategory } from "./data.js";
import { FUZZY_LEVELS, buildFuzzyIndex, findFuzzyMatches, normalizeFuzzy } from "./fuzzyTerms.js";

// 공종: 관리자 "표준 공종" 탭(공사현황 > 표준 공종)에 나오는 분류와 똑같이 골조공사·마감공사·설비/전기다.
// (안전/환경은 그 탭에서도, 골구도·진행도 화면에서도 빠져 있어 여기서도 뺀다)
// id는 그 분류의 id(frame·finish·mep), color는 그 분류의 색, badge는 id의 영문 대문자("TEMPLATE · FRAME"과 같은 표기)다.
// 이름은 번역 사전(category.<id>.name)에서 가져온다. 그 분류 아래의 세부 공종(표준 항목)은 관리자가 고치는 목록이라
// 여기에 고정해 두지 않고, 화면이 받은 checklistItems에서 읽는다(data.js itemsForCategory).
export const VOICE_TRADES = CATEGORIES.filter((c) => c.id !== "safety").map((c) => ({ id: c.id, color: c.color, badge: c.id.toUpperCase() }));

// 예전에 쓰던 공종(철근·형틀·품질 승인). 새로 고를 수는 없고, 이미 저장된 기록의 이름과 색을 보여 줄 때만 쓴다.
// (예전의 "설비"(mep)는 지금의 "설비/전기"와 id가 같아서 따로 두지 않는다)
const LEGACY_TRADES = [
  { id: "rebar", name: "철근", color: "#1D4ED8" },
  { id: "formwork", name: "형틀", color: "#EA580C" },
  { id: "qc", name: "품질 승인", color: "#15803D" },
];

// 지금 고를 수 있는 공종. 모르는 id면 첫 번째(골조공사).
export function getTrade(id) {
  return VOICE_TRADES.find((t) => t.id === id) || VOICE_TRADES[0];
}

// 저장된 기록에 적힌 공종 id로 공종을 찾는다(예전 공종 포함). 어느 쪽도 아니면 null.
export function findTrade(id) {
  return VOICE_TRADES.find((t) => t.id === id) || LEGACY_TRADES.find((t) => t.id === id) || null;
}

// 저장된 기록의 공종 이름(한국어) - 관리자 화면처럼 번역하지 않는 곳에서 쓴다. 모르는 id면 빈 글자.
export function tradeName(id) {
  const cat = VOICE_TRADES.some((t) => t.id === id) ? getCategory(id) : null;
  if (cat) return cat.name;
  const legacy = LEGACY_TRADES.find((t) => t.id === id);
  return legacy ? legacy.name : "";
}

// 저장된 기록의 공종 이름을 번역 사전에서 찾을 때 쓰는 키. 모르는 id면 "".
export function tradeLabelKey(id) {
  if (VOICE_TRADES.some((t) => t.id === id)) return `category.${id}.name`;
  if (LEGACY_TRADES.some((t) => t.id === id)) return `voice.trade.${id}`;
  return "";
}

export const VOICE_LIMITS = {
  rawText: 1000, // 저장하는 발화 원문 최대 글자 수
  elem: 40, // 부재 이름 최대 글자 수
  typedText: 500, // 직접 입력할 때 입력창에 넣을 수 있는 최대 글자 수
  tradeItem: 80, // 세부 공종(표준 항목 글) 최대 글자 수
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
// onlyDb(용어 DB에 있는 단어만 남기는 변환 방식)도 결과를 바꾸므로 켜져 있으면 지문에 함께 넣는다. 꺼져 있으면(기본값) 예전 계산과 똑같은 값이 나온다.
// fuzzy(비슷한 용어 찾기 단계: "off"·"strict"·"normal")도 onlyDb가 켜져 있을 때의 결과를 바꾸므로 꺼져 있지 않으면 계산 방식 번호(near1)와 함께 넣는다.
// 인자를 안 주면 꺼진 것으로 보므로 예전 계산과 똑같은 값이 나온다. (계산 방식을 고치면 이 번호를 올려, 예전 방식으로 바꾼 기록이 '표가 바뀌었다'로 보이게 한다)
// 같은 내용이면 어느 기기에서 계산해도 같은 값이 나온다. (cyrb53 - 외부 라이브러리 없이 정수 연산만 쓴다)
export function glossaryHash(terms, onlyDb = false, fuzzy = "off") {
  const rows = sanitizeGlossary(terms);
  const level = onlyDb ? normalizeFuzzy(fuzzy) : "off";
  let s = String(rows.length) + (onlyDb ? "\u0003only-db" : "") + (level !== "off" ? `\u0004near1-${level}` : "");
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
  "table-changed": "그 사이 용어 표나 변환 방식이 바뀌었어요. 미리보기를 다시 해 주세요.",
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
const matcherCache = new WeakMap(); // 은어만 찾는 도구(applyGlossary)
const onlyMatcherCache = new WeakMap(); // 은어와 표준 용어를 함께 찾는 도구(applyGlossaryOnly)

// 표의 줄마다 은어 하나를 "찾을 말"로 만든다. 같은 은어가 두 번 있으면 먼저 나온 줄만 쓴다. seen에는 쓴 은어의 키가 쌓인다.
// 찾을 말: { codes(키의 글자들), gap(글자 사이 띄어쓰기 허용), term(표의 줄), kind: "slang", out(찾으면 내보낼 말) }
function slangCands(terms, seen) {
  const cands = [];
  for (const t of terms) {
    if (!t || typeof t.slang !== "string" || typeof t.standard !== "string" || !t.standard) continue;
    const key = slangKey(t.slang);
    if (!key || seen.has(key)) continue; // 같은 은어가 두 번 있으면 먼저 나온 줄만 쓴다
    seen.add(key);
    const codes = Array.from(key, (ch) => ch.codePointAt(0));
    cands.push({ codes, gap: codes.length >= 3, term: t, kind: "slang", out: t.standard });
  }
  return cands;
}

// 찾을 말들을 첫 글자별로 묶는다. 긴 말을 먼저 찾아야 "시로바리"가 "바리"보다 먼저 걸린다. (같은 길이면 넣은 순서대로 - 정렬은 순서를 유지한다)
function startsOf(cands) {
  cands.sort((a, b) => b.codes.length - a.codes.length);
  const starts = new Map(); // 첫 글자(소문자) -> 그 글자로 시작하는 말들(긴 것부터)
  for (const cand of cands) {
    const list = starts.get(cand.codes[0]);
    if (list) list.push(cand);
    else starts.set(cand.codes[0], [cand]);
  }
  return { starts };
}

function matcherFor(terms) {
  if (!Array.isArray(terms)) return null;
  if (matcherCache.has(terms)) return matcherCache.get(terms);
  const cands = slangCands(terms, new Set());
  const matcher = cands.length > 0 ? startsOf(cands) : null;
  matcherCache.set(terms, matcher);
  return matcher;
}

// 표준 용어에서 "직접 말했을 때 그대로 남겨 둘 낱말"을 뽑는다: 표준 용어 전체, 괄호 밖의 말과 괄호 안의 말, "/"(또는 쉼표·가운뎃점)로 나뉜 각 낱말.
//  "고르기/다짐" → 고르기/다짐, 고르기, 다짐   "콘크리트(레미콘)" → 콘크리트(레미콘), 콘크리트, 레미콘   "보(Beam)" → 보(Beam), Beam
// 한 글자짜리는 다른 낱말 속에서도 걸려 버리므로 뺀다("보(Beam)"의 "보"). 글자나 숫자가 없는 조각도 뺀다.
export function standardForms(standard) {
  const full = cleanTermText(standard);
  const out = [];
  const add = (value) => {
    const form = cleanTermText(value);
    if (!form || out.includes(form)) return;
    const key = slangKey(form);
    if (Array.from(key).length < 2 || !/[\p{L}\p{N}]/u.test(key)) return;
    out.push(form);
  };
  add(full);
  const inner = [];
  const outer = full.replace(/[(（[]([^)）\]]*)[)）\]]/g, (_, group) => {
    inner.push(group);
    return " ";
  });
  for (const chunk of [outer, ...inner]) for (const part of chunk.split(/[\/／,，、·]/)) add(part);
  return out;
}

// 은어에 더해 표준 용어(와 그 낱말들)도 "표의 단어"로 찾는 도구. 은어와 같은 말이면 은어가 먼저(= 바꾸는 쪽이 먼저)이고, 표준 용어끼리는 먼저 나온 줄이 먼저다.
function onlyMatcherFor(terms) {
  if (!Array.isArray(terms)) return null;
  if (onlyMatcherCache.has(terms)) return onlyMatcherCache.get(terms);
  const seen = new Set();
  const cands = slangCands(terms, seen);
  const rows = cands.map((c) => c.term); // 은어가 쓰이는 줄만(은어가 비었거나 겹쳐서 빠진 줄의 표준 용어는 단어로 치지 않는다)
  for (const term of rows) {
    for (const form of standardForms(term.standard)) {
      const key = slangKey(form);
      if (seen.has(key)) continue;
      seen.add(key);
      const codes = Array.from(key, (ch) => ch.codePointAt(0));
      cands.push({ codes, gap: codes.length >= 3, term, kind: "standard", out: form });
    }
  }
  // 비슷한 용어 찾기에서 유사도가 같을 때 표에서 앞선 단어를 고르도록 순서를 달아 둔다(startsOf가 정렬하기 전의 순서 = 은어들, 그다음 표준 용어들)
  cands.forEach((c, i) => {
    c.order = i;
  });
  const matcher = cands.length > 0 ? { ...startsOf(cands.slice()), cands, fuzzyIndex: null } : null;
  onlyMatcherCache.set(terms, matcher);
  return matcher;
}

// 비슷한 용어 찾기 도구(fuzzyTerms.js): 표의 단어(은어와 표준 용어)를 소리(자모)로 풀어 둔 목록. 처음 필요할 때 한 번만 만든다.
function fuzzyIndexOf(matcher) {
  if (!matcher.fuzzyIndex) {
    matcher.fuzzyIndex = buildFuzzyIndex(matcher.cands.map((c) => ({ key: String.fromCodePoint(...c.codes), cand: c, order: c.order })));
  }
  return matcher.fuzzyIndex;
}

// 문장 src를 왼쪽부터 한 번 훑어, 찾을 말이 나온 자리를 차례로 모은다: [{ start, end, cand }]
// 같은 자리에서는 가장 긴 말 먼저이고, 찾은 부분은 다시 훑지 않는다.
function findMatches(src, starts) {
  const found = [];
  let i = 0;
  while (i < src.length) {
    const cp = src.codePointAt(i);
    const list = starts.get(lowerCp(cp));
    let cand = null;
    let end = -1;
    if (list) {
      for (const c of list) {
        end = matchEnd(src, i, c);
        if (end > i) {
          cand = c;
          break;
        }
      }
    }
    if (!cand) {
      i += cp > 0xffff ? 2 : 1;
      continue;
    }
    found.push({ start: i, end, cand });
    i = end;
  }
  return found;
}

// 문장 속의 현장 은어를 표(terms)의 표준 용어로 한 번에 바꾼다. 문장을 왼쪽부터 한 번만 훑으므로
// 바뀐 결과 안의 글자가 다시 다른 은어로 바뀌는 일은 없다. 영문은 대소문자를 가리지 않는다.
// 돌려주는 값: text(바뀐 전체 문장), parts(화면에 강조해 보여 줄 조각들: 바뀐 조각에는 from=원래 적힌 말),
//              hits(바뀐 용어와 횟수: { id, slang, standard, count })
export function applyGlossary(text, terms) {
  const src = String(text == null ? "" : text);
  const matcher = src ? matcherFor(terms) : null;
  if (!matcher) return { text: src, parts: src ? [{ text: src }] : [], hits: [] };
  const parts = [];
  const hits = new Map();
  let out = "";
  let last = 0;
  for (const m of findMatches(src, matcher.starts)) {
    const term = m.cand.term;
    const before = src.slice(last, m.start);
    if (before) parts.push({ text: before });
    parts.push({ text: term.standard, from: src.slice(m.start, m.end) });
    out += before + term.standard;
    last = m.end;
    const hit = hits.get(term.id) || { id: term.id, slang: term.slang, standard: term.standard, count: 0 };
    hit.count += 1;
    hits.set(term.id, hit);
  }
  const rest = src.slice(last);
  if (rest) parts.push({ text: rest });
  return { text: out + rest, parts, hits: [...hits.values()] };
}

const NEAR_MIN_SIM = 0.6; // 바꾸지 않은 말 중 이 정도(60%) 이상 닮은 것만 '가까운 말'로 알려 준다

// "용어 DB에 있는 단어만 남기기": 문장 속에서 표에 있는 단어만 골라 낸다.
//  - 현장 은어 → 표준 용어로 바꿔서 넣는다 ("나라시" → 표에 적힌 표준 용어)
//  - 표준 용어를 직접 말했으면 그 말을 그대로 넣는다 (standardForms: 전체·괄호 안팎·"/"로 나뉜 낱말, 두 글자 이상)
//  - 표에 없는 말("했어요", 숫자, 조사 등)은 모두 뺀다
//  - 비슷한 용어 찾기(opts.fuzzy가 "strict"·"normal"일 때): 위에서 정확히 찾지 못한 말 중에 표의 단어와 소리가 비슷한 말이 있으면
//    (음성 인식이 잘못 들은 말: "나라씨" → "나라시") 레벤슈타인 거리(fuzzyTerms.js)로 가장 비슷한 단어를 골라 그 단어처럼 넣는다. 기준에 못 미치면 그대로 뺀다.
// 고른 단어들은 말한 순서대로 띄어쓰기 한 칸으로 잇는다. 표에 있는 단어가 하나도 없으면 text는 "".
// opts: { fuzzy: 비슷한 용어 찾기 단계(없으면 끔), explain: true면 바꾸지 않은 말 중 표의 단어와 가까운 것도 알려 준다(미리보기 화면용) }
// 돌려주는 값: text, parts(화면에 강조해 보여 줄 조각들: 은어에서 바뀐 조각에는 from=원래 말, 비슷한 말로 찾은 조각에는 near=true와 sim(%)도 있다. 단어 사이의 띄어쓰기 조각 포함),
//   hits(바뀐 은어와 횟수: applyGlossary와 같은 모양 - 표준 용어를 그대로 둔 것·비슷한 말로 찾은 것은 넣지 않는다), kept(그대로 둔 표준 용어들),
//   dropped(뺀 말 덩어리들: 글자나 숫자가 있는 것만),
//   fuzzy(비슷한 말로 찾아 바꾼 것들: { from(들린 말), matched(찾은 표의 단어), text(글에 넣은 말), sim(%), kind: "slang"|"standard", id }),
//   near(explain일 때만: 바꾸지 않았지만 표의 단어와 가까운 말들 { from, matched, text, sim(%) } - 유사도 높은 순)
export function applyGlossaryOnly(text, terms, opts = null) {
  const src = String(text == null ? "" : text);
  const empty = { text: "", parts: [], hits: [], kept: [], dropped: [], fuzzy: [], near: [] };
  const matcher = src ? onlyMatcherFor(terms) : null;
  const dropOf = (chunk) => {
    const value = cleanTermText(chunk);
    return /[\p{L}\p{N}]/u.test(value) ? value : "";
  };
  if (!matcher) return src ? { ...empty, dropped: [dropOf(src)].filter(Boolean) } : empty;
  const minSim = FUZZY_LEVELS[opts && opts.fuzzy ? normalizeFuzzy(opts.fuzzy) : "off"] || 0;
  const index = minSim > 0 ? fuzzyIndexOf(matcher) : null;
  const percent = (sim) => Math.round(sim * 100);
  const shownWord = (cand) => (cand.kind === "slang" ? cand.term.slang : cand.out);

  // 정확히 찾은 곳들 사이의 빈틈에서 비슷한 말을 찾아, 정확히 찾은 곳과 함께 말한 순서대로 늘어놓는다
  const found = [];
  let edge = 0;
  const lookBetween = (from, to) => {
    if (!index || to <= from) return;
    for (const f of findFuzzyMatches(src.slice(from, to), index, minSim)) {
      found.push({ start: from + f.start, end: from + f.end, cand: f.entry.cand, sim: f.sim, fuzzy: true });
    }
  };
  for (const m of findMatches(src, matcher.starts)) {
    lookBetween(edge, m.start);
    found.push(m);
    edge = m.end;
  }
  lookBetween(edge, src.length);

  const parts = [];
  const hits = new Map();
  const words = [];
  const kept = [];
  const dropped = [];
  const fuzzy = [];
  let last = 0;
  for (const m of found) {
    const gap = dropOf(src.slice(last, m.start));
    if (gap) dropped.push(gap);
    const { term, kind, out } = m.cand;
    const spoken = src.slice(m.start, m.end);
    if (words.length > 0) parts.push({ text: " " });
    words.push(out);
    if (m.fuzzy) {
      parts.push({ text: out, from: spoken, near: true, sim: percent(m.sim) });
      fuzzy.push({ from: spoken, matched: shownWord(m.cand), text: out, sim: percent(m.sim), kind, id: term.id });
    } else {
      if (kind === "slang" || spoken !== out) parts.push({ text: out, from: spoken });
      else parts.push({ text: out });
      if (kind === "slang") {
        const hit = hits.get(term.id) || { id: term.id, slang: term.slang, standard: term.standard, count: 0 };
        hit.count += 1;
        hits.set(term.id, hit);
      } else {
        kept.push(out);
      }
    }
    last = m.end;
  }
  const tail = dropOf(src.slice(last));
  if (tail) dropped.push(tail);

  // 바꾸지 않은 말 중 표의 단어와 가까운 것(기준에 못 미치거나 짧은 단어라 막힌 것) - 미리보기에서 "왜 안 바뀌었는지" 보여 주는 용도
  const near = [];
  if (index && opts && opts.explain) {
    let from = 0;
    const scan = (to) => {
      for (const f of findFuzzyMatches(src.slice(from, to), index, NEAR_MIN_SIM, { shortRule: false })) {
        near.push({ from: src.slice(from + f.start, from + f.end), matched: shownWord(f.entry.cand), text: f.entry.cand.out, sim: percent(f.sim) });
      }
    };
    for (const m of found) {
      scan(m.start);
      from = m.end;
    }
    scan(src.length);
    near.sort((a, b) => b.sim - a.sim);
  }
  return { text: words.join(" "), parts, hits: [...hits.values()], kept, dropped, fuzzy, near };
}

// 말한(또는 입력한) 글 하나를 보고에 쓸 글들로 바꾼다. onlyDb는 관리자 "용어 DB" 탭의 '용어 DB에 있는 단어만 남기기' 설정이고,
// fuzzy는 같은 탭의 '비슷한 용어 찾기' 단계("off"·"strict"·"normal", 안 주면 끔)다 - onlyDb가 켜져 있을 때만 쓰인다.
//  - normalized: 은어만 표준 용어로 바꾼 전체 문장(다른 말은 그대로). 호실·공종 진행도를 읽어 내는 계산이 이 글을 읽으므로 늘 만들어 저장한다.
//    (비슷한 용어 찾기는 이 글을 바꾸지 않는다 - 잘못 들은 말을 짐작으로 고쳐 호실·진행도를 잘못 읽는 일이 없도록)
//  - dbText: onlyDb가 켜져 있을 때만 문자열(표에 있는 단어로만 이룬 문장, 없으면 ""), 꺼져 있으면 null
//  - shown: 화면에 '순화한 내용'으로 보여 주고 요약에 넣는 글 (dbText가 있으면 dbText, 없으면 normalized)
//  - parts, replacedCount: shown에서 강조해 보여 줄 조각들과 은어가 바뀐 곳의 수
//  - dropped: 표에 없어서 뺀 말들 (onlyDb일 때만)
//  - fuzzy: 비슷한 말로 찾아 바꾼 것들 (applyGlossaryOnly의 fuzzy와 같은 모양, 없으면 [])
export function convertVoiceText(raw, terms, onlyDb, fuzzy = "off") {
  const full = applyGlossary(raw, terms);
  if (!onlyDb) {
    return {
      normalized: full.text,
      dbText: null,
      shown: full.text,
      parts: full.parts,
      replacedCount: full.hits.reduce((sum, h) => sum + h.count, 0),
      dropped: [],
      fuzzy: [],
    };
  }
  const only = applyGlossaryOnly(raw, terms, { fuzzy });
  return {
    normalized: full.text,
    dbText: only.text,
    shown: only.text,
    parts: only.parts,
    replacedCount: only.hits.reduce((sum, h) => sum + h.count, 0),
    dropped: only.dropped,
    fuzzy: only.fuzzy,
  };
}

// 저장된 보고 하나에서 화면에 '순화한 내용'으로 보여 줄 글. dbText(용어 DB 단어만 남긴 글)가 있는 기록은 그 글(비어 있을 수도 있다),
// 없는 기록(그 방식을 쓰기 전에 저장했거나 꺼 둔 채 저장한 기록)은 은어만 바꾼 글(normalized)이다.
export function convertedText(report) {
  if (report && typeof report.dbText === "string") return report.dbText;
  return report && typeof report.normalized === "string" ? report.normalized : "";
}

// 바뀐 문장만 필요할 때. terms를 주지 않으면 기본 용어(SLANG_RULES)를 쓴다.
export function normalizeSlang(text, terms = DEFAULT_TERMS) {
  return applyGlossary(text, terms).text;
}

// 예전 공종(철근·설비·형틀·품질 승인) 시절에 저장된 기록의 요약 문장 틀. 그 기록의 요약을 다시 만들 때도(용어 표 다시 적용)
// 같은 문장이 나오도록 그대로 둔다. 발화 내용(은어를 바꾼 글)이 괄호 안에 그대로 붙는다.
const LEGACY_SUMMARY_BASES = {
  rebar: "주근 규격 및 띠철근 결속 상태 적합, 배근 검측 접수",
  mep: "슬리브 및 매설 드레인 배관 설계 위치 고정 확인",
  formwork: "거푸집 조립 및 연직도·타이볼트 체결 이상 무",
  qc: "품질 관리 기준 적합 검측 완료",
};

// 요약 문장 끝에 발화 내용을 괄호로 붙인다. 붙일 내용이 없으면(용어 DB에 있는 단어가 하나도 없는 경우) 빈 괄호 "()"를 남기지 않고 문장만 둔다.
function withContent(base, content) {
  const text = String(content == null ? "" : content);
  return text.trim() ? `${base} (${text})` : base;
}

// 공종별 요약 문장. 발화 내용(화면에 '순화한 내용'으로 보여 주는 글 - 용어 DB 단어만 남기는 방식이면 그 글)이 괄호 안에 그대로 붙는다.
//  - 지금의 공종: 분류 이름에 고른 세부 공종을 붙여 "마감공사 · 도배 검측 접수 (도배 완료)"처럼 만든다(세부 공종을 안 골랐으면 "마감공사 검측 접수 (…)").
//  - item이 undefined인 기록은 세부 공종 칸이 없던 예전 기록이다(지금 남기는 보고는 세부 공종을 안 골라도 빈 글자 ""를 함께 저장한다).
//    그런 기록은 예전 문장 틀을 그대로 쓴다(모르는 공종은 예전처럼 품질 승인 틀).
export function buildSummary(tradeId, normalized, item) {
  if (item === undefined) return withContent(LEGACY_SUMMARY_BASES[tradeId] || LEGACY_SUMMARY_BASES.qc, normalized);
  const cat = VOICE_TRADES.some((t) => t.id === tradeId) ? getCategory(tradeId) : null;
  const where = [cat ? cat.name : "", cleanTermText(item)].filter(Boolean).join(" · ");
  return withContent(`${where ? `${where} ` : ""}검측 접수`, normalized);
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
