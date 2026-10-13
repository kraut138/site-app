// 음성 인식 문장에서 "어느 공종 항목이 완료/진행중인지"를 읽어 내는 순수 함수들(화면·저장소와 무관, 테스트하기 쉽게 따로 뒀다).
//
// 읽는 방법(보수적으로 - 확실한 것만 반영하고 애매하면 건너뛴다):
//  1) 문장을 마침표/줄바꿈으로 '문장', 쉼표 등으로 '절'로 나눈다.
//  2) 각 절에서 체크리스트 항목 이름이 나온 자리(언급)와 "완료·진행중·70%" 같은 상태 낱말(표시)을 찾는다.
//  3) 우리말은 서술어가 뒤에 오므로, 상태 낱말은 그 앞에서 아직 짝이 없는 언급들에 붙인다. ("도배 바닥마감 완료" → 둘 다 완료)
//  4) 부정("안 됐어", "아직"), 예정("내일 할 예정"), 문제("하자", "재시공")가 섞인 표시는 버린다.
//  5) 같은 낱말이 여러 항목에 걸리면(예: "콘크리트 타설") 어느 항목인지 알 수 없으므로 반영하지 않고 '애매함'으로 알려 준다.
// 항목 이름은 관리자가 바꿀 수 있으므로(표준 공종 탭) 고정 목록이 아니라 받은 checklistItems에서 그때그때 키워드를 뽑는다.

const MASK = "\u0001";

// 항목 이름 안에서 그 낱말 하나만으로는 항목을 가리킬 수 없는 흔한 말들(여러 항목에 두루 쓰이거나 "설치"처럼 동작을 뜻하는 말)
const GENERIC_WORDS = new Set([
  "상태", "여부", "적정성", "적정", "기준", "충족", "확인", "관리", "적합", "측정값", "양호", "점검", "검사",
  "설치", "시공", "작업", "공사", "타설", "조립", "체결", "고정", "정리", "정돈", "착용", "비치", "전", "후", "및", "등", "위치", "경로",
  "전기", "설비", "현장", "자재", "구조물", "시설", "상단", "하단",
]);

// 특정 항목 이름에 대한 같은 뜻의 다른 말(모두 소문자·공백 없이). 기본 항목 이름에 맞춘 것이고, 관리자가 이름을 바꾸면 적용되지 않는다.
const ITEM_ALIASES = [
  ["천정", ["천장"]],
  ["도배", ["벽지", "도배지"]],
  ["석고판", ["석고보드"]],
  ["단열재", ["단열"]],
  ["pl창호", ["피엘창호"]],
];

// 공종 전체를 가리키는 말: 이 말 뒤에 "완료"가 붙으면 그 공종의 모든 항목을 완료로 본다. ("마감"은 동작을 뜻하기도 해서 반드시 "마감공사"로 말해야 한다)
const CATEGORY_WORDS = [
  ["frame", ["골조공사", "골조"]],
  ["finish", ["마감공사"]],
  ["mep", ["설비전기공사", "설비전기", "설비공사", "전기공사"]],
  ["safety", ["안전환경공사", "안전환경", "안전공사"]],
];

// ---------------- 글자 다루기 ----------------

// 공백·기호를 뺀 소문자 문장(sq)과, 각 글자가 원문 어디에 있었는지(map), 원문에서 낱말의 첫 글자였는지(starts)를 만든다.
export function squashText(text) {
  const src = String(text == null ? "" : text);
  let sq = "";
  const map = [];
  const starts = [];
  let wordStart = true;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const decimal = ch === "." && i > 0 && /\d/.test(src[i - 1]) && /\d/.test(src[i + 1] || ""); // 70.5퍼센트의 소수점은 남긴다
    if (decimal || /[\p{L}\p{N}%]/u.test(ch)) {
      sq += ch.toLowerCase();
      map.push(i);
      starts.push(wordStart);
      wordStart = false;
    } else {
      wordStart = true;
    }
  }
  return { sq, map, starts };
}

const KO_DIGIT = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };

