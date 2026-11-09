// 음성 인식이 띄어쓰기 없이 붙여 준 글을 용어 DB의 단어를 기준으로 먼저 끊어 주는 도우미("음성 보정 관제"의 Step 1과 같은 방식).
// 음성 보고의 실제 처리와 '5. 서류 작성 > 음성 보정 관제' 화면이 이 파일을 함께 쓴다.
//   - 용어 DB의 현장 은어(소리가 비슷한 말 포함)와 표준 용어, 흔한 조사·어미를 만나면 거기서 끊는다(최장 일치). 어디에도 맞지 않는 글자는 모아서 한 낱말로 둔다.
//   - 끊어 둔 글을 용어 DB 변환(convertVoiceText)에 넣으면 '비슷한 용어 찾기'가 붙여 쓴 문장 한가운데의 잘못 들린 말도 낱말 단위로 찾을 수 있다.
//   - convertVoiceTextSpaced: 말한 그대로(rawText)는 건드리지 않고, 호실·진행도를 읽는 글(normalized)은 예전과 똑같이 말한 그대로에서 만든다.
//     끊은 글은 화면에 보여 주는 '순화한 내용'(shown·dbText)과 요약에만 쓴다. 어떤 이유로든 끊기에 실패하면 예전 방식 그대로 돌려준다.
import { FUZZY_LEVELS, normalizeFuzzy, soundsDistance, soundsOfText, toJamo } from "./fuzzyTerms.js";
import { convertVoiceText, slangKey, standardForms } from "./voice.js";

// 말 끝에 붙는 조사·어미·자주 쓰는 말(띄어쓰기 복원에서 낱말의 끝을 찾는 데 쓴다)
export const COMMON_PARTICLES = ["치고", "했고", "했응게", "했심더", "하고", "대고", "받쳐라", "치우고", "꼽아", "확인해", "잡고", "쏴서", "쳐도", "됨", "완료", "이상무", "끝났응게", "밑에", "위에"];

const EPS = 1e-9;
export const SIMILAR_ONLY_COST = 0.5; // 비슷한 소리끼리 바꾼 것 한 번의 값 (fuzzyTerms.js의 SIMILAR_COST와 같다)
export const SHORT_SOUNDS = 5; // 소리(자모)가 이 수 이하인 짧은 단어는 비슷한 소리 바꿈만 허용한다 (용어 DB의 비슷한 용어 찾기와 같은 규칙)
export const MIN_FUZZY_SOUNDS = 4; // 소리가 이보다 적은 단어는 정확히 같을 때만 찾는다
const MAX_TEXT = 400; // 이보다 긴 글은 끊지 않는다(휴대폰에서 오래 걸리지 않도록)

const isHangulOnly = (s) => /^[가-힣]+$/.test(s);

// 용어 표 → 견주기에 쓰는 목록 (한글로만 된 은어만). withStandard: 표준 용어(와 그 낱말들)를 직접 말한 것도 '정확히 같을 때만' 찾는 단어로 더한다.
export function buildEntries(terms, withStandard = false) {
  const out = [];
  const seen = new Set();
  (terms || []).forEach((t, i) => {
    if (!t) return;
    const key = slangKey(t.slang);
    if (key.length >= 2 && isHangulOnly(key) && !seen.has(key)) {
      seen.add(key);
      out.push({ id: t.id, no: i + 1, slang: t.slang, key, standard: t.standard, jamo: toJamo(key), sounds: soundsOfText(key) });
    }
  });
  if (withStandard) {
    (terms || []).forEach((t) => {
      if (!t || typeof t.standard !== "string") return;
      standardForms(t.standard).forEach((form) => {
        const key = slangKey(form);
        if (key.length < 2 || !isHangulOnly(key) || seen.has(key)) return;
        seen.add(key);
        out.push({ id: t.id, no: 0, slang: form, key, standard: t.standard, jamo: toJamo(key), sounds: soundsOfText(key), exactOnly: true });
      });
    });
  }
  return out;
}

// text(띄어쓰기 없는 한 낱말, 소리로 쪼갠 값 x)가 entry의 현장 은어와 같은 말인지. 같으면 { entry, sim, dist }, 아니면 null.
function compare(text, x, entry, level) {
  if (text === entry.key) return { entry, sim: 1, dist: 0 };
  if (entry.exactOnly) return null;
  const threshold = FUZZY_LEVELS[level] || 0;
  const y = entry.sounds;
  if (!(threshold > 0) || y.length < MIN_FUZZY_SOUNDS || x.length < 2) return null;
  const longest = Math.max(x.length, y.length);
  if (Math.abs(x.length - y.length) > (1 - threshold) * longest + EPS) return null; // 소리 수가 너무 다르면 거리를 셀 필요가 없다
  const dist = soundsDistance(x, y);
  const sim = 1 - dist / longest;
  if (sim + EPS < threshold) return null;
  if (y.length <= SHORT_SOUNDS && (x.length !== y.length || dist > SIMILAR_ONLY_COST + EPS)) return null;
  return { entry, sim, dist };
}

