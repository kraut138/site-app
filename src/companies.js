// 업체(협력업체) 등록과, 그 업체가 맡은 공종을 말한 업체 이름과 이어 주는 규칙들.
//   관리자가 "6. 검측·NCR·표준 공종 → 업체·담당 공종"에서 업체 이름과 맡은 공종을 등록하면(Firestore meta/companies), 녹음에서 그 업체 이름을 말했을 때
//   그 업체의 담당 공종과 이어서 작업일보·TBM 일지·검측요청서의 공종 칸에 업체까지 적는다.
//
// 저장하는 모양: { id, name, aliases: ["줄여 부르는 이름"], trades: [{ id: 공종 id, items: ["도배", ...] }] }
//   trades[].items가 비어 있으면 그 공종 전체를 맡은 것이고, 항목이 있으면 그 세부 공종(표준 공종 항목 글)만 맡은 것이다.
//   세부 공종은 항목 id가 아니라 글로 적는다: '기본값으로 초기화'하면 항목 id가 새로 만들어지지만 글(도배 등)은 그대로이기 때문이고,
//   음성 기록의 세부 공종(tradeItem)도 글로 저장하기 때문이다.
//
// 말한 글에서 업체를 읽는 방법(화면·저장소와 무관한 순수 함수라 따로 시험한다):
//   1) 등록한 이름(또는 줄여 부르는 이름)과 띄어쓰기·(주) 표시만 다르고 같으면 그 업체다. 이름 뒤에 "입니다·에서·소속" 같은 말이 붙어 있어도 된다.
//   2) 같은 이름이 없으면 소리(자모)가 거의 같은 이름("한비치인테리어" ↔ "한빛인테리어")을 찾는다. 이름이 다섯 글자 이상일 때만, 둘 이상이 비슷하면 읽지 않는다.
//   3) 분명하지 않으면 읽지 않는다: 틀리게 이어 붙이는 것이 못 읽는 것보다 나쁘다.
// 말한 글에서 업체 이름 말은 뗀 나머지(rest)만 은어 변환·호실 읽기·진행도 계산에 넣는다(업체 이름 속 글자 "한빛도배"의 "도배"가 작업 내용으로 읽히지 않게).
// 말한 그대로의 글(rawText)은 따로 그대로 저장하므로 여기서는 아무것도 지우거나 고치지 않는다.
import { jamoSimilarity } from "./fuzzyTerms.js";
import { CATEGORIES, CUSTOM_CATEGORIES, getCategory, itemsForCategory, DEFAULT_ITEMS_BY_CATEGORY } from "./data.js";
import { parseSpeakerIntro, speakerOf } from "./speakerIntro.js";

export const COMPANY_LIMITS = { name: 30, alias: 30, aliases: 5, max: 100, items: 60, itemText: 80 };
const COMPANY_ID = /^k[a-z0-9]{3,24}$/;

export function newCompanyId() {
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

const oneLine = (s) =>
  String(s == null ? "" : s)
    .replace(/\s+/g, " ")
    .trim();

// 회사 형태 표시("(주)", "㈜", "주식회사" 등)는 이름을 견줄 때 없는 것으로 본다.
const FORM_WORDS = /\(주\)|㈜|\(유\)|\(사\)|\(합\)|주식회사|유한책임회사|유한회사|합자회사|합명회사/g;

// 이름을 견주는 값: 회사 형태 표시·공백·기호를 빼고 소문자로("(주) 한빛 인테리어" → "한빛인테리어")
export function companyKey(text) {
  return String(text == null ? "" : text)
    .normalize("NFC")
    .toLowerCase()
    .replace(FORM_WORDS, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

// ---------------------------------------------------------------- 저장 모양 정리

function cleanItems(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const text = oneLine(raw).slice(0, COMPANY_LIMITS.itemText);
    const key = text.replace(/\s+/g, "").toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= COMPANY_LIMITS.items) break;
  }
  return out;
}

function cleanTrades(list) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(list) ? list : []) {
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id || id.length > 40 || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, items: cleanItems(row.items) });
  }
  return out;
}

function cleanAliases(list, nameKey) {
  const src = Array.isArray(list) ? list : typeof list === "string" ? list.split(/[,，、\n]/) : [];
  const out = [];
  const seen = new Set([nameKey]);
  for (const raw of src) {
    const text = oneLine(raw).slice(0, COMPANY_LIMITS.alias);
    const key = companyKey(text);
    if (!text || key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= COMPANY_LIMITS.aliases) break;
  }
  return out;
}