// "삼백일" → 301, "이십" → 20, "구" → 9. 읽을 수 없으면 NaN. (천 단위까지)
export function koreanNumber(word) {
  const s = String(word || "");
  if (!s || !/^[일이삼사오육칠팔구십백천]+$/.test(s)) return NaN;
  let total = 0;
  let cur = 0;
  let seen = false;
  for (const ch of s) {
    if (KO_DIGIT[ch]) {
      cur = KO_DIGIT[ch];
      seen = true;
    } else {
      const unit = ch === "천" ? 1000 : ch === "백" ? 100 : 10;
      total += (cur || 1) * unit;
      cur = 0;
      seen = true;
    }
  }
  total += cur;
  return seen ? total : NaN;
}

// ---------------- 항목 이름에서 키워드 뽑기 ----------------

function stripBrackets(text) {
  const inner = [];
  const main = text.replace(/[(（[]([^)）\]]*)[)）\]]/g, (_, g) => {
    inner.push(g);
    return " ";
  });
  return { main, inner };
}

// 항목 이름을 "및" · "/" · "," 로 나눈 덩어리마다 낱말 목록으로 만든다.
function segmentsOf(text) {
  return String(text)
    .split(/[및·/,，、]/)
    .map((seg) => seg.split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0);
}

function lenOf(s) {
  return Array.from(s).length;
}

// 항목 하나의 키워드: full(항목 이름 전체), phrases(낱말 2개 이상 이어진 구절), words(낱말 하나)
function keysForItemText(text) {
  const lower = String(text).normalize("NFC").toLowerCase();
  const { main, inner } = stripBrackets(lower);
  const full = squashText(main).sq;
  const phrases = new Set();
  const words = new Set();
  const segs = [...segmentsOf(main), ...inner.flatMap((g) => segmentsOf(g))];
  for (const seg of segs) {
    const w = seg.slice(0, 8);
    for (let i = 0; i < w.length; i += 1) {
      for (let j = i + 1; j <= w.length; j += 1) {
        const part = w.slice(i, j);
        if (part.every((x) => GENERIC_WORDS.has(x))) continue; // "조립 상태"처럼 흔한 말뿐인 조합은 항목을 가리키지 못한다
        const key = squashText(part.join(" ")).sq;
        if (j - i === 1) {
          if (lenOf(key) >= 2) words.add(key);
        } else if (lenOf(key) >= 4) phrases.add(key);
      }
    }
  }
  const aliases = [];
  for (const [name, list] of ITEM_ALIASES) if (full === name) aliases.push(...list.map((a) => squashText(a).sq));
  return { full, phrases, words, aliases };
}

const indexCache = new WeakMap();

// 체크리스트 항목들에서 찾기 도구를 만든다(같은 배열로는 한 번만 만든다).
// 낱말 하나짜리 키워드는 그 낱말을 가진 항목이 하나뿐일 때만 확실한 키워드(strong)이고, 여러 항목이 가지면 약한 키워드(weak)라 '애매함'만 알린다.
export function buildItemIndex(checklistItems) {
  const list = Array.isArray(checklistItems) ? checklistItems : [];
  if (indexCache.has(list)) return indexCache.get(list);
  const entries = [];
  const wordOwners = new Map();
  for (const item of list) {
    if (!item || typeof item.id !== "string" || typeof item.text !== "string" || !item.text.trim()) continue;
    const keys = keysForItemText(item.text);
    entries.push({ item, keys });
    for (const w of keys.words) {
      const set = wordOwners.get(w) || new Set();
      set.add(item.id);
      wordOwners.set(w, set);
    }
  }
  const rules = [];
  for (const { item, keys } of entries) {
    if (keys.full && lenOf(keys.full) >= 2) rules.push({ itemId: item.id, key: keys.full, rank: 3 });
    for (const a of keys.aliases) if (a) rules.push({ itemId: item.id, key: a, rank: 3 });
    for (const p of keys.phrases) if (p !== keys.full) rules.push({ itemId: item.id, key: p, rank: 2 });
    for (const w of keys.words) {
      if (w === keys.full) continue;
      rules.push({ itemId: item.id, key: w, rank: wordOwners.get(w).size === 1 ? 1 : 0 });
    }
  }
  const byId = new Map(list.filter((i) => i && typeof i.id === "string").map((i) => [i.id, i]));
  const index = { rules, byId };
  indexCache.set(list, index);
  return index;
}

