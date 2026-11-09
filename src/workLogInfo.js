// 작업일보에 필요한 말 네 가지 - 업체명, 금일 작업인원, 위치, 작업내용 - 를 말하도록 돕는다.
//   workLogExample()   녹음 화면에 보여 줄 말하기 예문(네 칸으로 나뉜 한 문장)
//   checkWorkLogInfo() 말한(또는 입력한) 글에 그 말들이 들어 있는지 살펴, 빠진 것을 돌려준다
// 말한 그대로의 글(rawText)은 건드리지 않고 읽기만 한다.
//
// '빠졌다'고 잘못 알리는 것이 못 찾고 넘어가는 것보다 말하는 사람을 더 귀찮게 하므로, 찾을 때는 너그럽게 읽는다.
//   업체명        "OO건설 소속 홍길동입니다"(speakerIntro.js가 읽는 소개 말) → "대한건설 소속"처럼 소속 앞의 말 → "(주)대한", "대한건설"처럼 회사 이름 끝말이 붙은 낱말 → "대한 업체는 …"
//   금일 작업인원 "5명", "다섯 명", "십이 명", "5인", "작업인원 5"처럼 사람 수를 말한 것
//   작업내용      소개 말·사람 수·동/호/층 번호·군말("작업 완료했어요")을 걷어 낸 뒤에도 뜻 있는 낱말이 남아 있는 것("도배", "철근 배근")
//   위치          여기서 읽지 않는다. 호실 QR과 '음성 검측' 탭은 화면이 위치를 정하고, 공종별 QR은 spokenUnit.js가 말한 동·호실을 읽는다(못 읽으면 그쪽에서 따로 알린다).

import { parseSpeakerIntro } from "./speakerIntro.js";
import { koreanNumber } from "./progressText.js";

// 화면(예문 카드)에 보여 주는 순서
export const WORKLOG_PARTS = ["company", "headcount", "place", "work"];
// 말한 글에서 찾아보는 것(위치는 위 설명대로 따로 정해진다)
export const CHECKED_PARTS = ["company", "headcount", "work"];

// ---------------- 말하기 예문 ----------------
// place: 위치를 말하는 부분("101동 502호"), work: 작업 내용을 말하는 부분("도배 완료"). place가 비어 있으면 위치 칸은 문장에 넣지 않는다.
// 돌려주는 값: { parts: { company, headcount, place, work }, text: 네 칸을 이어 붙인 한 문장 }
export function workLogExample({ place = "101동 502호", work = "도배 완료" } = {}) {
  const parts = {
    company: "OO건설 소속 홍길동입니다.",
    headcount: "오늘 작업인원 5명,",
    place: String(place || "").trim(),
    work: `${String(work || "작업 완료").trim()}했어요.`,
  };
  return { parts, text: WORKLOG_PARTS.map((k) => parts[k]).filter(Boolean).join(" ") };
}