// 저장소에서 읽은(또는 화면에서 고친) 값을 그대로 믿지 않고 { id, name, aliases, trades } 목록으로 걸러 낸다.
// id·이름이 올바르지 않거나, 이름이 이미 있는 다른 업체의 이름·줄여 부르는 이름과 같으면 버린다.
export function sanitizeCompanies(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const ids = new Set();
  const keys = new Set();
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id : "";
    const name = oneLine(row.name).slice(0, COMPANY_LIMITS.name);
    const nameKey = companyKey(name);
    if (!COMPANY_ID.test(id) || ids.has(id) || nameKey.length < 2 || keys.has(nameKey)) continue;
    const aliases = cleanAliases(row.aliases, nameKey).filter((a) => !keys.has(companyKey(a)));
    ids.add(id);
    keys.add(nameKey);
    aliases.forEach((a) => keys.add(companyKey(a)));
    out.push({ id, name, aliases, trades: cleanTrades(row.trades) });
    if (out.length >= COMPANY_LIMITS.max) break;
  }
  return out;
}

// 지금 쓸 업체 목록(말한 글을 읽을 때 화면 어디서나 쓴다). 이전에 등록한 것은 모두 바꾼다. 돌려주는 값: 정리된 목록
let REGISTERED = [];
export function registerCompanies(list) {
  REGISTERED = sanitizeCompanies(list);
  return REGISTERED;
}
export function getCompanies() {
  return REGISTERED;
}

// ---------------------------------------------------------------- 등록 화면에서 입력한 업체 검사

// 등록 화면에서 입력한 업체 하나를 검사한다.
//   draft: { id(새 업체면 ""), name, aliases(쉼표로 나눈 글 또는 목록), trades: [{ id, items }], tradeNames: { 공종 id: 공종 이름 }(오류 안내용) }
//   others: 이 업체를 뺀 이미 등록된 업체들
// 반환: { ok, error(막는 이유, 없으면 ""), company(저장할 모양 | null), warnings: [알려 줄 말들] }
export function checkCompanyDraft(draft, others = [], { isNew = true } = {}) {
  const fail = (error) => ({ ok: false, error, company: null, warnings: [] });
  const d = draft && typeof draft === "object" ? draft : {};
  const name = oneLine(d.name);
  const nameKey = companyKey(name);
  if (nameKey.length < 2) return fail("업체 이름을 두 글자 이상 입력해 주세요.");
  if (name.length > COMPANY_LIMITS.name) return fail(`업체 이름은 ${COMPANY_LIMITS.name}글자까지 쓸 수 있어요.`);
  const rest = (Array.isArray(others) ? others : []).filter((c) => c && c.id !== d.id);
  if (isNew && rest.length >= COMPANY_LIMITS.max) return fail(`업체는 ${COMPANY_LIMITS.max}곳까지 등록할 수 있어요.`);
  const taken = new Map();
  for (const c of rest) {
    taken.set(companyKey(c.name), c.name);
    (c.aliases || []).forEach((a) => taken.set(companyKey(a), c.name));
  }
  if (taken.has(nameKey)) return fail(`‘${name}’은(는) 이미 등록된 업체 ‘${taken.get(nameKey)}’의 이름(또는 줄여 부르는 이름)과 같아요.`);
  const rawAliases = Array.isArray(d.aliases) ? d.aliases : String(d.aliases == null ? "" : d.aliases).split(/[,，、\n]/);
  const aliases = [];
  const seen = new Set([nameKey]);
  for (const raw of rawAliases) {
    const text = oneLine(raw);
    if (!text) continue;
    const key = companyKey(text);
    if (key.length < 2) return fail(`줄여 부르는 이름 ‘${text}’은(는) 두 글자 이상이어야 해요.`);
    if (text.length > COMPANY_LIMITS.alias) return fail(`줄여 부르는 이름은 ${COMPANY_LIMITS.alias}글자까지 쓸 수 있어요.`);
    if (taken.has(key)) return fail(`줄여 부르는 이름 ‘${text}’은(는) 이미 등록된 업체 ‘${taken.get(key)}’의 이름과 같아요.`);
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(text);
  }
  if (aliases.length > COMPANY_LIMITS.aliases) return fail(`줄여 부르는 이름은 ${COMPANY_LIMITS.aliases}개까지 쓸 수 있어요.`);
  const names = d.tradeNames && typeof d.tradeNames === "object" ? d.tradeNames : {};
  const trades = [];
  for (const t of Array.isArray(d.trades) ? d.trades : []) {
    if (!t || !t.id) continue;
    const items = cleanItems(t.items);
    if (t.mode === "items" && items.length === 0) return fail(`‘${names[t.id] || t.id}’은(는) 세부 공종을 하나 이상 고르거나 ‘공종 전체’를 선택해 주세요.`);
    trades.push({ id: t.id, items: t.mode === "items" ? items : [] });
  }
  const id = typeof d.id === "string" && d.id ? d.id : newCompanyId();
  const [company] = sanitizeCompanies([{ id, name, aliases, trades }]);
  if (!company) return fail("업체 정보를 저장할 수 있는 모양으로 만들지 못했어요. 이름을 다시 확인해 주세요.");
  const warnings = [];
  const generic = [name, ...aliases].filter((n) => isGenericCompanyName(n));
  if (generic.length) {
    warnings.push(`‘${generic.join("’, ‘")}’은(는) 공종·작업 이름과 같아서, 말 속에서 이름만 말하면 업체로 찾지 못할 수 있어요. ‘${generic[0]} 소속 홍길동입니다’처럼 소속을 붙여 말하면 읽어요.`);
  }
  const similar = rest.filter((c) => syllables(companyKey(c.name)) >= NEAR_MIN_SYLLABLES && syllables(nameKey) >= NEAR_MIN_SYLLABLES && jamoSimilarity(companyKey(c.name), nameKey) >= NEAR_MIN_SIM);
  if (similar.length) {
    warnings.push(`‘${similar.map((c) => c.name).join("’, ‘")}’과(와) 소리가 비슷해서, 녹음에서 조금 다르게 알아들으면 어느 쪽인지 가리지 못할 수 있어요. 줄여 부르는 이름을 달리 정하거나 ‘소속’을 붙여 말하면 정확해요.`);
  }
  return { ok: true, error: "", company, warnings };
}

