// 서버(Firestore tbmMeetings)에 저장하는 TBM 회의 문서의 모양을 정하고, 읽어 온 문서를 화면이 쓸 수 있는 모양으로 바로잡는다.
// 파이어베이스나 화면과 상관없는 순수 함수만 둔다. 읽을 때는 어떤 값이 와도 던지지 않고 안전한 값으로 바로잡으며, 저장할 값이 틀렸을 때만 던진다.
//
//   tbmMeetings/{id}
//     dayKey       "2026-11-11" - 회의를 한 날. 서류 탭이 이 값으로 그 날의 회의를 찾는다(같은 필드의 같음 조건 하나뿐이라 별도 색인이 필요 없다).
//     trade        회의를 녹음한 공종별 QR의 공종 id(frame·finish·mep 또는 직접 추가한 공종)
//     author       그 화면에 적은 이름(선택)
//     fields       화면에서 고치는 칸 값(tbmDraft.js의 fieldsForEdit 모양)   text  받아 적은 글
//     summarized   받아 적은 글을 읽어 칸을 채운 적이 있는지   edited  사람이 칸을 직접 고쳤는지
//     createdAt·timestamp  처음 저장하려 한 때 - 같은 회의를 고쳐 다시 저장해도 바뀌지 않는다(목록 순서)
//     updatedAt·updatedFrom  마지막으로 저장한 때와 곳("qr" 현장 화면 | "office" 서류 탭)
//   녹음한 소리는 저장하지 않는다. 받아 적은 글과 칸 값만 올라간다.
import { isDayKey } from "./dayTools.js";
import { TBM_TEXT_MAX } from "./tbmSummary.js";
import { normalizeFields, isEmptyDraft, isMeetingId } from "./tbmDraft.js";

export { isMeetingId };
export const TBM_MEETING_COLLECTION = "tbmMeetings";
export const MEETING_LIMITS = { author: 60, trade: 40, day: 60 };

const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

// 서버에 쓸 문서를 만든다. 문서 번호·날짜가 틀렸거나 저장할 내용이 하나도 없으면 던진다.
//   data: { id, dayKey, trade, author, fields, text, summarized, edited, createdMs, from("office"이면 서류 탭에서 저장한 것) }
export function buildMeetingPayload(data, now = new Date()) {
  const d = data && typeof data === "object" ? data : {};
  if (!isMeetingId(d.id)) throw new Error("회의 번호가 올바르지 않습니다.");
  if (!isDayKey(d.dayKey)) throw new Error("날짜 형식이 올바르지 않습니다.");
  const fields = normalizeFields(d.fields);
  const body = text(d.text, TBM_TEXT_MAX);
  if (isEmptyDraft({ text: body, fields, summarized: d.summarized === true })) throw new Error("저장할 회의 내용이 없습니다.");
  const created = pos(d.createdMs) || now.getTime();
  return {
    dayKey: d.dayKey,
    trade: text(d.trade, MEETING_LIMITS.trade).trim(),
    author: text(d.author, MEETING_LIMITS.author).trim(),
    fields,
    text: body,
    summarized: d.summarized === true,
    edited: d.edited === true,
    createdAt: new Date(created).toISOString(),
    timestamp: created,
    updatedAt: now.toISOString(),
    updatedFrom: d.from === "office" ? "office" : "qr",
  };
}

// 서버에서 읽은 문서를 화면용으로 바로잡는다(문서가 아니면 null).
export function readMeetingDoc(id, raw) {
  if (!raw || typeof raw !== "object" || typeof id !== "string" || !id) return null;
  return {
    id,
    dayKey: isDayKey(raw.dayKey) ? raw.dayKey : "",
    trade: text(raw.trade, MEETING_LIMITS.trade),
    author: text(raw.author, MEETING_LIMITS.author),
    fields: normalizeFields(raw.fields),
    text: text(raw.text, TBM_TEXT_MAX),
    summarized: raw.summarized === true,
    edited: raw.edited === true,
    timestamp: pos(raw.timestamp) || pos(Date.parse(text(raw.createdAt, 40))),
    createdAt: text(raw.createdAt, 40),
    updatedAt: text(raw.updatedAt, 40),
    updatedFrom: raw.updatedFrom === "office" ? "office" : "qr",
  };
}

// 칸 값이 같은가(서류 탭에서 고친 것이 있는지 가릴 때). 화면 값으로 바로잡은 뒤에 견주므로 빈칸·길이 차이 같은 사소한 차이는 따지지 않는다.
export function sameFields(a, b) {
  return JSON.stringify(normalizeFields(a)) === JSON.stringify(normalizeFields(b));
}

// 서류 탭 목록에 보여 줄 한 줄 설명 재료. 값이 없는 칸은 빠진다.
//   { time: "14:03", lines: ["OO아파트 신축공사", "진행 홍길동", "12명", "위험요인 3건"] }
export function describeMeeting(m, hhmm) {
  const f = m && m.fields ? m.fields : normalizeFields(null);
  const lines = [];
  if (f.site) lines.push(f.site);
  if (f.leader) lines.push(`진행 ${f.leader}`);
  if (f.headcount) lines.push(`${f.headcount}명`);
  const risks = f.risks.filter((r) => r.hazard || r.measure).length;
  if (risks) lines.push(`위험요인 ${risks}건`);
  return { time: m && m.timestamp && hhmm ? hhmm(m.timestamp) : "", lines };
}