// ---------------- 언급(항목 이름이 나온 자리) 찾기 ----------------

// 두 글자 항목 이름 뒤에 붙을 수 있는 조사·어미의 첫 글자. 이 밖의 글자가 바로 붙으면(예: "도배사") 다른 낱말일 수 있다.
const PARTICLE_START = "은는이가을를도에의로와과만랑나까부하했해됐돼되";

function findMentions(sq, starts, index) {
  const cands = [];
  for (const rule of index.rules) {
    const { key } = rule;
    const short = lenOf(key) < 3; // 두 글자 키워드는 낱말의 첫 글자에서 시작할 때만 인정한다(다른 낱말 사이를 잘못 잇지 않도록)
    let from = 0;
    for (;;) {
      const pos = sq.indexOf(key, from);
      if (pos < 0) break;
      from = pos + 1;
      if (short && !starts[pos]) continue;
      const nextCh = sq[pos + key.length];
      const tight = short && !!nextCh && !starts[pos + key.length] && !PARTICLE_START.includes(nextCh);
      cands.push({ itemId: rule.itemId, start: pos, end: pos + key.length, len: key.length, rank: rule.rank, tight });
    }
  }
  for (const [catId, words] of CATEGORY_WORDS) {
    for (const w of words) {
      let from = 0;
      for (;;) {
        const pos = sq.indexOf(w, from);
        if (pos < 0) break;
        from = pos + 1;
        if (!starts[pos]) continue;
        cands.push({ catId, start: pos, end: pos + w.length, len: w.length, rank: 2 });
      }
    }
  }
  cands.sort((a, b) => b.len - a.len || b.rank - a.rank || a.start - b.start);
  const spans = [];
  for (const c of cands) {
    const same = spans.find((s) => s.start === c.start && s.end === c.end);
    if (same) {
      if (same.rank === c.rank && c.itemId && !same.itemIds.includes(c.itemId) && !same.catId) same.itemIds.push(c.itemId);
      continue;
    }
    if (spans.some((s) => c.start < s.end && s.start < c.end)) continue;
    spans.push({ start: c.start, end: c.end, rank: c.rank, itemIds: c.itemId ? [c.itemId] : [], catId: c.catId || "", tight: !!c.tight });
  }
  spans.sort((a, b) => a.start - b.start);
  return spans;
}

// ---------------- 상태 낱말(완료·진행중·퍼센트) ----------------

const PARTICLE = "(?:은|는|이|가|을|를|도|만)?";
const DONE_TAIL = "(?:했|하였|됐|되었|돼|해놨|해뒀|함)";
const WORK_NOUN = "(?:시공|설치|타설|배근|결속|조립|체결|포설|고정|마감|정리|연결|시행|양생|보양)";

// kind: pct(숫자 %), half, near(거의 다), done, doing, start. 같은 자리에서는 앞에 적은 것이 먼저다.
const MARKERS = [
  { kind: "pct", re: /(\d{1,3}(?:\.\d+)?)(?:%|퍼센트|프로)/g },
  { kind: "pctKo", re: /([일이삼사오육칠팔구십백]{1,5})(?:퍼센트|프로)/g },
  { kind: "half", re: /절반|반쯤|반정도|반가량|반이상/g },
  { kind: "near", re: /거의(?:다)?(?:완료|끝|마무리|됐|돼|되었)?|거진|대부분|막바지|마무리(?:단계|중|작업|하는|하고)|완료직전|완료전|끝나가|끝나는중|다돼가|다되어가|다되가|다돼간/g },
  { kind: "done", re: /완료|완성|끝났|끝남|끝냈|끝내|끝이|끝입|끝$|마무리|마쳤|마침|마칩|마친|종료|합격|적합|이상없|이상무|문제없|양호|오케이|ok|다했|다함|다됐|다되었|다돼서/g },
  { kind: "done", re: new RegExp(`${MASK}${PARTICLE}(?:다)?${DONE_TAIL}`, "g"), skipLead: 1 },
  { kind: "done", re: new RegExp(`${WORK_NOUN}(?:을|를|은|는)?(?:다)?${DONE_TAIL}`, "g") },
  { kind: "doing", re: new RegExp(`(?:작업|시공|진행|공사|설치|타설|배근|결속|조립|체결|양생|마감|보수|하는|하고있는?|${MASK})중(?=이|입|임|에|으|$)`, "g") },
  { kind: "doing", re: /진행|하고있|해가고|하는중/g },
  { kind: "start", re: /시작|착수|개시|들어갔|들어가는|돌입/g },
];

