// 하루 요약(digestReports.js)을 서류 세 가지의 "칸에 적을 값"으로 바꾼다. 음성 기록에서 알 수 없는 칸은 값을 만들지 않고 비워 둔다.
// 각 모델에는 화면이 보여 줄 "채우는 칸 / 비워 두는 칸" 안내(filled·blank)도 함께 담는다.
import { compactDate, dotDate, dotDateWithDay, isDayKey } from "./dayTools.js";
import { floorText, joinFloors, joinUnits, describeStatements } from "./textRules.js";
import { placeLabel } from "./digestReports.js";

// TBM 위험요인 표의 줄 수(양식에 5줄). 이보다 많으면 마지막 줄에 "외 N건"으로 줄인다.
export const TBM_RISK_ROWS = 5;

const dayParts = (dayKey) => {
  if (!isDayKey(dayKey)) throw new Error("날짜 형식이 올바르지 않습니다.");
  const [y, m, d] = dayKey.split("-").map(Number);
  return { y, m, d };
};

// 위치 칸: "101동 3층 01~03호" (호실이 아니라 부재 이름이 적힌 기록은 그 이름을 뒤에 붙인다)
function placeWithPart(g) {
  const part = [joinUnits(g.units), g.structural.join(", ")].filter(Boolean).join(", ");
  return [placeLabel(g), part].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- 작업일보
export const WORKLOG_FILLED = ["작성일", "작업 내용 표의 공종 · 위치 · 작업 내용"];
export const WORKLOG_BLANK = ["현장명", "날씨", "최저/최고기온", "작업 중지 여부·사유", "계획 물량 · 금일 물량 · 비고", "출역 인원", "투입 장비", "특이사항", "서명"];

export function workLogModel(digest, dayKey) {
  dayParts(dayKey);
  return {
    date: dotDateWithDay(dayKey),
    rows: digest.groups.map((g) => ({
      trade: g.work,
      place: placeWithPart(g),
      content: describeStatements(g.statements),
    })),
    filled: WORKLOG_FILLED,
    blank: WORKLOG_BLANK,
    fileName: `작업일보_${compactDate(dayKey)}.docx`,
  };
}

// ---------------------------------------------------------------- TBM 일지
export const TBM_FILLED = ["일시(날짜만)", "작업 장소", "작업 내용", "위험요인(위험 낱말이 들어 있는 기록만)"];
export const TBM_BLANK = ["현장명", "시간", "진행자", "참석 인원", "대책", "점검 항목 확인", "교육·전달 사항", "참석자 확인(소속·성명·서명)"];

export function tbmModel(digest, dayKey) {
  const date = dayParts(dayKey);
  const place = digest.places
    .map((p) => [p.building, joinFloors(p.floors)].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
  let hazards = digest.hazards.map((h) => [h.place, h.text].filter(Boolean).join(" · "));
  let more = 0;
  if (hazards.length > TBM_RISK_ROWS) {
    more = hazards.length - (TBM_RISK_ROWS - 1);
    hazards = [...hazards.slice(0, TBM_RISK_ROWS - 1), `${hazards[TBM_RISK_ROWS - 1]} 외 ${more}건`];
  }
  return {
    date,
    dateLabel: dotDate(dayKey),
    place,
    work: digest.workNames.join(", "),
    hazards,
    filled: TBM_FILLED,
    blank: TBM_BLANK,
    fileName: `TBM일지_${compactDate(dayKey)}.docx`,
  };
}

// ---------------------------------------------------------------- 검측요청서(한글 .hwp)
export const INSPECTION_FILLED = ["번호 줄의 날짜", "위치 및 공종", "검측 부위", "검측 사항"];
export const INSPECTION_BLANK = ["번호", "검측요구일시", "첨부", "공사 현장대리인 서명·도장", "검측결과통보서 부분 전체"];

// 같은 동·층·공종(세부 공종)의 기록마다 한 장
export function inspectionModels(digest, dayKey) {
  dayParts(dayKey);
  const used = new Set();
  return digest.groups.map((g) => {
    const position = [placeLabel(g), g.work].filter(Boolean).join(" / ");
    const part = [floorText(g.floor), [joinUnits(g.units), ...g.structural].filter(Boolean).join(", ")].filter(Boolean).join(" ");
    const lines = describeStatements(g.statements);
    // 문장이 둘까지는 한 줄씩, 더 많으면 쉼표로 이어서 칸(두 줄)에 최대한 많이 담는다
    const matters = lines.length <= 2 ? lines.join("\n") : lines.join(", ");
    let name = `검측요청서_${compactDate(dayKey)}_${safeName([g.building, floorText(g.floor)].join(""))}_${safeName(g.item || g.tradeLabel)}`;
    name = name.replace(/_+$/g, "");
    let fileName = `${name}.hwp`;
    for (let n = 2; used.has(fileName); n += 1) fileName = `${name}_${n}.hwp`;
    used.add(fileName);
    return {
      key: g.key,
      label: position,
      count: g.count,
      values: { date: dotDate(dayKey), position, part, when: "", matters },
      fileName,
      filled: INSPECTION_FILLED,
      blank: INSPECTION_BLANK,
    };
  });
}

// 파일 이름에 못 쓰는 글자(\ / : * ? " < > |)와 공백을 뺀다
function safeName(text) {
  return String(text || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, "")
    .slice(0, 30);
}

export function inspectionZipName(dayKey) {
  return `검측요청서_${compactDate(dayKey)}.zip`;
}
