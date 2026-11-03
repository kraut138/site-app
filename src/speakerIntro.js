// 말한 글 속의 "OOO(협력업체) 소속 OOO(이름)"을 읽어, 그 음성 기록을 말한 사람을 알아낸다.
//   "대한건설 소속 홍길동 101동 502호 도배 완료"            → 소속 "대한건설", 이름 "홍길동", 나머지 "101동 502호 도배 완료"
//   "안녕하세요 대한건설 소속 홍길동입니다. 502호 도배 완료"   → 인사말·"입니다"까지 소개 말로 보고 걷어 낸다
//   "502호 도배 완료 대한건설 소속 홍길동"                    → 소개를 끝에 말해도 읽는다
// 소개 말을 뗀 나머지(rest)만 은어 변환·호실 읽기·진행도 계산에 넣는다(회사 이름 속 글자가 작업 내용으로 읽히지 않게).
// 말한 그대로의 글(rawText)은 따로 그대로 저장하므로, 여기서는 아무것도 지우거나 고치지 않는다.
// 틀리게 읽어 엉뚱한 이름이 붙는 것이 못 읽는 것보다 나쁘므로, 분명할 때만 읽는다:
//   - 반드시 "소속"이라는 말이 있어야 하고, 그 바로 뒤에 이름으로 볼 수 있는 한 낱말이 와야 한다(한글 2~5글자, 또는 영문 이름).
//   - 작업 말("도배", "완료" 등)이나 직함, 숫자가 든 낱말은 이름으로 보지 않는다. 이름이 없으면(소속만 말했으면) 읽지 않는다.
//   - 이름이 여러 낱말인 경우는 첫 낱말이 한 글자(성만)일 때("홍 길동", "왕 웨이")만 이어 붙인다.
// 한국어로 말한 경우만 읽는다(음성 인식 언어가 ko-KR이다).

const NAME_MAX = 20; // 저장하는 이름 최대 글자 수
const COMPANY_MAX = 30; // 저장하는 소속 최대 글자 수
const COMPANY_TOKENS_MAX = 4; // 소속 이름으로 볼 최대 낱말 수

// "소속" 낱말(뒤에 붙을 수 있는 말까지): 소속 / 소속의 / 소속인 / 소속이며 / 소속이고 / 소속입니다 ... 앞에 회사 이름이 붙어 있어도("대한건설소속") 된다.
const MARKER = /^(.*?)소속(?:의|인|이며|이고|이고요|입니다|이에요)?$/;

// 이름 뒤에 붙는 끝맺음(긴 것부터 맞춰 본다)
const ENDINGS = ["이라고합니다만", "이라고합니다", "이라고해요", "라고합니다만", "라고합니다", "라고해요", "입니다만", "입니다", "이에요", "이예요", "이고요", "인데요", "이라고", "이며", "이고", "인데", "예요", "라고"].sort((a, b) => b.length - a.length);
const ENDING_SET = new Set(ENDINGS);

// 소개 앞에 붙는 인사·군말(소개 말과 함께 걷어 낸다)
const FILLERS = new Set(["저는", "저", "저희는", "저희", "제가", "나는", "나", "안녕하세요", "안녕하십니까", "여기는", "여기", "지금", "네", "예", "자", "음", "어", "아", "저기", "그럼", "그리고", "그냥"]);

// 직함·역할 말: 이름 앞뒤에 붙으면 소개 말의 일부로 보고 걷어 낸다
const TITLES = ["반장", "팀장", "소장", "과장", "부장", "차장", "대리", "사원", "주임", "계장", "실장", "이사", "대표", "사장", "기사", "조장", "기공", "담당", "담당자", "관리자", "작업자", "근로자", "직원", "팀원", "인부", "업체"];
const TITLE_SET = new Set(TITLES);

// 작업·일반 말: 소속 이름의 경계이거나 이름이 아닌 말
const WORK_WORDS = new Set([
  "완료", "시작", "진행", "진행중", "작업", "검측", "마무리", "확인", "끝", "중", "요청", "보고", "점검", "시공", "준비", "예정", "오늘", "지금", "방금", "어제", "내일", "현재",
  "도배", "타일", "미장", "방수", "배근", "타설", "형틀", "철근", "용접", "도장", "전기", "설비", "배관", "조적", "창호", "단열", "마감", "골조", "콘크리트", "거푸집", "양생",
  "공사", "공종", "회사", "협력업체", "하도급", "하도급사", "감리", "감리단", "그리고", "그런데", "그래서", "입니다", "합니다", "했습니다", "했어요", "하고", "해서", "호실",
]);

