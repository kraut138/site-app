// TBM 회의 녹음 초안(받아 적은 글 + 칸에 넣을 값)을 날짜별로 이 기기의 브라우저에만 남긴다. 서버로 보내지 않는다.
// 회의를 녹음하다 화면을 닫거나 다른 탭에 다녀와도 받아 적은 글과 고친 칸이 그대로 있게 하려는 것이다.
// 저장소를 못 쓰는 브라우저(개인정보 보호 모드 등)에서는 저장 없이 화면을 보는 동안만 기억한다. 어떤 값이 와도 던지지 않는다.
import { cleanTbmFields, emptyTbmFields, CHECK_KEYS, TBM_RISK_MAX, TBM_TEXT_MAX, TBM_LIMITS } from "./tbmSummary.js";
import { isDayKey } from "./dayTools.js";

export const DRAFT_PREFIX = "sitetong.tbm.";
export const DRAFT_KEEP_DAYS = 30; // 이보다 오래된 날짜의 초안은 지운다
const FIELD_SLACK = 2; // 화면에서 고치는 동안은 칸 한도의 두 배까지 받아 둔다(서류에 넣을 때 칸 한도로 줄인다)

// 화면에서 고치는 칸 값(서류에 넣기 전의 원래 값). 요약 결과(cleanTbmFields 모양)와 다른 점은 교육·전달 사항이 줄바꿈으로 이은 글 하나라는 것뿐이다.
export function fieldsForEdit(f) {
  const c = cleanTbmFields(f);
  return {
    site: c.site,
    leader: c.leader,
    headcount: c.headcount,
    from: c.from,
    to: c.to,
    place: c.place,
    work: c.work,
    risks: c.risks.map((r) => ({ hazard: r.hazard, measure: r.measure })),
    checks: { ...c.checks },
    notes: c.notes.join("\n"),
  };
}

export const emptyEditFields = () => fieldsForEdit(emptyTbmFields());

export function emptyDraft() {
  return { v: 1, text: "", fields: emptyEditFields(), summarized: false, edited: false, sumHash: "", useDigest: false, at: 0 };
}

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

// 저장해 둔 값(또는 아무 값)을 화면이 쓸 수 있는 모양으로 바로잡는다. 모르는 칸은 버리고, 없는 칸은 빈 값으로 채운다.
export function normalizeFields(raw) {
  const out = emptyEditFields();
  const r = raw && typeof raw === "object" ? raw : {};
  out.site = str(r.site, TBM_LIMITS.site * FIELD_SLACK);
  out.leader = str(r.leader, TBM_LIMITS.leader * FIELD_SLACK);
  out.headcount = str(typeof r.headcount === "number" ? String(r.headcount) : r.headcount, 6).replace(/[^\d]/g, "");
  out.from = /^\d{1,2}:\d{2}$/.test(str(r.from, 8)) ? r.from : "";
  out.to = /^\d{1,2}:\d{2}$/.test(str(r.to, 8)) ? r.to : "";
  out.place = str(r.place, TBM_LIMITS.place * FIELD_SLACK);
  out.work = str(r.work, TBM_LIMITS.work * FIELD_SLACK);
  out.risks = (Array.isArray(r.risks) ? r.risks : [])
    .slice(0, TBM_RISK_MAX)
    .map((x) => ({ hazard: str(x && x.hazard, TBM_LIMITS.hazard * FIELD_SLACK), measure: str(x && x.measure, TBM_LIMITS.measure * FIELD_SLACK) }));
  if (r.checks && typeof r.checks === "object") for (const k of CHECK_KEYS) out.checks[k] = r.checks[k] === true;
  out.notes = Array.isArray(r.notes) ? r.notes.map((x) => str(x, 200)).join("\n").slice(0, 2000) : str(r.notes, 2000);
  return out;
}

export function normalizeDraft(raw) {
  const base = emptyDraft();
  if (!raw || typeof raw !== "object") return base;
  return {
    v: 1,
    text: str(raw.text, TBM_TEXT_MAX),
    fields: normalizeFields(raw.fields),
    summarized: raw.summarized === true,
    edited: raw.edited === true,
    sumHash: str(raw.sumHash, 16),
    useDigest: raw.useDigest === true, // 회의를 녹음했을 때 남는 위험요인 줄을 그 날 음성 기록으로 채울지(기본: 채우지 않는다)
    at: Number.isFinite(raw.at) ? raw.at : 0,
  };
}

// 받아 적은 글이 마지막 요약 뒤에 바뀌었는지 가려내는 짧은 값(글을 두 벌 저장하지 않으려고 쓴다)
export function hashText(text) {
  const s = String(text == null ? "" : text);
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${s.length.toString(36)}-${h.toString(36)}`;
}

// 글도 칸 내용도 없는 빈 초안인가(빈 초안은 저장소에 남기지 않는다). 회의 시각만 있는 것은 내용이 아니다.
export function isEmptyDraft(d) {
  const x = normalizeDraft(d);
  const f = x.fields;
  return !x.text.trim() && !x.summarized && !(f.site || f.leader || f.headcount || f.place || f.work || f.notes.trim()) && !f.risks.some((r) => r.hazard || r.measure) && !CHECK_KEYS.some((k) => f.checks[k]);
}

const draftKey = (dayKey) => `${DRAFT_PREFIX}${dayKey}`;

function defaultStorage() {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadTbmDraft(dayKey, storage) {
  const st = storage !== undefined ? storage : defaultStorage();
  if (!st || !isDayKey(dayKey)) return emptyDraft();
  try {
    const raw = st.getItem(draftKey(dayKey));
    if (!raw) return emptyDraft();
    return normalizeDraft(JSON.parse(raw));
  } catch {
    return emptyDraft();
  }
}

// 저장했으면 true. 빈 초안이면 저장소에서 지운다.
export function saveTbmDraft(dayKey, draft, storage) {
  const st = storage !== undefined ? storage : defaultStorage();
  if (!st || !isDayKey(dayKey)) return false;
  try {
    if (isEmptyDraft(draft)) {
      st.removeItem(draftKey(dayKey));
      return true;
    }
    st.setItem(draftKey(dayKey), JSON.stringify({ ...normalizeDraft(draft), at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearTbmDraft(dayKey, storage) {
  const st = storage !== undefined ? storage : defaultStorage();
  if (!st || !isDayKey(dayKey)) return false;
  try {
    st.removeItem(draftKey(dayKey));
    return true;
  } catch {
    return false;
  }
}

const dayNumber = (dayKey) => {
  const [y, m, d] = String(dayKey).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

// 오래된 날짜의 초안을 지운다. 지운 개수를 돌려준다.
export function purgeOldTbmDrafts(todayKey, storage, keepDays = DRAFT_KEEP_DAYS) {
  const st = storage !== undefined ? storage : defaultStorage();
  if (!st || !isDayKey(todayKey)) return 0;
  let removed = 0;
  try {
    const names = [];
    for (let i = 0; i < st.length; i += 1) {
      const k = st.key(i);
      if (typeof k === "string" && k.startsWith(DRAFT_PREFIX)) names.push(k);
    }
    const today = dayNumber(todayKey);
    for (const k of names) {
      const day = k.slice(DRAFT_PREFIX.length);
      if (!isDayKey(day) || today - dayNumber(day) > keepDays) {
        st.removeItem(k);
        removed += 1;
      }
    }
  } catch {
    // 지우지 못해도 화면은 그대로 동작한다
  }
  return removed;
}
