// 하루 요약(digestReports.js)을 서류 세 가지의 "칸에 적을 값"으로 바꾼다. 음성 기록에서 알 수 없는 칸은 값을 만들지 않고 비워 둔다.
// 각 모델에는 화면이 보여 줄 "채우는 칸 / 비워 두는 칸" 안내(filled·blank)도 함께 담는다.
import { compactDate, dotDate, dotDateWithDay, isDayKey } from "./dayTools.js";
import { floorText, joinFloors, joinUnits, describeStatements } from "./textRules.js";
import { placeLabel } from "./digestReports.js";
import { cleanTbmFields, hasTbmFields, emptyTbmFields } from "./tbmSummary.js";

// TBM 위험요인 표의 양식 줄 수(5줄). 음성 기록의 위험요인이 이보다 많으면 마지막 줄에 "외 N건"으로 줄인다.
// (회의를 녹음해 요약한 위험요인은 이보다 많아도 줄을 늘려서 모두 넣는다 - docxFill.js)
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
// 음성 기록만 있을 때(회의 녹음이 없을 때)의 안내. 회의를 녹음해 요약했으면 칸마다 실제로 채운 것을 세어 tbmTags가 새로 만든다.
export const TBM_FILLED = ["일시(날짜만)", "작업 장소", "작업 내용", "위험요인(위험 낱말이 들어 있는 기록만)"];
export const TBM_BLANK = ["현장명", "시간", "진행자", "참석 인원", "대책", "점검 항목 확인", "교육·전달 사항", "참석자 확인(소속·성명·서명)"];

// 회의 녹음으로 채운 칸을 반영한 "채우는 칸 / 비워 두는 칸" 안내
function tbmTags(m) {
  const filled = [m.from || m.to ? "일시(날짜·시간)" : "일시(날짜만)"];
  const blank = [];
  const put = (cond, name) => (cond ? filled : blank).push(name);
  put(m.site, "현장명");
  put(m.leader, "진행자");
  put(m.headcount, "참석 인원");
  put(m.place, "작업 장소");
  put(m.work, "작업 내용");
  put(m.risks.length > 0, "위험요인");
  put(m.risks.some((r) => r.measure), "대책");
  put(Object.values(m.checks).some(Boolean), "점검 항목 표시");
  if (!Object.values(m.checks).some(Boolean)) blank.push("점검 항목 확인");
  put(m.notes.length > 0, "교육·전달 사항");
  blank.push("참석자 확인(소속·성명·서명)");
  return { filled, blank };
}

// digest: 하루 요약(digestReports.js), meeting: 회의 녹음을 요약해 사람이 고친 칸 값(tbmSummary.js의 cleanTbmFields 모양, 없으면 null)
// opts.useDigest(기본 false): 회의를 녹음했을 때, 회의에서 채우고 남은 위험요인 줄을 그 날 음성 기록의 위험요인으로도 채울지
//   (회의를 녹음하지 않았으면 예전처럼 음성 기록의 위험요인으로 채운다 - 이 값과 상관없다)
// 칸마다: 회의에서 읽은(또는 사람이 쓴) 값이 있으면 그 값, 없으면 음성 기록에서 읽은 값, 그것도 없으면 빈 칸(양식 그대로).
export function tbmModel(digest, dayKey, meeting = null, opts = {}) {
  const date = dayParts(dayKey);
  const mt = hasTbmFields(meeting) ? cleanTbmFields(meeting) : null;
  const useDigest = !mt || !!(opts && opts.useDigest === true);
  const digestPlace = digest.places
    .map((p) => [p.building, joinFloors(p.floors)].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
  const digestHazards = digest.hazards.map((h) => [h.place, h.text].filter(Boolean).join(" · "));
  const meetingRisks = mt ? mt.risks : [];

  // 회의에서 채우고 남은 양식의 줄(양식은 5줄)에 음성 기록의 위험요인을 채운다. 남는 줄보다 많으면 마지막 줄에 "외 N건"으로 줄인다.
  const free = useDigest ? Math.max(0, TBM_RISK_ROWS - meetingRisks.length) : 0;
  let fromDigest = digestHazards.slice(0, free);
  if (free > 0 && digestHazards.length > free) {
    fromDigest = [...digestHazards.slice(0, free - 1), `${digestHazards[free - 1]} 외 ${digestHazards.length - (free - 1)}건`];
  }
  const risks = [...meetingRisks.map((r) => ({ hazard: r.hazard, measure: r.measure })), ...fromDigest.map((h) => ({ hazard: h, measure: "" }))];
  const empty = emptyTbmFields();
  const m = {
    site: mt ? mt.site : "",
    leader: mt ? mt.leader : "",
    headcount: mt ? mt.headcount : "",
    from: mt ? mt.from : "",
    to: mt ? mt.to : "",
    place: (mt && mt.place) || digestPlace,
    work: (mt && mt.work) || digest.workNames.join(", "),
    risks,
    checks: mt ? mt.checks : empty.checks,
    notes: mt ? mt.notes : [],
  };
  const tags = mt ? tbmTags(m) : { filled: TBM_FILLED, blank: TBM_BLANK };
  return {
    date,
    dateLabel: dotDate(dayKey),
    ...m,
    hazards: risks.map((r) => r.hazard), // 위험요인 글만(예전 모양)
    meeting: !!mt,
    digestHazardCount: digestHazards.length,
    digestHazardsLeft: useDigest && free === 0 ? digestHazards.length : 0, // 회의 내용으로 위험요인 줄이 이미 차서 넣지 못한 음성 기록 위험요인 수(넣지 않기로 한 경우는 0)
    filled: tags.filled,
    blank: tags.blank,
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