const HANGUL_NAME = /^[가-힣]{2,5}$/;
const LATIN_NAME = /^[A-Za-z][A-Za-z.'-]{1,19}$/;
const SENTENCE_END = /(?:습니다|입니다|합니다|세요|했어요|해요|어요|아요|네요|죠|다)$/;
const PLACE_WORD = /^\d+(?:-\d+)?(?:동|호|층|호실|세대|개|명|번|차)?$|\d(?:동|호|층)/;

function clean(token) {
  return String(token).replace(/^["'“‘]+/, "").replace(/[,.!?~…。、，;:"'”’]+$/, "");
}

function isStop(word) {
  return WORK_WORDS.has(word) || FILLERS.has(word) || TITLE_SET.has(word) || ENDING_SET.has(word);
}

function validStem(stem) {
  if (!stem || isStop(stem)) return false;
  if (SENTENCE_END.test(stem) && stem.length > 2) return false; // "했습니다" 같은 문장 끝말은 이름이 아니다
  return HANGUL_NAME.test(stem) || LATIN_NAME.test(stem);
}

// 이름 뒤에 끝맺음이 붙어 있으면("홍길동입니다") 떼어서 { stem, ending }으로 돌려준다
function splitEnding(token) {
  for (const e of ENDINGS) {
    if (token.length > e.length && token.endsWith(e)) {
      const stem = token.slice(0, token.length - e.length);
      if (validStem(stem)) return { stem, ending: e };
    }
  }
  return { stem: token, ending: "" };
}

// 직함 낱말인가: "반장", "반장님", "반장입니다", "현장소장입니다", "님", "씨"
function isTitleToken(token) {
  if (token === "님" || token === "씨") return true;
  let base = token;
  for (const e of ENDINGS) {
    if (base.length > e.length && base.endsWith(e)) {
      base = base.slice(0, base.length - e.length);
      break;
    }
  }
  base = base.replace(/(?:님|씨)$/, "");
  if (!base || base.length > 7) return false;
  if (TITLE_SET.has(base)) return true;
  return TITLES.some((t) => base.length > t.length && base.endsWith(t) && /^[가-힣]+$/.test(base));
}

function isOneSyllable(stem) {
  return /^[가-힣]$/.test(stem);
}

// 이름 한 칸(또는 성만 한 글자일 때 두 칸)을 읽는다. 읽을 수 없으면 null.
function readName(cl, k) {
  if (k >= cl.length) return null;
  const a = splitEnding(cl[k]);
  if (isOneSyllable(a.stem) && !a.ending) {
    // "홍 길동", "왕 웨이"처럼 성이 한 글자로 떨어져 나온 경우
    if (k + 1 >= cl.length) return null;
    const b = splitEnding(cl[k + 1]);
    if (/^[가-힣]{1,3}$/.test(b.stem) && !isStop(b.stem)) return { name: `${a.stem}${b.stem}`, next: k + 2 };
    return null;
  }
  if (!validStem(a.stem)) return null;
  return { name: a.stem, next: k + 1 };
}

function readAround(tokens, cl, i, glued) {
  // 1) 이름: 소속 뒤의 끝맺음·직함 말은 건너뛴다
  let k = i + 1;
  let skipped = 0;
  while (k < cl.length && skipped < 3 && (ENDING_SET.has(cl[k]) || isTitleToken(cl[k]) || TITLE_SET.has(cl[k]))) {
    k += 1;
    skipped += 1;
  }
  const named = readName(cl, k);
  if (!named) return null;
  // 이름 뒤의 직함·끝맺음("반장입니다", "님", "이고요")도 소개 말로 걷어 낸다
  let end = named.next;
  let guard = 0;
  while (end < cl.length && guard < 3 && (ENDING_SET.has(cl[end]) || isTitleToken(cl[end]))) {
    end += 1;
    guard += 1;
  }
  // 2) 소속: "소속" 바로 앞의 낱말들(숫자·작업 말·문장 끝말을 만나면 거기서 멈춘다)
  const parts = glued ? [glued] : [];
  let start = i;
  for (let j = i - 1; j >= 0 && parts.length < COMPANY_TOKENS_MAX; j -= 1) {
    const w = cl[j];
    if (!w || PLACE_WORD.test(w) || FILLERS.has(w) || WORK_WORDS.has(w) || SENTENCE_END.test(w)) break;
    parts.unshift(w);
    start = j;
  }
  while (parts.length > 1 && parts.join(" ").length > COMPANY_MAX) {
    parts.shift();
    start += 1;
  }
  // 소속 앞의 인사·군말도 소개 말과 이어져 있으면 함께 걷어 낸다
  let fill = 0;
  while (start > 0 && fill < 3 && FILLERS.has(cl[start - 1])) {
    start -= 1;
    fill += 1;
  }
  const rest = tokens
    .slice(0, start)
    .concat(tokens.slice(end))
    .join(" ")
    .trim();
  return { found: true, company: parts.join(" ").slice(0, COMPANY_MAX), name: named.name.slice(0, NAME_MAX), rest };
}

// 말한 글에서 소개 말을 읽는다. 읽지 못하면 found가 false이고 rest는 글 그대로다.
export function parseSpeakerIntro(text) {
  const original = String(text == null ? "" : text).trim();
  const none = { found: false, company: "", name: "", rest: original };
  if (!original || original.indexOf("소속") < 0) return none;
  const tokens = original.split(/\s+/);
  const cl = tokens.map(clean);
  for (let i = 0; i < cl.length; i += 1) {
    const m = MARKER.exec(cl[i]);
    if (!m) continue;
    const hit = readAround(tokens, cl, i, m[1] || "");
    if (hit) return hit;
  }
  return none;
}

// 은어 변환·호실 읽기·진행도 계산에 넣을 글: 소개 말을 뗀 글. 소개가 없으면 말한 글 그대로.
// (소개 말만 하고 작업 내용이 없으면 빈 글이 된다)
export function analysisText(rawText) {
  const p = parseSpeakerIntro(rawText);
  return p.found ? p.rest : String(rawText == null ? "" : rawText).trim();
}

// 저장된 음성 기록 하나의 말한 사람: 저장할 때 읽어 둔 값(speakerName·speakerCompany)을 먼저 쓰고,
// 없는 예전 기록은 말한 글(rawText)에서 같은 방법으로 읽는다. 없으면 null.
export function speakerOf(report) {
  if (!report) return null;
  const name = typeof report.speakerName === "string" ? report.speakerName.trim() : "";
  if (name) return { name, company: typeof report.speakerCompany === "string" ? report.speakerCompany.trim() : "" };
  if (typeof report.rawText !== "string") return null;
  const p = parseSpeakerIntro(report.rawText);
  return p.found ? { name: p.name, company: p.company } : null;
}

export const SPEAKER_LIMITS = { name: NAME_MAX, company: COMPANY_MAX };