// 이런 말 바로 뒤의 "완료"는 시공이 끝났다는 뜻이 아니다(요청·접수·반입 등을 마쳤다는 뜻)
const NOT_WORK_DONE = /(?:요청|신청|접수|보고|전달|연락|발주|주문|반입|입고|청구|제출|예약|문의|지시|통보|공지)(?:이|을|를|도|까지)?$/;

const KIND_VALUE = { done: 100, near: 90, half: 50, doing: 50, start: 10 };

function findMarkers(masked) {
  const found = [];
  for (const spec of MARKERS) {
    spec.re.lastIndex = 0;
    let m;
    while ((m = spec.re.exec(masked)) !== null) {
      if (m[0] === "") {
        spec.re.lastIndex += 1;
        continue;
      }
      const start = m.index + (spec.skipLead || 0);
      const end = m.index + m[0].length;
      let value = KIND_VALUE[spec.kind];
      if (spec.kind === "pct") value = Number(m[1]);
      if (spec.kind === "pctKo") value = koreanNumber(m[1]);
      if (spec.kind === "pct" || spec.kind === "pctKo") {
        if (!(value > 0)) continue;
        value = Math.min(100, value);
      }
      if (spec.kind === "done" && NOT_WORK_DONE.test(masked.slice(Math.max(0, start - 6), start))) continue; // "검측 요청 완료"
      found.push({ start, end, kind: spec.kind, value });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const f of found) {
    const prev = out[out.length - 1];
    if (prev && f.start < prev.end) continue; // 앞의 표시와 겹치면 앞의 것(더 긴 것)만 쓴다
    out.push(f);
  }
  return out;
}


// ---------------- 부정·예정·문제 낱말 ----------------
// 상태 낱말 앞쪽(언급 앞, 언급~상태 낱말 사이)에서는 모든 낱말을 보고,
// 상태 낱말 뒤쪽(다음 언급 직전까지)에서는 서술어 꼴만 본다. ("도배 완료 내일 바닥마감 시작"의 "내일"은 뒤의 언급에 붙는 말이다)

const ALL_CLEAR = /(?:이상|문제|하자|누락|불량|누수|균열|파손|지연)\s*(?:이|가)?\s*(?:없|무)/g;
const NEG_PRED = /(?:^|\s)(?:안|못)\s*(?:됐|되|돼|끝|마무리|했|한|함|된|마쳤|마친|하)|않|아니|아님|(?:^|\s)덜\s*(?:됐|되|돼|끝|마무리|했|한)|미흡|미완|미시공|미시작|미진행|미설치|미타설/;
const NEG_ADV = /아직/;
const FUTURE_PRED = /예정(?!\s*(?:대로|보다|일보다))|할\s*것|할\s*거|할게|하겠|하려|계획(?!\s*(?:대로|보다|에\s*따라))|해야|합시다|할까|해\s*주세요|바랍니다|부탁/;
const FUTURE_ADV = /내일|모레|다음\s*주|다음주|이따|나중|곧\s|앞으로/;
const ISSUE = /불량|하자|재시공|재작업|보수|누락|문제|균열|누수|파손|불합격|부적합|지연|중단|보류|취소|오류|어긋|틀어|재검측|재요청|반려|훼손|손상|들뜸|들떴|깨짐|깨졌/;
const TAIL_CHARS = 16; // 상태 낱말 뒤쪽은 이 글자 수까지만 본다

function reasonOf(text, adverbs) {
  const t = text.replace(ALL_CLEAR, " ");
  if (NEG_PRED.test(t) || (adverbs && NEG_ADV.test(t))) return "negation";
  if (FUTURE_PRED.test(t) || (adverbs && FUTURE_ADV.test(t))) return "future";
  if (ISSUE.test(t)) return "issue";
  return "";
}

// head: 언급 앞과 언급~상태 낱말 사이, tail: 상태 낱말 뒤. 버려야 하는 이유("negation" | "future" | "issue")나 빈 문자열.
function voidReason(head, tail, tailIsLast) {
  return reasonOf(head, true) || reasonOf(tail, tailIsLast);
}

// ---------------- 문장 분석 ----------------

const DECIMAL = "\u0002";
const SENTENCE_SPLIT = /[.!?。！？\n\r]+/;
const CLAUSE_SPLIT = /[,;，、；]+/;

function splitSentences(text) {
  return text
    .replace(/(\d)\.(\d)/g, `$1${DECIMAL}$2`) // 70.5퍼센트의 소수점은 문장 끝으로 보지 않는다
    .split(SENTENCE_SPLIT)
    .map((s) => s.split(DECIMAL).join("."));
}

// 한 절을 언급·상태 낱말 조각들로 나눈다.
function tokenizeClause(clause, index) {
  const { sq, map, starts } = squashText(clause);
  if (!sq) return null;
  let spans = findMentions(sq, starts, index);
  const maskAll = (list) => {
    let m = sq;
    for (const s of list) m = m.slice(0, s.start) + MASK.repeat(s.end - s.start) + m.slice(s.end);
    return m;
  };
  let masked = maskAll(spans);
  let markers = findMarkers(masked);
  if (spans.some((s) => s.tight)) {
    const keep = spans.filter((s) => !s.tight || markers.some((k) => k.start === s.end)); // "도배완료"처럼 바로 이어진 경우만 남긴다
    if (keep.length !== spans.length) {
      spans = keep;
      masked = maskAll(spans);
      markers = findMarkers(masked);
    }
  }
  const tokens = [
    ...spans.map((s) => ({ type: "m", start: s.start, end: s.end, span: s })),
    ...markers.map((k) => ({ type: "k", start: k.start, end: k.end, mk: k })),
  ].sort((a, b) => a.start - b.start || (a.type === "m" ? -1 : 1));
  const origStart = (pos) => map[Math.min(Math.max(pos, 0), map.length - 1)];
  const origEnd = (pos) => map[Math.max(0, Math.min(pos, map.length) - 1)] + 1;
  return { tokens, origStart, origEnd };
}

// 바로 이어진 상태 낱말들("진행 완료", "진행중 70%")을 하나로 합친다. 퍼센트가 있으면 그 값, 아니면 가장 큰 값.
function mergeMarkers(tokens, from) {
  let group = { ...tokens[from].mk };
  let last = from;
  while (last + 1 < tokens.length && tokens[last + 1].type === "k" && tokens[last + 1].start - tokens[last].end <= 3) {
    const nx = tokens[last + 1].mk;
    const isPct = (k) => k.kind === "pct" || k.kind === "pctKo";
    if (isPct(nx) || (!isPct(group) && nx.value > group.value)) group = { ...nx, start: group.start };
    else group = { ...group, end: nx.end };
    last += 1;
  }
  return { group, last };
}

const pct100 = (p) => Math.min(100, Math.max(0, Math.round(p)));

// text: 인식된(은어를 표준 용어로 바꾼) 문장, checklistItems: 호실에 쓰는 공종 세부 항목 목록
// 돌려주는 값:
//   items:      [{ itemId, categoryId, text, state: "done" | "doing", percent, phrase }]
//   categories: [{ categoryId, phrase }]   - "골조공사 완료"처럼 공종 전체를 완료로 말한 경우
//   ambiguous:  [{ phrase, itemIds }]      - 어느 항목인지 알 수 없어 넣지 않은 말
//   skipped:    [{ phrase, reason }]       - 부정·예정·문제 낱말이 섞여 넣지 않은 말
export function analyzeProgress(text, checklistItems) {
  const result = { items: [], categories: [], ambiguous: [], skipped: [] };
  const src = String(text == null ? "" : text).normalize("NFC");
  if (!src.trim()) return result;
  const index = buildItemIndex(checklistItems);
  const byItem = new Map();
  const catSeen = new Set();

  for (const sentence of splitSentences(src)) {
    let pending = []; // 아직 상태 낱말을 만나지 못한 언급들(같은 문장 안에서는 절을 넘어 이어진다)
    for (const clause of sentence.split(CLAUSE_SPLIT)) {
      const tk = tokenizeClause(clause, index);
      if (!tk) continue;
      const { tokens, origStart, origEnd } = tk;
      let t = 0;
      while (t < tokens.length) {
        const cur = tokens[t];
        if (cur.type === "m") {
          pending.push({ span: cur.span, clause, tok: t, from: origStart(cur.start), to: origEnd(cur.end) });
          t += 1;
          continue;
        }
        const { group, last } = mergeMarkers(tokens, t);
        const nextMention = tokens.slice(last + 1).find((x) => x.type === "m") || null;
        const here = pending.filter((o) => o.clause === clause);
        const firstTok = here.length ? here[0].tok : t; // 이 상태 낱말이 맡은 첫 언급(없으면 상태 낱말 자신)의 앞 조각부터 본다
        const prevTok = firstTok > 0 ? tokens[firstTok - 1] : null;
        const markEnd = origEnd(group.end);
        // 앞쪽(head): 앞 조각의 끝부터 상태 낱말 끝까지(언급 글자는 빈칸으로 바꾼다), 뒤쪽(tail): 상태 낱말 뒤부터 다음 언급 직전까지(최대 TAIL_CHARS)
        let headFrom = prevTok ? origEnd(prevTok.end) : 0;
        let head = "";
        for (const o of here) {
          head += `${clause.slice(headFrom, o.from)} `;
          headFrom = o.to;
        }
        head += clause.slice(headFrom, markEnd);
        const tailTo = nextMention ? origStart(nextMention.start) : clause.length;
        const tail = clause.slice(markEnd, Math.min(tailTo, markEnd + TAIL_CHARS));
        const reason = voidReason(head, tail, !nextMention);
        const owners = pending;
        pending = [];
        t = last + 1;
        const percent = pct100(group.value);
        for (const o of owners) {
          const phrase = (o.clause === clause ? clause.slice(o.from, markEnd) : `${o.clause.slice(o.from).trim()}, ${clause.slice(0, markEnd).trim()}`)
            .replace(/\s+/g, " ")
            .trim();
          if (reason) {
            result.skipped.push({ phrase, reason });
            continue;
          }
          const { span } = o;
          if (span.catId) {
            if (percent >= 100 && !catSeen.has(span.catId)) {
              catSeen.add(span.catId);
              result.categories.push({ categoryId: span.catId, phrase });
            }
            continue;
          }
          if (span.itemIds.length > 1 || span.rank === 0) {
            result.ambiguous.push({ phrase, itemIds: span.itemIds });
            continue;
          }
          const itemId = span.itemIds[0];
          const item = index.byId.get(itemId);
          if (!item) continue;
          const prev = byItem.get(itemId);
          if (prev && prev.percent >= percent) continue;
          byItem.set(itemId, { itemId, categoryId: item.categoryId, text: item.text, state: percent >= 100 ? "done" : "doing", percent, phrase });
        }
      }
    }
  }
  result.items = [...byItem.values()];
  // 같은 말이 다른 말로 이미 정확히 한 항목에 반영됐다면(예: "거푸집 조립 동바리 고정 완료"의 '동바리') 애매하다고 따로 알리지 않는다
  result.ambiguous = result.ambiguous.filter((a) => !a.itemIds.some((id) => byItem.has(id)));
  return result;
}
