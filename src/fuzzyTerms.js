// 음성 인식이 잘못 들은 말을 용어 DB의 '가장 비슷한 용어'로 찾는 계산 (레벤슈타인 거리).
//
// 레벤슈타인 거리: 한 낱말을 다른 낱말로 바꾸려면 글자를 몇 번 넣고(삽입)·빼고(삭제)·바꿔야(치환) 하는지의 가장 적은 횟수.
// 한글은 글자(음절) 하나가 여러 소리(자음·모음)로 이루어져서, 글자 통째로 견주면 "씨"와 "시"가 아예 다른 글자가 되어 버린다.
// 그래서 글자를 자모(ㅅ·ㅣ 같은 소리 단위)로 풀어서 견준다.
//  - 소리 나지 않는 첫 'ㅇ'은 뺀다("아" = ㅏ, "앙" = ㅏㅇ). 겹받침은 둘로 나눈다("값" = ㄱㅏㅂㅅ).
//  - 음성 인식이 자주 헷갈리는 비슷한 소리끼리(ㅅ↔ㅆ, ㄱ↔ㅋ↔ㄲ, ㅐ↔ㅔ …) 바꾼 것은 한 번이 아니라 반 번으로 센다. (삽입·삭제와 그 밖의 치환은 한 번)
//  - 유사도 = 1 - 거리 ÷ (견주는 두 말 중 자모 수가 더 많은 쪽)  → 1이면 소리가 같고, 0에 가까울수록 다른 말이다.
//
// 용어 DB의 단어마다 '말한 글'의 어느 부분과 가장 비슷한지 찾고, 유사도가 기준 이상일 때만 그 단어로 본다.
//  - 말한 글을 한글 낱말로 나누고, 낱말이 시작하는 자리마다 거기서부터 이어지는 글(낱말 최대 3개를 띄어쓰기 한 칸으로 이은 것 - 음성 인식이 "나라 시"처럼 나눠 적기도 한다)의 앞부분과 견준다.
//    앞부분은 글자(음절) 경계에서만 자른다 - "나라씨를"에서 "나라씨"까지만 단어로 보고 "를"은 남긴다(조사·어미가 붙은 경우).
//    다만 낱말 한가운데서 끊는 것은 첫 낱말에서만 허용하고(띄어 쓴 두 낱말 이상은 낱말 끝까지 다 들어가야 한다), 끊을 때는 기준을 5%p 더 엄격하게 본다 -
//    "나라 사랑"이나 "나라사랑"이 "나라시"로 바뀌지 않도록.
//  - 소리(자모)가 5개 이하인 짧은 단어("하리", "메지", "덴바", "아시바")는 비슷한 소리끼리 바꾼 것(반 번짜리 치환)만 허용한다.
//    짧은 말은 글자 하나만 달라도 전혀 다른 흔한 말이 되기 때문이다("공사"가 "경사"로, "하루"가 "하리"로 바뀌면 안 된다).
//  - 한글 두 글자 이상으로만 된 단어만 대상이다(영문·숫자가 섞인 단어는 정확히 같을 때만 찾는다).

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
// 받침(28가지, 첫째는 받침 없음). 겹받침은 소리 둘로 나눠 적었다.
const JONG = ["", "ㄱ", "ㄲ", "ㄱㅅ", "ㄴ", "ㄴㅈ", "ㄴㅎ", "ㄷ", "ㄹ", "ㄹㄱ", "ㄹㅁ", "ㄹㅂ", "ㄹㅅ", "ㄹㅌ", "ㄹㅍ", "ㄹㅎ", "ㅁ", "ㅂ", "ㅂㅅ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const SOUNDS = CHO + JUNG; // 40가지 소리. 글자의 위치가 소리의 번호다(받침의 자음도 같은 번호를 쓴다).
const N = SOUNDS.length;
const SILENT_O = 11; // 첫소리 'ㅇ'

// 비슷하게 들려 음성 인식이 자주 헷갈리는 소리들(같은 묶음끼리 바꾸면 반 번으로 센다)
const SIMILAR = ["ㄱㅋㄲ", "ㄷㅌㄸ", "ㅂㅍㅃ", "ㅈㅊㅉ", "ㅅㅆ", "ㅐㅔ", "ㅒㅖ", "ㅙㅞㅚ", "ㅢㅣ"];
export const SIMILAR_COST = 0.5;

const GROUP = new Int8Array(N).fill(-1);
SIMILAR.forEach((chars, g) => {
  for (const ch of chars) GROUP[SOUNDS.indexOf(ch)] = g;
});
// SUB[a * N + b] = 소리 a를 소리 b로 바꾸는 값
const SUB = new Float32Array(N * N);
for (let a = 0; a < N; a += 1) {
  for (let b = 0; b < N; b += 1) SUB[a * N + b] = a === b ? 0 : GROUP[a] >= 0 && GROUP[a] === GROUP[b] ? SIMILAR_COST : 1;
}

// 한글 음절(가~힣)인지
function isSyllableCode(code) {
  return code >= 0xac00 && code <= 0xd7a3;
}

// 음절 하나를 소리 번호들로 풀어 out에 이어 붙인다.
function pushSyllable(out, code) {
  const s = code - 0xac00;
  const cho = Math.floor(s / 588);
  const jung = Math.floor((s % 588) / 28);
  const jong = s % 28;
  if (cho !== SILENT_O) out.push(cho);
  out.push(19 + jung);
  if (jong) for (const ch of JONG[jong]) out.push(SOUNDS.indexOf(ch));
}

// 글 속의 한글 음절만 소리 번호로 푼다(한글이 아닌 글자는 건너뛴다).
function soundsOf(text) {
  const out = [];
  const src = String(text == null ? "" : text);
  for (let i = 0; i < src.length; i += 1) {
    const code = src.charCodeAt(i);
    if (isSyllableCode(code)) pushSyllable(out, code);
  }
  return out;
}

// 글을 자모(소리) 글자들로 푼다. 예: "값" → ["ㄱ","ㅏ","ㅂ","ㅅ"], "아" → ["ㅏ"]. (확인·시험용)
export function toJamo(text) {
  return soundsOf(text).map((id) => SOUNDS[id]);
}

// ---------------- 레벤슈타인 거리 ----------------
// a, b: 글자(문자열) 또는 배열. cost(x, y)를 주면 치환 값을 바꾼다(기본: 같으면 0, 다르면 1). 삽입·삭제는 늘 1.
// 표준 레벤슈타인 거리를 그대로 계산한다 (예: kitten → sitting = 3).
export function levenshtein(a, b, cost) {
  const x = typeof a === "string" ? Array.from(a) : Array.from(a || []);
  const y = typeof b === "string" ? Array.from(b) : Array.from(b || []);
  const n = x.length;
  const m = y.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Array(m + 1);
  let cur = new Array(m + 1);
  for (let j = 0; j <= m; j += 1) prev[j] = j;
  for (let i = 1; i <= n; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= m; j += 1) {
      const sub = prev[j - 1] + (cost ? cost(x[i - 1], y[j - 1]) : x[i - 1] === y[j - 1] ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      cur[j] = Math.min(sub, del, ins);
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[m];
}

// 두 한글 말의 소리(자모) 거리와 유사도. 한글이 아닌 글자는 무시한다.
export function jamoDistance(a, b) {
  return levenshtein(soundsOf(a), soundsOf(b), (p, q) => SUB[p * N + q]);
}

export function jamoSimilarity(a, b) {
  const x = soundsOf(a);
  const y = soundsOf(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(x, y, (p, q) => SUB[p * N + q]) / longest;
}

// ---------------- 비슷한 용어 찾기 ----------------
// 단계별 기준: 이 유사도 이상이면 같은 말로 본다. off는 끄기.
export const FUZZY_LEVELS = { off: 0, strict: 0.85, normal: 0.8 };
export const FUZZY_ORDER = ["off", "strict", "normal"];
export const DEFAULT_FUZZY = "normal";

// 저장소·화면에서 온 값을 단계 이름으로 바로잡는다. 값이 없으면 기본(보통), false/"off"는 끄기.
export function normalizeFuzzy(value) {
  if (value === undefined || value === null) return DEFAULT_FUZZY;
  if (value === false) return "off";
  if (value === true) return DEFAULT_FUZZY;
  return Object.prototype.hasOwnProperty.call(FUZZY_LEVELS, value) ? String(value) : DEFAULT_FUZZY;
}

// 관리자 화면에 보여 줄 단계 이름(관리자 화면은 한국어만 쓴다). 예: "보통 80%", "끔"
export const FUZZY_LABELS = { off: "끔", strict: "엄격", normal: "보통" };
export function fuzzyLabel(level) {
  const v = normalizeFuzzy(level);
  return v === "off" ? FUZZY_LABELS.off : `${FUZZY_LABELS[v]} ${Math.round(FUZZY_LEVELS[v] * 100)}%`;
}

const MIN_SOUNDS = 4; // 소리(자모)가 이보다 적은 단어는 대상이 아니다
const SOUND_ONLY_MAX = 5; // 소리가 이 수 이하인 짧은 단어는 비슷한 소리끼리 바꾼 것만 허용한다
const BLOCKED = 99; // 허용하지 않는 삽입·삭제·치환의 값(사실상 막는다)
const MAX_CHAIN_WORDS = 3; // 한 번에 이어 보는 한글 낱말 수
const MAX_CHAIN_SOUNDS = 40;
const PARTIAL_EXTRA = 0.05; // 낱말 한가운데서 끊어 쓸 때(뒤에 조사·어미가 붙은 경우) 기준에 더하는 값
const EPS = 1e-9;

// 용어 DB의 단어 목록으로 찾기 도구를 만든다. list: [{ key(띄어쓰기 없는 글), ...마음대로 붙인 값, order(같은 유사도일 때 앞서는 순서) }]
export function buildFuzzyIndex(list) {
  const items = [];
  (Array.isArray(list) ? list : []).forEach((entry, i) => {
    const key = String((entry && entry.key) || "");
    const chars = Array.from(key);
    if (chars.length < 2 || !chars.every((ch) => isSyllableCode(ch.charCodeAt(0)) && ch.length === 1)) return;
    const ids = Int8Array.from(soundsOf(key));
    if (ids.length < MIN_SOUNDS) return;
    items.push({ entry, ids, m: ids.length, order: typeof entry.order === "number" ? entry.order : i });
  });
  return { items };
}

// 글(gap)을 한글 낱말로 나눈다: [{ start, end, join(다음 낱말이 띄어쓰기 한 칸만 두고 이어지는지) }]
function wordsOf(gap) {
  const words = [];
  let i = 0;
  while (i < gap.length) {
    if (!isSyllableCode(gap.charCodeAt(i))) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < gap.length && isSyllableCode(gap.charCodeAt(j))) j += 1;
    words.push({ start: i, end: j, join: false });
    i = j;
  }
  for (let k = 0; k + 1 < words.length; k += 1) {
    const w = words[k];
    w.join = words[k + 1].start === w.end + 1 && /\s/.test(gap[w.end]);
  }
  return words;
}

// 글(gap) 속에서 index의 단어와 minSim 이상 비슷한 곳을 찾아 겹치지 않게 고른다.
// 돌려주는 값: [{ start, end(gap 안의 자리), entry(단어를 만들 때 넣은 값), sim, cost }] - 앞에서부터 차례로
// opts.shortRule(기본 true): false면 짧은 단어도 기준만 넘으면 삽입·삭제·다른 소리로의 치환을 허용한다(가까운 후보를 설명하는 데만 쓴다)
export function findFuzzyMatches(gap, index, minSim, opts = {}) {
  const text = String(gap == null ? "" : gap);
  if (!index || !index.items || index.items.length === 0 || !(minSim > 0) || minSim > 1 || !text) return [];
  const shortRule = opts.shortRule !== false;
  const words = wordsOf(text);
  if (words.length === 0) return [];
  const found = [];
  let rowA = new Float32Array(0);
  let rowB = new Float32Array(0);

  for (let t = 0; t < words.length; t += 1) {
    // 이 낱말에서 시작하는 글: 낱말 최대 3개를 띄어쓰기 한 칸으로 이은 것
    const ids = [];
    const posAt = []; // posAt[소리 수] = 거기까지 읽었을 때 gap 안의 끝 자리(끊을 수 없는 곳이면 -1)
    const cutAt = []; // cutAt[소리 수] = 1(낱말 끝에서 끝남) | 2(첫 낱말 한가운데서 끊음) | 0(끊을 수 없음)
    posAt.push(-1);
    cutAt.push(0);
    let u = t;
    let count = 0;
    while (u < words.length && count < MAX_CHAIN_WORDS) {
      for (let p = words[u].start; p < words[u].end; p += 1) {
        const before = ids.length;
        pushSyllable(ids, text.charCodeAt(p));
        for (let k = before + 1; k < ids.length; k += 1) {
          posAt[k] = -1;
          cutAt[k] = 0;
        }
        posAt[ids.length] = p + 1;
        cutAt[ids.length] = p + 1 === words[u].end ? 1 : u === t ? 2 : 0;
      }
      count += 1;
      if (!words[u].join || ids.length >= MAX_CHAIN_SOUNDS) break;
      u += 1;
    }
    const L = ids.length;
    if (rowA.length < L + 1) {
      rowA = new Float32Array(L + 1);
      rowB = new Float32Array(L + 1);
    }

    for (const it of index.items) {
      const m = it.m;
      const lo = Math.max(1, Math.ceil(m * minSim - EPS));
      const hi = Math.min(L, Math.floor(m / minSim + EPS));
      if (lo > hi) continue;
      // 앞이 고정된 레벤슈타인: 단어(it.ids)와 글의 앞부분 ids[0..j) 사이 거리를 j마다 한 번에 구한다.
      const limit = (1 - minSim) * Math.max(m, hi) + EPS; // 허용되는 거리의 최댓값 - 한 줄의 최솟값이 이를 넘으면 더 볼 필요가 없다
      const soundOnly = shortRule && m <= SOUND_ONLY_MAX; // 짧은 단어는 비슷한 소리끼리의 치환만(삽입·삭제와 다른 소리로의 치환은 막는다)
      const gapCost = soundOnly ? BLOCKED : 1;
      let prev = rowA;
      let cur = rowB;
      for (let j = 0; j <= hi; j += 1) prev[j] = soundOnly ? (j === 0 ? 0 : BLOCKED) : j;
      let alive = true;
      for (let i = 1; i <= m; i += 1) {
        const base = it.ids[i - 1] * N;
        cur[0] = soundOnly ? BLOCKED : i;
        let rowMin = cur[0];
        for (let j = 1; j <= hi; j += 1) {
          let sub = SUB[base + ids[j - 1]];
          if (soundOnly && sub > SIMILAR_COST) sub = BLOCKED;
          let v = prev[j - 1] + sub;
          const del = prev[j] + gapCost;
          if (del < v) v = del;
          const ins = cur[j - 1] + gapCost;
          if (ins < v) v = ins;
          cur[j] = v;
          if (v < rowMin) rowMin = v;
        }
        if (rowMin > limit) {
          alive = false;
          break;
        }
        const swap = prev;
        prev = cur;
        cur = swap;
      }
      if (!alive) continue;
      // prev = 단어 전체와 글의 앞부분 사이 거리. 음절 경계에서 끝나는 것 중 유사도가 가장 높은 곳(같으면 더 긴 쪽)을 고른다.
      let best = null;
      for (let j = lo; j <= hi; j += 1) {
        const end = posAt[j];
        if (end === undefined || end < 0 || !cutAt[j]) continue;
        const cost = prev[j];
        const longest = Math.max(m, j);
        const need = cutAt[j] === 2 ? Math.min(1, minSim + PARTIAL_EXTRA) : minSim;
        const allowed = (1 - need) * longest;
        if (cost > allowed + EPS) continue;
        const sim = 1 - cost / longest;
        if (!best || sim > best.sim + EPS || (Math.abs(sim - best.sim) <= EPS && j > best.j)) best = { sim, cost, j, end };
      }
      if (best) found.push({ start: words[t].start, end: best.end, entry: it.entry, sim: best.sim, cost: best.cost, order: it.order });
    }
  }

  // 유사도가 높은 것부터(같으면 긴 것, 그다음 표에서 앞선 것) 겹치지 않게 고른다
  found.sort((a, b) => {
    const ds = Math.round(b.sim * 1e6) - Math.round(a.sim * 1e6);
    if (ds !== 0) return ds;
    const dl = b.end - b.start - (a.end - a.start);
    if (dl !== 0) return dl;
    if (a.order !== b.order) return a.order - b.order;
    return a.start - b.start;
  });
  const taken = [];
  for (const f of found) {
    if (taken.some((x) => f.start < x.end && x.start < f.end)) continue;
    taken.push(f);
  }
  taken.sort((a, b) => a.start - b.start);
  return taken;
}