// entries 배열마다 한 번만 만드는 찾기 색인: 같은 글자(key)와 글자 수별 목록. 수천 개 용어에서도 글자 수가 비슷한 것만 소리를 견주게 한다.
const indexCache = new WeakMap();
function indexOf(entries) {
  let idx = indexCache.get(entries);
  if (!idx) {
    idx = { exact: new Map(), byLen: new Map() };
    entries.forEach((e) => {
      if (!idx.exact.has(e.key)) idx.exact.set(e.key, e);
      if (e.exactOnly) return; // 표준 용어는 정확히 같을 때만 찾으므로 소리 견주기 목록에는 넣지 않는다
      const list = idx.byLen.get(e.key.length);
      if (list) list.push(e);
      else idx.byLen.set(e.key.length, [e]);
    });
    indexCache.set(entries, idx);
  }
  return idx;
}

// 용어 DB에서 text와 가장 닮은 은어 하나 (기준을 못 넘으면 null)
export function bestMatch(text, entries, level) {
  const t = String(text || "");
  if (!isHangulOnly(t)) return null;
  const idx = indexOf(entries);
  const exact = idx.exact.get(t);
  if (exact) return { entry: exact, sim: 1, dist: 0 };
  if (!(FUZZY_LEVELS[level] > 0)) return null;
  let best = null;
  const x = soundsOfText(t);
  // 글자 수가 두 글자 넘게 다르면 소리가 비슷할 수 없다 - 글자 수가 비슷한 은어만 견준다
  for (let len = t.length - 2; len <= t.length + 2; len += 1) {
    const list = idx.byLen.get(len);
    if (!list) continue;
    for (const e of list) {
      const r = compare(t, x, e, level);
      if (r && (!best || r.sim > best.sim + EPS)) best = r;
    }
  }
  return best;
}

// Step 1: 최장 일치 방식 띄어쓰기 복원. 용어 DB 단어(소리가 비슷한 말 포함)나 조사·어미를 만나면 거기서 끊고, 어디에도 맞지 않는 글자는 모아서 한 낱말로 둔다.
export function autoSegment(raw, entries, level) {
  const blocks = String(raw || "").trim().split(/\s+/).filter(Boolean);
  const maxLen = Math.min(8, entries.reduce((m, e) => Math.max(m, e.key.length), 0) + 1);
  const tokens = [];
  blocks.forEach((block) => {
    let i = 0;
    let other = "";
    const flush = () => {
      if (other) tokens.push(other);
      other = "";
    };
    while (i < block.length) {
      let hit = 0;
      for (let len = Math.min(maxLen, block.length - i); len >= 2; len -= 1) {
        const sub = block.slice(i, i + len);
        if (COMMON_PARTICLES.includes(sub) || bestMatch(sub, entries, level)) {
          hit = len;
          break;
        }
      }
      if (hit) {
        flush();
        tokens.push(block.slice(i, i + hit));
        i += hit;
      } else {
        other += block[i];
        i += 1;
      }
    }
    flush();
  });
  return tokens;
}

// 표(배열) 하나마다 한 번만 만든다.
const entriesCache = new WeakMap();
function entriesFor(terms) {
  if (!Array.isArray(terms)) return [];
  if (!entriesCache.has(terms)) entriesCache.set(terms, buildEntries(terms, true));
  return entriesCache.get(terms);
}

// 붙여 쓴 글을 용어 DB 기준으로 끊어 띄어쓴 글을 돌려준다. 끊을 수 없으면(표가 비었거나 너무 긴 글) 받은 글 그대로.
export function spaceVoiceText(raw, terms, fuzzy = "off") {
  const text = String(raw == null ? "" : raw);
  if (!text.trim() || text.length > MAX_TEXT) return text;
  const entries = entriesFor(terms);
  if (entries.length === 0) return text;
  return autoSegment(text, entries, normalizeFuzzy(fuzzy)).join(" ");
}

// convertVoiceText와 같은 모양을 돌려준다. 순화한 내용(shown·dbText·parts·fuzzy·dropped)과 요약은 끊은 글에서, normalized는 말한 그대로에서 만든다.
export function convertVoiceTextSpaced(raw, terms, onlyDb, fuzzy = "off") {
  const base = convertVoiceText(raw, terms, onlyDb, fuzzy);
  try {
    const spaced = spaceVoiceText(raw, terms, fuzzy);
    if (!spaced || spaced === String(raw).trim()) return base;
    const converted = convertVoiceText(spaced, terms, onlyDb, fuzzy);
    return { ...converted, normalized: base.normalized };
  } catch {
    return base;
  }
}
