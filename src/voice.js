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

// 현장 은어 → 국토교통부 표준 용어. 위에서부터 차례로 모두 바꾼다. 용어를 늘리려면 이 목록에 한 줄만 추가하면 된다.
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

export function normalizeSlang(text) {
  let out = String(text);
  for (const [from, to] of SLANG_RULES) out = out.split(from).join(to);
  return out;
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
