// 날짜 도우미: 서류 탭에서 고른 "하루"의 범위(그 지역 시간 0시~다음 날 0시)와 서류에 적는 날짜 글을 만든다.
// 날짜는 "2026-11-03" 같은 글(dayKey)로 주고받는다. 브라우저의 지역 시간(한국이면 한국 시간)으로 계산한다.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// 날짜 → "2026-11-03"
export function dayKeyOf(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// "2026-11-03" 모양이고 실제로 있는 날짜인지(2월 30일 같은 날짜는 아니다)
export function isDayKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

function parts(key) {
  if (!isDayKey(key)) throw new Error("날짜 형식이 올바르지 않습니다.");
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

// 그날 0시 ~ 다음 날 0시(밀리초). 음성 보고의 timestamp가 start 이상, end 미만이면 그날의 보고다.
export function dayRange(key) {
  const { y, m, d } = parts(key);
  return { start: new Date(y, m - 1, d).getTime(), end: new Date(y, m - 1, d + 1).getTime() };
}

// 며칠 앞뒤의 날짜
export function shiftDay(key, delta) {
  const { y, m, d } = parts(key);
  return dayKeyOf(new Date(y, m - 1, d + Number(delta || 0)));
}

export function weekdayOf(key) {
  const { y, m, d } = parts(key);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

// "2026. 11. 3."
export function dotDate(key) {
  const { y, m, d } = parts(key);
  return `${y}. ${m}. ${d}.`;
}

// "2026. 11. 3. (화)"
export function dotDateWithDay(key) {
  return `${dotDate(key)} (${weekdayOf(key)})`;
}

// "2026년 11월 3일 (화)" - 화면에 보여 줄 때
export function longDate(key) {
  const { y, m, d } = parts(key);
  return `${y}년 ${m}월 ${d}일 (${weekdayOf(key)})`;
}

// "20261103" - 파일 이름용
export function compactDate(key) {
  const { y, m, d } = parts(key);
  return `${y}${pad2(m)}${pad2(d)}`;
}

// 음성 보고가 남겨진 때(밀리초). timestamp가 없으면 createdAt(ISO 글)로 읽고, 둘 다 없으면 NaN.
export function stampOf(report) {
  if (!report) return NaN;
  const ts = Number(report.timestamp);
  if (Number.isFinite(ts) && ts > 0) return ts;
  const iso = Date.parse(String(report.createdAt || ""));
  return Number.isFinite(iso) ? iso : NaN;
}

// 밀리초 → "14:03"
export function hhmm(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
