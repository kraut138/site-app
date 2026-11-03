// 음성 기록 하나를 서류 칸에 적을 글로 바꾸는 규칙들(화면·저장소와 무관한 순수 함수라 따로 시험할 수 있다).
// 원칙: 기록에 적힌 것만 쓰고, 기록에서 알 수 없는 것은 만들어 내지 않는다.
import { tradeName, convertedText } from "../voice.js";
import { findUnitMentions } from "../unitProgress.js";

// ---------------- 글 다듬기 ----------------

// 줄 바꿈·겹친 공백을 한 칸으로 줄이고 앞뒤 공백을 없앤다
export function oneLine(text) {
  return String(text == null ? "" : text)
    .replace(/\s+/g, " ")
    .trim();
}

// 같은 말인지 비교할 때 쓰는 키: 공백·기호를 빼고 소문자로
export function sameKey(text) {
  return oneLine(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]/gu, "");
}

// 기록 하나의 "한 일" 문장. 화면의 '순화한 내용'(용어 DB에 있는 단어로 이룬 글)을 쓴다.
// 그 글이 비어 있으면(용어 DB 단어가 하나도 없던 말) 말한 글은 쓰지 않고, 고른 공종·세부 공종으로 "마감공사 · 도배 검측 접수"처럼 적는다.
export function statementOf(report) {
  const text = oneLine(convertedText(report));
  if (text) return text;
  const where = [tradeName(report && report.trade), oneLine(report && report.tradeItem)].filter(Boolean).join(" · ");
  return `${where ? `${where} ` : ""}검측 접수`;
}

// ---------------- 위치(동·층·호실) ----------------

// 3 → "3층", -1 → "지하1층", 모르면 ""
export function floorText(floor) {
  const n = Number(floor);
  if (!Number.isInteger(n) || n === 0) return "";
  return n < 0 ? `지하${-n}층` : `${n}층`;
}

// 이어지는 숫자들을 묶는다: [1,2,3,5] → [[1,2,3],[5]]
function runsOf(nums) {
  const sorted = Array.from(new Set(nums)).sort((a, b) => a - b);
  const runs = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last && n === last[last.length - 1] + 1) last.push(n);
    else runs.push([n]);
  }
  return runs;
}

// 이어진 세 개 이상은 "~"로 줄인다(둘은 "·"로 둘 다 적는다)
function compressRuns(nums, fmt) {
  const out = [];
  for (const run of runsOf(nums)) {
    if (run.length >= 3) out.push(`${fmt(run[0])}~${fmt(run[run.length - 1])}`);
    else run.forEach((n) => out.push(fmt(n)));
  }
  return out;
}

// ["01","02","03","05"] → "01~03·05호". 호실이 없으면 "".
export function joinUnits(units) {
  const nums = (units || []).map((u) => Number(u)).filter((n) => Number.isInteger(n) && n > 0);
  if (nums.length === 0) return "";
  return `${compressRuns(nums, (n) => String(n).padStart(2, "0")).join("·")}호`;
}

// [3,4,5] → "3~5층", [3,5] → "3·5층", [-1,3] → "지하1층, 3층", [-2,-1] → "지하1·2층". 층을 모르면 "".
export function joinFloors(floors) {
  const nums = (floors || []).map((f) => Number(f)).filter((n) => Number.isInteger(n) && n !== 0);
  if (nums.length === 0) return "";
  const out = [];
  const basement = compressRuns(nums.filter((n) => n < 0).map((n) => -n), String);
  const upper = compressRuns(nums.filter((n) => n > 0), String);
  if (basement.length) out.push(`지하${basement.join("·")}층`);
  if (upper.length) out.push(`${upper.join("·")}층`);
  return out.join(", ");
}

// 기록의 동·층. 동 이름·층 숫자가 비어 있으면 위치 글(zone, "101동 3층")에서 읽는다.
export function placeOf(report) {
  const zone = oneLine(report && report.zone);
  let building = oneLine(report && report.buildingName);
  let floor = Number(report && report.floor);
  const m = /^(.*?)\s*(?:지하\s*(\d+)\s*층|(\d+)\s*층)$/.exec(zone);
  if (m) {
    if (!building) building = m[1].trim();
    if (!Number.isInteger(floor) || floor === 0) floor = m[2] ? -Number(m[2]) : Number(m[3]);
  }
  if (!Number.isInteger(floor) || floor === 0) floor = null;
  return { building, floor };
}

// 동 이름 정렬용 숫자("101동" → 101, 숫자가 없으면 아주 큰 수)
export function buildingNumber(name) {
  const m = /\d+/.exec(String(name || ""));
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}

// 기록 하나가 가리키는 호실들("01"처럼 두 자리)과, 호실이 아닌 부재 이름("C1 기둥" 등).
// 호실은 부재 칸과 말한 글에서 읽는다(호실 정보 화면과 같은 규칙, unitProgress.js).
export function unitsAndElem(report, floor) {
  const elem = oneLine(report && report.elem);
  const fromElem = findUnitMentions(elem, floor, 99);
  const text = oneLine((report && (report.normalized || report.rawText)) || "");
  const fromText = findUnitMentions(text, floor, 99);
  const units = [];
  for (const u of [...fromElem.units, ...fromText.units]) if (!units.includes(u)) units.push(u);
  // 부재 칸에서 호실이 하나도 읽히지 않으면 그 글은 호실이 아니라 부재 이름이다
  const structural = fromElem.units.length === 0 && !fromElem.conflict ? elem : "";
  return { units, structural };
}

// ---------------- 위험요인(안전점검회의 일지용) ----------------

// 이 낱말이 들어 있는 기록만 "위험요인" 칸으로 옮긴다. 일반 작업 말("비계 설치")이 위험요인으로 잘못 올라가지 않도록
// 위험 그 자체를 뜻하는 낱말만 둔다.
const HAZARD_WORDS = [
  "추락", "낙하", "개구부", "감전", "누전", "화재", "불티", "협착", "끼임", "끼일", "전도", "미끄러", "넘어질", "붕괴", "질식", "폭발",
  "위험", "미설치", "미착용", "파손", "탈락", "흔들", "기울", "안전사고", "아차사고",
];

// 위험 낱말이 들어 있는 기록이면 그 글(은어를 표준 용어로 바꾼 문장), 아니면 ""
export function hazardText(report) {
  const text = oneLine((report && (report.normalized || report.rawText)) || "");
  if (!text) return "";
  const squashed = text.replace(/\s+/g, "");
  return HAZARD_WORDS.some((w) => squashed.includes(w)) ? text : "";
}

// ---------------- 문장 합치기 ----------------

// [{ text, units: ["01"] }] → 같은 문장은 한 번만, 호실이 다르면 괄호로 구분해서 적는다.
// 문장이 하나뿐이면 호실은 위치 칸에 있으므로 괄호를 붙이지 않는다.
export function describeStatements(statements) {
  const list = statements || [];
  const multi = list.length > 1;
  return list.map((s) => (multi && s.units && s.units.length ? `${s.text} (${joinUnits(s.units)})` : s.text));
}