// ---------------------------------------------------------------- 맡은 공종

// 이 업체가 그 공종(전체 또는 일부)을 맡았는가
export function coversTrade(company, categoryId) {
  return !!company && Array.isArray(company.trades) && company.trades.some((t) => t.id === categoryId);
}

// 이 업체가 그 공종에서 맡은 세부 공종 글. 공종 전체를 맡았거나 그 공종을 맡지 않았으면 [].
export function itemsOfCompany(company, categoryId) {
  const t = company && Array.isArray(company.trades) ? company.trades.find((x) => x.id === categoryId) : null;
  return t ? t.items.slice() : [];
}

// 이 업체가 공종을 하나라도 맡도록 등록되어 있는가
export function hasTrades(company) {
  return !!company && Array.isArray(company.trades) && company.trades.length > 0;
}

// 세부 공종 글들을 한 칸(tradeItem, 최대 80자)에 담는다: 항목 사이는 "·"로 잇고, 넘치면 항목 중간이 아니라 항목 단위로 줄인다.
export function joinItems(items, max = COMPANY_LIMITS.itemText) {
  let out = "";
  for (const it of items || []) {
    const next = out ? `${out}·${it}` : it;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

// 공종 이름(기본 공종·직접 추가한 공종 모두). 모르는 공종이면 "".
function categoryName(id) {
  const c = getCategory(id);
  return c ? c.name : "";
}

// 업체가 맡은 공종 한 줄: "마감공사(도배·바닥마감), 골조공사". 맡은 공종이 없으면 "". 사라진 공종(삭제한 추가 공종)은 뺀다.
// nameOf: 공종 id → 보여 줄 공종 이름(기본은 한국어 이름. 번역해서 보여 줄 때는 번역한 이름을 돌려주는 함수를 넘긴다)
export function describeCompanyTrades(company, nameOf = categoryName) {
  if (!company || !Array.isArray(company.trades)) return "";
  const parts = [];
  for (const t of company.trades) {
    const name = categoryName(t.id) ? nameOf(t.id) || categoryName(t.id) : "";
    if (!name) continue;
    parts.push(t.items.length ? `${name}(${t.items.join("·")})` : name);
  }
  return parts.join(", ");
}

// 검측 요청·NCR 한 건을 맡은 업체들(이름순). categoryId: 공종, itemTexts: 요청에서 확인한 세부 공종 글(모르면 []).
//   - 그 공종 전체를 맡은 업체는 늘 해당한다.
//   - 세부 공종만 맡은 업체는 요청의 세부 공종과 겹칠 때 해당한다(요청에 세부 공종이 없으면 그 공종을 맡은 업체 모두).
export function companiesFor(companies, categoryId, itemTexts = []) {
  const texts = cleanItems(itemTexts).map((x) => x.replace(/\s+/g, "").toLowerCase());
  return (Array.isArray(companies) ? companies : [])
    .filter((co) => {
      const t = co.trades.find((x) => x.id === categoryId);
      if (!t) return false;
      if (t.items.length === 0 || texts.length === 0) return true;
      return t.items.some((it) => texts.includes(it.replace(/\s+/g, "").toLowerCase()));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// 표준 공종 화면용: 그 공종 전체를 맡은 업체들 / 그 세부 공종을 따로 맡은 업체들(이름순)
export function companiesForWholeTrade(companies, categoryId) {
  return (Array.isArray(companies) ? companies : [])
    .filter((co) => co.trades.some((x) => x.id === categoryId && x.items.length === 0))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
export function companiesForItem(companies, categoryId, itemText) {
  const want = oneLine(itemText).replace(/\s+/g, "").toLowerCase();
  return (Array.isArray(companies) ? companies : [])
    .filter((co) => co.trades.some((x) => x.id === categoryId && x.items.length > 0 && x.items.some((it) => it.replace(/\s+/g, "").toLowerCase() === want)))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// 검측 요청 한 건을 맡은 업체들: 요청이 확인한 세부 공종(표준 공종 항목 글)으로 좁힌다. 확인한 항목을 모르면 그 공종을 맡은 업체 모두.
export function companiesOfInspection(companies, insp, checklistItems) {
  if (!insp || typeof insp !== "object") return [];
  const byId = new Map((Array.isArray(checklistItems) ? checklistItems : []).map((i) => [i.id, i.text]));
  const texts = (Array.isArray(insp.checkedItemIds) ? insp.checkedItemIds : []).map((id) => byId.get(id)).filter(Boolean);
  return companiesFor(companies, insp.categoryId, texts);
}

// 업체를 등록할 때 고를 수 있는 공종: 기본 공종 + 직접 추가한 공종
export function tradeChoices() {
  return [...CATEGORIES, ...CUSTOM_CATEGORIES].map((c) => ({ id: c.id, name: c.name, color: c.color, custom: !!c.custom }));
}

// 업체 이름을 줄여 보여 줄 때: "한빛인테리어", "한빛인테리어 외 2곳"
export function companyNames(list, show = 2) {
  const names = (list || []).map((c) => c.name);
  if (names.length <= show) return names.join(", ");
  return `${names.slice(0, show).join(", ")} 외 ${names.length - show}곳`;
}

// ---------------------------------------------------------------- 공종·작업 이름과 헷갈리는 업체 이름

// 업체 이름이 공종 이름이나 흔한 작업 말과 똑같으면("도배", "전기") 말 속에서 업체 이름인지 작업 이름인지 가릴 수 없다.
const GENERIC_WORDS = [
  "작업", "공사", "현장", "완료", "확인", "점검", "검측", "시공", "마감", "골조", "설비", "전기", "안전", "환경", "업체", "회사", "소속", "하도급", "협력업체", "자재", "장비", "인원", "오늘", "금일",
];
let GENERIC_CACHE = { sig: "", keys: null };
export function genericKeys(extraItemTexts = []) {
  const extra = (extraItemTexts || []).filter(Boolean);
  const sig = CUSTOM_CATEGORIES.map((c) => `${c.id}:${c.name}`).join("|");
  if (!extra.length && GENERIC_CACHE.keys && GENERIC_CACHE.sig === sig) return GENERIC_CACHE.keys;
  const keys = new Set();
  const add = (v) => {
    const k = companyKey(v);
    if (k) keys.add(k);
  };
  GENERIC_WORDS.forEach(add);
  [...CATEGORIES, ...CUSTOM_CATEGORIES].forEach((c) => {
    add(c.name);
    add(c.shortName);
  });
  Object.values(DEFAULT_ITEMS_BY_CATEGORY).forEach((list) => list.forEach(add));
  extra.forEach(add);
  if (!extra.length) GENERIC_CACHE = { sig, keys };
  return keys;
}
// 이 이름이 공종·작업 말과 똑같은가(등록할 때 알려 주는 용도)
export function isGenericCompanyName(name, extraItemTexts = []) {
  const k = companyKey(name);
  return !!k && genericKeys(extraItemTexts).has(k);
}

// ---------------------------------------------------------------- 말한 글에서 업체 찾기

const MAX_WINDOW = 4; // 업체 이름이 띄어 쓰여 나올 수 있는 최대 낱말 수("한빛 인테리어 주식회사")
const NEAR_MIN_SIM = 0.9; // 소리가 이 정도(90%) 이상 같을 때만 같은 이름으로 본다
const NEAR_MIN_SYLLABLES = 5; // 소리로 견주는 것은 이름이 이 글자 수 이상일 때만(짧은 이름은 한 글자만 달라도 다른 회사다)
const NEAR_MARGIN = 0.05; // 가장 닮은 이름과 둘째로 닮은 이름의 차이가 이보다 작으면 가릴 수 없어 읽지 않는다

// 업체 이름 바로 뒤에 붙을 수 있는 말(조사·끝맺음·"소속"·"업체")
const SUFFIX_OK = /^(?:입니다만|입니다|이에요|예요|이고요|이고|이며|이라고|에서는|에서도|에서|이요|께서|소속의|소속인|소속입니다|소속이며|소속이고|소속|업체입니다|업체는|업체가|업체의|업체|회사입니다|회사는|회사|측에서|측|쪽|님|의|은|는|이|가|에|도|와|과|로|으로|요)$/;
// 업체 이름 바로 뒤에서 함께 걷어 낼 낱말 / 바로 앞에서 함께 걷어 낼 인사·군말
const STRIP_AFTER = new Set(["입니다", "입니다만", "이에요", "예요", "이고요", "이고", "이며", "이라고", "업체", "업체입니다", "회사", "회사입니다", "소속", "소속입니다", "소속의", "에서", "에서는", "측", "쪽", "의", "이요"]);
const STRIP_BEFORE = new Set(["저는", "저", "저희는", "저희", "제가", "나는", "안녕하세요", "안녕하십니까", "여기는", "여기", "지금", "네", "예", "자", "음", "어", "아", "저기", "그럼"]);

function coreOf(token) {
  return String(token)
    .replace(/^["'“‘(\[]+/, "")
    .replace(/[,.!?~…。、，;:"'”’)\]]+$/, "");
}

function tokensOf(text) {
  return String(text == null ? "" : text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      return { raw, core: coreOf(raw), key: companyKey(raw) };
    });
}

// 등록한 업체마다 견줄 이름들(이름 + 줄여 부르는 이름)
function entriesOf(companies, skipKeys) {
  const out = [];
  for (const co of Array.isArray(companies) ? companies : []) {
    const names = [co.name, ...(Array.isArray(co.aliases) ? co.aliases : [])];
    names.forEach((n, i) => {
      const key = companyKey(n);
      if (key.length < 2 || (skipKeys && skipKeys.has(key))) return;
      out.push({ co, key, alias: i > 0 });
    });
  }
  return out;
}

function syllables(key) {
  return (String(key).match(/[가-힣]/g) || []).length;
}

// 이름이 같은 낱말 묶음을 모두 찾는다. 반환: [{ co, from, to, len(이름 글자 수), how: "exact"|"alias" }] (낱말 번호 from~to, 끝 포함)
function exactHits(tokens, entries) {
  const hits = [];
  for (let i = 0; i < tokens.length; i += 1) {
    let joined = "";
    for (let j = i; j < tokens.length && j < i + MAX_WINDOW; j += 1) {
      const head = joined;
      joined += tokens[j].key;
      if (!tokens[j].key) continue;
      for (const e of entries) {
        if (joined === e.key) hits.push({ co: e.co, from: i, to: j, len: e.key.length, how: e.alias ? "alias" : "exact" });
        else if (joined.length > e.key.length && e.key.length > head.length && joined.startsWith(e.key) && SUFFIX_OK.test(joined.slice(e.key.length))) {
          hits.push({ co: e.co, from: i, to: j, len: e.key.length, how: e.alias ? "alias" : "exact" });
        }
      }
    }
  }
  return hits;
}

// 소리가 거의 같은 이름을 찾는다(같은 이름이 하나도 없을 때만 부른다). 반환: { co, from, to, sim, how: "near" } 또는 null
function nearHit(tokens, entries) {
  const cands = entries.filter((e) => syllables(e.key) >= NEAR_MIN_SYLLABLES && /^[가-힣a-z0-9]+$/.test(e.key));
  if (!cands.length) return null;
  const found = [];
  for (let i = 0; i < tokens.length; i += 1) {
    let joined = "";
    for (let j = i; j < tokens.length && j < i + 3; j += 1) {
      joined += tokens[j].key;
      if (!/^[가-힣]+$/.test(joined)) break;
      const forms = [joined];
      // 뒤에 붙은 조사·끝맺음("입니다")을 떼어 낸 모양도 견준다
      for (const s of ["입니다", "이에요", "예요", "이고요", "에서는", "에서", "소속", "업체", "회사", "의", "은", "는", "이", "가"]) {
        if (joined.length - s.length >= NEAR_MIN_SYLLABLES && joined.endsWith(s)) forms.push(joined.slice(0, joined.length - s.length));
      }
      for (const form of forms) {
        for (const e of cands) {
          if (Math.abs(form.length - e.key.length) > 2) continue;
          const sim = jamoSimilarity(form, e.key);
          if (sim >= NEAR_MIN_SIM) found.push({ co: e.co, from: i, to: j, sim, how: "near", len: e.key.length });
        }
      }
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => b.sim - a.sim || b.len - a.len);
  const best = found[0];
  // 다른 업체가 거의 같게 닮았으면 어느 쪽인지 가릴 수 없다
  const rival = found.find((f) => f.co.id !== best.co.id && f.sim > best.sim - NEAR_MARGIN);
  return rival ? null : best;
}

// 겹치지 않게 고른다: 긴 이름을 먼저, 같으면 앞에 나온 것을 먼저
function pickHits(hits) {
  const sorted = hits.slice().sort((a, b) => b.len - a.len || a.from - b.from);
  const chosen = [];
  for (const h of sorted) {
    if (chosen.some((c) => !(h.to < c.from || h.from > c.to))) continue;
    chosen.push(h);
  }
  return chosen.sort((a, b) => a.from - b.from);
}

// 낱말 번호 from~to와 바로 이어진 끝맺음·인사 낱말까지 걷어 낸 나머지 글
function removeSpan(tokens, from, to) {
  let a = from;
  let b = to;
  let n = 0;
  while (b + 1 < tokens.length && n < 2 && STRIP_AFTER.has(tokens[b + 1].core)) {
    b += 1;
    n += 1;
  }
  n = 0;
  while (a - 1 >= 0 && n < 3 && STRIP_BEFORE.has(tokens[a - 1].core)) {
    a -= 1;
    n += 1;
  }
  return tokens
    .filter((_, i) => i < a || i > b)
    .map((t) => t.raw)
    .join(" ")
    .trim();
}

// 말한 글 속의 등록된 업체 하나를 찾는다. 반환: { company, how, from, to, rest } 또는 null.
//   업체가 둘 이상 나오면(다른 업체를 이야기하는 말일 수 있다) 글 맨 앞에서 말한 업체만 읽는다.
//   opts.genericKeys: 공종·작업 말과 똑같은 이름은 건너뛴다(기본: genericKeys()).
export function findCompanyInText(text, companies, opts = {}) {
  const list = Array.isArray(companies) ? companies : [];
  if (!list.length) return null;
  const skip = opts.genericKeys || genericKeys();
  const entries = entriesOf(list, skip);
  if (!entries.length) return null;
  const tokens = tokensOf(text);
  if (!tokens.length) return null;
  let hits = pickHits(exactHits(tokens, entries));
  if (!hits.length) {
    const near = nearHit(tokens, entries);
    hits = near ? [near] : [];
  }
  if (!hits.length) return null;
  const distinct = new Set(hits.map((h) => h.co.id));
  const hit = hits[0];
  if (distinct.size > 1 && hit.from > 2) return null;
  return { company: hit.co, how: hit.how, from: hit.from, to: hit.to, rest: removeSpan(tokens, hit.from, hit.to) };
}

// 소개 말에서 읽은 업체 이름 글("한빛 인테리어")이 등록한 업체인가. 반환: { company, how } 또는 null.
// 소개에서 말한 이름은 분명한 자리에 있으므로 공종 말과 같은 이름도 허용한다(건너뛰지 않는다).
export function matchCompanyName(name, companies) {
  const list = Array.isArray(companies) ? companies : [];
  const key = companyKey(name);
  if (!key || !list.length) return null;
  const entries = entriesOf(list, null);
  const exact = entries.filter((e) => e.key === key);
  const ids = new Set(exact.map((e) => e.co.id));
  if (ids.size === 1) return { company: exact[0].co, how: exact[0].alias ? "alias" : "exact" };
  if (ids.size > 1) return null;
  const hit = findCompanyInText(name, list, { genericKeys: new Set() });
  return hit ? { company: hit.company, how: hit.how } : null;
}

// 녹음한 글에서 말한 업체를 읽는다.
//   intro: speakerIntro.js parseSpeakerIntro 결과("OO건설 소속 홍길동"을 말했으면 found). 이미 읽은 소개 말은 rest에서 빠져 있다.
//   반환: { company(등록한 업체 | null), how, rest(업체 이름 말을 뗀 분석용 글) }
//   소개에서 말한 소속이 등록한 업체가 아니면 그 소속만 말한 사람의 소속으로 남고, 글 속의 다른 업체 이름은 읽지 않는다(다른 업체를 이야기하는 말일 수 있다).
export function readSpokenCompany(rawText, intro, companies = getCompanies()) {
  const text = String(rawText == null ? "" : rawText).trim();
  const found = !!(intro && intro.found);
  const body = found ? intro.rest : text;
  const list = Array.isArray(companies) ? companies : [];
  if (!list.length) return { company: null, how: "", rest: body };
  if (found && intro.company) {
    const m = matchCompanyName(intro.company, list);
    return m ? { company: m.company, how: m.how, rest: body } : { company: null, how: "", rest: body };
  }
  const hit = findCompanyInText(body, list);
  if (!hit) return { company: null, how: "", rest: body };
  return { company: hit.company, how: hit.how, rest: hit.rest };
}

// ---------------------------------------------------------------- 보고 하나와 업체 잇기

// 보고의 세부 공종: 말한 작업이 있으면 그것, 없으면 업체가 이 공종에서 따로 맡은 세부 공종(공종 전체를 맡았으면 비워 둔다).
// 반환: { item(보고에 적을 세부 공종), derived(업체 담당에서 가져왔는가), mismatch(업체는 공종을 등록했지만 이 공종은 맡지 않는다) }
export function tradeLinkOf(company, tradeId, spokenItem = "") {
  const spoken = oneLine(spokenItem);
  if (!company) return { item: spoken, derived: false, mismatch: false };
  const covers = coversTrade(company, tradeId);
  const mismatch = hasTrades(company) && !covers;
  if (spoken) return { item: spoken, derived: false, mismatch };
  const own = covers ? itemsOfCompany(company, tradeId) : [];
  const item = joinItems(own);
  return { item, derived: !!item, mismatch };
}

// 저장된 음성 기록 하나의 업체(서류용). 등록한 업체와 이어지면 { id, name }, 아니면 null.
//   1) 저장할 때 이어 둔 업체(companyId)가 지금도 등록되어 있으면 그 업체(이름을 고쳤어도 지금 이름)  2) 이어 둔 이름만 있으면 그 이름
//   3) 이어 둔 것이 없는 기록(등록하기 전에 남긴 기록 · 예전 기록)은 말한 소속·말한 글에서 같은 방법으로 읽는다 - 업체를 나중에 등록해도 예전 기록이 이어진다.
export function companyOfReport(report, companies = getCompanies()) {
  if (!report || typeof report !== "object") return null;
  const list = Array.isArray(companies) ? companies : [];
  const id = typeof report.companyId === "string" ? report.companyId : "";
  const saved = list.find((c) => c.id === id);
  if (saved) return { id: saved.id, name: saved.name };
  const name = typeof report.company === "string" ? oneLine(report.company) : "";
  if (name) {
    const m = matchCompanyName(name, list);
    return m ? { id: m.company.id, name: m.company.name } : { id: "", name };
  }
  if (!list.length) return null;
  const raw = typeof report.rawText === "string" ? report.rawText : "";
  const sp = speakerOf(report); // 저장해 둔 소속, 없으면 말한 글에서 읽은 소속
  if (sp && sp.company) {
    const m = matchCompanyName(sp.company, list);
    return m ? { id: m.company.id, name: m.company.name } : null; // 소속을 말했는데 등록한 업체가 아니면, 글 속의 다른 이름은 읽지 않는다
  }
  if (!raw) return null;
  const read = readSpokenCompany(raw, parseSpeakerIntro(raw), list);
  return read.company ? { id: read.company.id, name: read.company.name } : null;
}

// 서류 모음에서 쓸 업체: 등록한 업체 한 곳과 이어진 기록의 업체 객체(공종 정보까지) 또는 null
export function registeredCompanyOf(link, companies = getCompanies()) {
  if (!link || !link.id) return null;
  return (Array.isArray(companies) ? companies : []).find((c) => c.id === link.id) || null;
}

// 등록하지 않은 업체: 기록에서 소속으로 말했지만 등록한 업체와 이어지지 않은 이름들. [{ name, count }] (많이 말한 순)
export function unregisteredCompanies(reports, companies = getCompanies()) {
  const map = new Map();
  for (const r of Array.isArray(reports) ? reports : []) {
    if (!r || typeof r !== "object") continue;
    const sp = speakerOf(r);
    const sc = sp && sp.company ? oneLine(sp.company) : "";
    if (!sc || companyOfReport(r, companies)) continue;
    const key = companyKey(sc);
    if (!key) continue;
    const row = map.get(key) || { name: sc, count: 0 };
    row.count += 1;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}

// ---------------------------------------------------------------- TBM 회의

// TBM 회의를 요약한 칸(summarizeTbm의 fields)에 업체를 잇는다.
//   - 진행자에 등록한 업체 이름(또는 줄여 부르는 이름)이 있으면 등록한 이름으로 바로잡는다("한빛 인테리어 홍길동 소장" → "한빛인테리어 홍길동 소장").
//   - 작업 내용을 찾지 못했는데 회의에서 말한 업체가 이 QR의 공종을 맡고 있으면, 그 업체가 맡은 세부 공종(없으면 공종 이름)을 작업 내용에 넣는다.
// 반환: { fields(바꾼 칸), company(이어진 업체 | null), note({ company, work } - 작업 내용을 업체에서 가져왔을 때만, 없으면 null), workFromCompany(작업 내용을 업체에서 가져왔는가) }
export function linkTbmCompany(fields, text, tradeId, companies = getCompanies()) {
  const f = fields && typeof fields === "object" ? { ...fields } : {};
  const list = Array.isArray(companies) ? companies : [];
  const none = { fields: f, company: null, note: null, workFromCompany: false };
  if (!list.length) return none;
  let company = null;
  let leader = typeof f.leader === "string" ? f.leader : "";
  if (leader) {
    const tokens = tokensOf(leader);
    const entries = entriesOf(list, null);
    const hits = tokens.length ? pickHits(exactHits(tokens, entries)) : [];
    const near = hits.length ? null : tokens.length ? nearHit(tokens, entries) : null;
    const hit = hits.length ? hits[0] : near;
    if (hit) {
      company = hit.co;
      const before = tokens.slice(0, hit.from).map((t) => t.raw);
      const after = tokens.slice(hit.to + 1).map((t) => t.raw);
      leader = [...before, hit.co.name, ...after].join(" ").trim();
      f.leader = leader;
    }
  }
  if (!company) {
    // 진행자에서 못 찾으면, 회의 글 전체에서 등록한 업체가 딱 하나만 나올 때만 그 업체로 본다(여러 업체 이야기가 섞였으면 읽지 않는다)
    const hit = findCompanyInText(text, list);
    if (hit) {
      const all = pickHitsFor(text, list);
      if (all.size <= 1) company = hit.company;
    }
  }
  if (!company) return none;
  let note = null;
  let workFromCompany = false;
  if (!oneLine(f.work) && coversTrade(company, tradeId)) {
    const own = itemsOfCompany(company, tradeId);
    const work = own.length ? own.join(", ") : categoryName(tradeId);
    if (work) {
      f.work = work;
      workFromCompany = true;
      note = { company: company.name, work };
    }
  }
  return { fields: f, company, note, workFromCompany };
}

// 글에서 (겹치지 않게 고른) 서로 다른 등록 업체의 id 모음
function pickHitsFor(text, list) {
  const tokens = tokensOf(text);
  const entries = entriesOf(list, genericKeys());
  return new Set(pickHits(exactHits(tokens, entries)).map((h) => h.co.id));
}

// 표준 공종 항목(체크리스트)에서 한 공종의 항목 글들. 업체 편집 화면의 선택지.
export function tradeItemTexts(checklistItems, categoryId) {
  return itemsForCategory(checklistItems, categoryId).map((i) => i.text);
}