// ---------------- 공통 ----------------
function clean(token) {
  return String(token).replace(/^["'“‘]+/, "").replace(/[,.!?~…。、，;:"'”’]+$/, "");
}

const WORD = "[가-힣A-Za-z0-9&·]";

// ---------------- 업체명 ----------------
// 회사 이름 끝말("대한건설", "한성전기"). 앞에 한 글자 이상 붙은 낱말만 센다("건설 현장"의 "건설"은 회사 이름이 아니다).
const COMPANY_END = "건설|산업|기업|공업|개발|토건|전기|설비|엔지니어링|이엔씨|이앤씨|E&C|ENC|테크|물산|상사|종합|인테리어";
const COMPANY_TAIL = "입니다만|입니다|이에요|예요|이고요|이고|이며|이라고|에서는|에서|이요|의|은|는|이|가|에|도|와|과|로|으로|요";
const R_COMPANY_BARE = new RegExp(`^(${WORD}{1,15}?(?:${COMPANY_END}))(?:${COMPANY_TAIL})?$`);
const R_CORP_FRONT = new RegExp(`(?:주식회사|\\(주\\)|㈜)\\s*(${WORD}{2,15})`);
const R_CORP_BACK = new RegExp(`(${WORD}{2,15})\\s*(?:\\(주\\)|㈜)`);
const R_BELONG = /^(.*?)소속(?:의|인|이며|이고|이고요|입니다|이에요)?$/;
// 업체 이름이 아닌 말("저희 업체", "자재 업체", "다른 회사")
const NOT_COMPANY = new Set([
  "저는", "저", "저희", "저희는", "제가", "나는", "우리", "우리는", "안녕하세요", "여기는", "여기", "지금", "현재", "오늘", "금일", "네", "예", "그", "이", "저기",
  "해당", "다른", "타", "본", "각", "협력", "하도급", "외주", "하청", "전문", "시공", "납품", "공급", "설치", "자재", "장비", "용역", "작업", "공사", "현장", "같은", "어느", "무슨",
]);
const R_ENDINGISH = /(?:습니다|입니다|합니다|세요|했어요|해요|어요|아요|네요|죠)$/;

function okCompanyWord(w) {
  if (!w || NOT_COMPANY.has(w) || R_ENDINGISH.test(w)) return false;
  return /^[가-힣A-Za-z&·][가-힣A-Za-z0-9&·]{1,14}$/.test(w);
}

// "한성입니다", "한성이고요"처럼 업체 이름에 끝맺음이 붙어 있으면 떼어 낸다
const trimEnding = (w) => String(w || "").replace(/(?:입니다만|입니다|이에요|예요|이고요|이며|이고)$/, "");

// 소개 말(소속 + 이름)이 없을 때 업체 이름을 찾는다. 찾으면 그 글자, 못 찾으면 "".
function findCompany(text) {
  const tokens = text.split(/\s+/).filter(Boolean).map(clean);
  // 1) "대한건설 소속입니다", "대한건설 소속 5명" - 이름은 없지만 소속 앞의 말이 있다
  for (let i = 0; i < tokens.length; i += 1) {
    const m = R_BELONG.exec(tokens[i]);
    if (!m) continue;
    const cand = m[1] || (i > 0 ? tokens[i - 1] : "");
    if (okCompanyWord(cand)) return cand;
  }
  // 2) (주)대한, 대한(주), 주식회사 대한
  const corp = R_CORP_FRONT.exec(text) || R_CORP_BACK.exec(text);
  if (corp && okCompanyWord(corp[1])) return corp[1];
  // 3) 회사 이름 끝말이 붙은 낱말: "대한건설", "한성전기입니다"
  for (const w of tokens) {
    const m = R_COMPANY_BARE.exec(w);
    if (m) return m[1];
  }
  // 4) "업체명은 한성", "회사명 한성", "한성 업체입니다", "한성업체"
  const named = /(?:업체명|회사명|상호명|상호)\s*(?:은|는|이|가|:)?\s*([가-힣A-Za-z0-9&·]{2,15})/.exec(text) || /(?:업체|회사)\s*(?:은|는|이|가|:)\s*([가-힣A-Za-z0-9&·]{2,15})/.exec(text);
  if (named && okCompanyWord(trimEnding(named[1]))) return trimEnding(named[1]);
  const after = /([가-힣A-Za-z0-9&·]{2,15})\s*(?:협력업체|하도급사|업체|회사)(?:입니다|이에요|예요|이고요|에서|의|는|은|이|가)?(?![가-힣])/g;
  let m;
  while ((m = after.exec(text))) {
    if (okCompanyWord(trimEnding(m[1]))) return trimEnding(m[1]);
  }
  return "";
}

// ---------------- 금일 작업인원 ----------------
const TENS = "열|스물|스무|서른|마흔|쉰|예순|일흔|여든|아흔";
const ONES = "한|두|세|네|다섯|여섯|일곱|여덟|아홉";
const NATIVE_NUM = `(?:(?:${TENS})(?:${ONES})?|${ONES})`;
const SINO_NUM = "[일이삼사오육칠팔구십백]{1,4}";
// 낱말 가운데에 든 글자("일명", "사명", "작업한명단")는 사람 수로 보지 않도록, 앞이 한글·숫자가 아닐 때만 읽는다(앞 글자는 첫 묶음)
const B = "(^|[^가-힣\\d])";
// "명확", "명단"처럼 '명'이 다른 낱말의 첫 글자인 경우("네 명확하게")는 사람 수가 아니다
const MYEONG = "명(?!확|단|세|칭|령|품|백|절|랑|목|료|암|소|물|언|분|문)";
const N_ONES = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 };
const N_TENS = { 열: 10, 스물: 20, 스무: 20, 서른: 30, 마흔: 40, 쉰: 50, 예순: 60, 일흔: 70, 여든: 80, 아흔: 90 };

function nativeNumber(s) {
  const m = new RegExp(`^(${TENS})?(${ONES})?$`).exec(s);
  if (!m || (!m[1] && !m[2])) return NaN;
  return (m[1] ? N_TENS[m[1]] : 0) + (m[2] ? N_ONES[m[2]] : 0);
}

const goodCount = (n) => Number.isInteger(n) && n >= 1 && n <= 2000;

// 말한 글에서 사람 수를 읽는다. { ok, count, cleaned(사람 수 말을 걷어 낸 글) }
function readHeadcount(text) {
  let count = 0;
  let cleaned = String(text);
  const keep = (n) => {
    if (!count && goodCount(n)) count = n;
    return goodCount(n);
  };
  // 5명, 12명, 5인 / 5인이
  cleaned = cleaned.replace(new RegExp(`${B}(\\d{1,4})\\s*(?:${MYEONG}|인(?:이|은|가|을|의|씩|도|만|입니다)?(?![가-힣]))`, "g"), (all, pre, d) => (keep(Number(d)) ? `${pre} ` : all));
  // 다섯 명, 열두 명, 두명
  cleaned = cleaned.replace(new RegExp(`${B}(${NATIVE_NUM})\\s*${MYEONG}`, "g"), (all, pre, w) => (keep(nativeNumber(w)) ? `${pre} ` : all));
  // 세 분, 다섯 분(높임말)
  cleaned = cleaned.replace(new RegExp(`${B}(${NATIVE_NUM})\\s*분(?:이|께서|은|을|들|입니다)?(?![가-힣])`, "g"), (all, pre, w) => (keep(nativeNumber(w)) ? `${pre} ` : all));
  // 오 명, 십이 명, 이십명 - 한 글자 숫자는 띄어 말했을 때만 읽는다("일명", "사명", "이명"은 사람 수가 아니다). 십·백은 붙여 말해도 읽는다.
  cleaned = cleaned.replace(new RegExp(`${B}(${SINO_NUM})(\\s*)${MYEONG}`, "g"), (all, pre, w, sp) => {
    if (w.length === 1 && !sp && w !== "십" && w !== "백") return all;
    return keep(koreanNumber(w)) ? `${pre} ` : all;
  });
  // "작업인원 5", "인원은 12", "출역 8" - 명을 빼고 말해도 읽는다(호·동·층·시간 같은 말이 뒤따르면 사람 수가 아니다)
  cleaned = cleaned.replace(
    /(?:작업\s*인원|출역\s*인원|투입\s*인원|금일\s*인원|출역|인원|작업자)\s*(?:은|는|이|가|:)?\s*(?:총\s*)?(\d{1,4})(?!\d|\s*(?:호|동|층|㎡|m|번|개|시|분|일|월|년|%|톤|세대|차|단|곳))/g,
    (all, d) => (keep(Number(d)) ? " " : all)
  );
  return { ok: count > 0, count, cleaned };
}

// ---------------- 작업내용 ----------------
// 말끝(긴 것부터 맞춘다)과 조사. 벗기고 난 낱말이 두 글자 이상 남을 때만 벗긴다("양중"의 "중"은 말끝이 아니라 낱말의 일부다).
const ENDING_ALT = "했었어요|했습니다|했어요|했음|했고요|했고|하였습니다|합니다|해요|했다|됐습니다|됐어요|되었습니다|입니다만|입니다|이에요|예요|이고요|이며|이고|중입니다|중이에요|중이고요|중|요";
const R_ENDING = new RegExp(`(?:${ENDING_ALT})$`);
const R_ONLY_ENDING = new RegExp(`^(?:${ENDING_ALT})$`);
const R_PARTICLE = /(?:에서는|에서|으로|까지|부터|에는|에도|이랑|하고|은|는|이|가|을|를|도|로|와|과|의|에|만)$/;
// 작업 내용으로 볼 수 없는 일반 말(인사·때·사람 수·위치를 가리키는 말, "작업 완료" 같은 군말)
const GENERIC = new Set([
  "작업", "공사", "완료", "끝", "마무리", "진행", "시작", "종료", "오늘", "금일", "현재", "지금", "방금", "오전", "오후", "하루", "전체", "모두", "현장", "위치", "장소",
  "인원", "작업인원", "출역", "투입", "업체", "회사", "소속", "보고", "정도", "저희", "저는", "제가", "우리", "안녕하세요", "그리고", "및", "네", "예", "음", "어", "총", "약",
  "명", "인", "호실", "세대", "동", "층", "호", "작업자", "작업중", "하겠습니다",
  // 말끝이 붙은 채로 남는 군말("끝났어요", "마쳤습니다")
  "끝났어요", "끝났습니다", "끝났음", "끝냈어요", "끝냈습니다", "마쳤어요", "마쳤습니다", "다했어요", "다했습니다",
]);
const R_NUMBERED_PLACE = /^(?:지하|옥탑|B)?[\d일이삼사오육칠팔구십백천]*(?:동|호|호실|층|세대|라인)$/i;

function stemOf(word) {
  let w = word;
  for (let round = 0; round < 3; round += 1) {
    const m = R_ENDING.exec(w) || R_PARTICLE.exec(w);
    if (!m || w.length - m[0].length < 2) break;
    w = w.slice(0, w.length - m[0].length);
  }
  return w;
}

function hasWorkContent(text) {
  const words = String(text)
    .split(/[\s,.!?~…·"'“”‘’()\[\]]+/)
    .filter(Boolean);
  for (const word of words) {
    if (/\d/.test(word)) continue; // 동·호·층 번호, 숫자가 든 낱말
    const stem = stemOf(word);
    if (R_ONLY_ENDING.test(word) || R_NUMBERED_PLACE.test(stem) || GENERIC.has(stem) || GENERIC.has(word)) continue;
    if ((stem.match(/[가-힣A-Za-z]/g) || []).length >= 2) return true;
  }
  return false;
}

// ---------------- 살펴보기 ----------------
// 돌려주는 값: { company: { ok, name }, headcount: { ok, count }, work: { ok }, missing: ["company"|"headcount"|"work"의 빠진 것들(CHECKED_PARTS 순서)] }
export function checkWorkLogInfo(rawText) {
  const text = String(rawText == null ? "" : rawText).normalize("NFC").trim(); // 붙여 넣은 글의 자모 분리(NFD)도 같게 읽는다
  const intro = parseSpeakerIntro(text);
  const fromIntro = intro.found && intro.company ? intro.company : "";
  const company = fromIntro || findCompany(text);
  const people = readHeadcount(text);
  // 작업 내용은 소개 말(소속·이름)·업체 이름·사람 수 말을 걷어 낸 글에서 찾는다
  let body = intro.found ? intro.rest : text;
  if (company && !fromIntro) body = body.split(company).join(" ");
  const work = hasWorkContent(readHeadcount(body).cleaned);
  const ok = { company: !!company, headcount: people.ok, work };
  return {
    company: { ok: ok.company, name: company },
    headcount: { ok: people.ok, count: people.count },
    work: { ok: work },
    missing: CHECKED_PARTS.filter((k) => !ok[k]),
  };
}
