// 호실 QR 화면에서 말한 글 속의 "OO동 OO호"를 읽어, 그 말이 '어느 호실'에 대한 것인지 알아낸다.
//
// 호실 QR 화면은 위치가 그 호실로 정해져 있다. 그런데 하도급사가 "102동 502호 도배 완료"처럼 다른 호실을 분명하게 말하면,
// 그 보고는 말한 호실의 기록으로 저장해야(동·층·호실을 말한 곳으로 바꿔 저장) 그 호실의 '음성 기록'과 진행도에 쌓인다.
// 이 파일은 그 판단만 한다 - 저장 위치를 바꾸는 일은 VoiceInspection이 한다.
//
// 읽는 표현은 unitProgress.js의 findUnitMentions와 같다("301호", "3층 1호", "삼백일호"). 여기에 동("102동", "백이동")을 더해서 읽는다.
// 읽은 호실이 나중에 호실 정보 화면에서도 같은 호실로 읽히도록(unitProgress.resolveUnit), 표현은 그쪽보다 느슨하지 않게 맞춘다.
//
// 보수적으로 읽는다. 어느 호실인지 확실할 때(층까지 말했을 때)만 옮기고, 애매하면 옮기지 않고 이유를 알려 준다.
//  - "2호"처럼 호수만 말한 것은 어느 층인지 알 수 없어 옮기지 않는다("2호 라인"·"3호 계단" 같은 현장 말과 헷갈리지 않도록).
//    다만 이 화면의 호실과 같은 호수("1호"가 301호 화면에서)이면 이 호실 이야기로 본다.
//  - 말한 호실이 둘 이상이거나 동이 둘 이상이면 옮기지 않는다.
//  - 이 현장에 없는 동·층·호실이면 옮기지 않는다.

import { koreanNumber } from "./progressText.js";
import { canonUnit } from "./unitProgress.js";
import { floorChoices } from "./voice.js";

const KO1 = "일이삼사오육칠팔구";
const KO = `${KO1}십백천`;
// 동 번호: "102동", 또는 "백이동"(한글 숫자는 '백'이 들어간 것만 읽는다 - '이동'·'삼동' 같은 낱말과 헷갈리지 않도록). '동안·동시·동바리'는 동 이름이 아니다.
const DONG = `(\\d{1,4}|(?:[${KO1}])?백[${KO1}십]{1,3})\\s*동(?!안|시|바리)`;
const OF = "\\s*(?:의\\s*)?";
const FLOOR_NUM = `(\\d{1,2}|[${KO}]{1,4})`;
const UNIT_NUM = `(\\d{1,2}|[${KO}]{1,3})`;
const FULL_NUM = `(\\d{3,4}|(?:[${KO1}])?백[${KO1}십]{1,3})`; // 호실 번호 전체(층×100+호): "502", "오백이"
const HO_END = "\\s*호(?:실)?(?!기|선|차|점)";

const R_DONG_FLOOR_UNIT = new RegExp(`${DONG}${OF}${FLOOR_NUM}\\s*층\\s*${UNIT_NUM}\\s*호(?:실)?(?!기|선|차|점)`, "g");
const R_DONG_FULL = new RegExp(`${DONG}${OF}${FULL_NUM}${HO_END}`, "g");
const R_DONG_UNIT = new RegExp(`${DONG}${OF}(\\d{1,2})\\s*호(?:실)?(?!기|선|차|점|수)`, "g");
const R_DONG = new RegExp(DONG, "g");
const R_FLOOR_UNIT = new RegExp(`${FLOOR_NUM}\\s*층\\s*${UNIT_NUM}\\s*호(?:실)?(?!기|선|차|점)`, "g");
const R_FULL = new RegExp(`${FULL_NUM}${HO_END}`, "g");
const R_UNIT = /(^|[^\d])(\d{1,2})\s*호(?:실)?(?!기|선|차|점|수)/g;

function num(s) {
  return /^\d+$/.test(s) ? Number(s) : koreanNumber(s);
}

// 말한 글에서 동·호실 표현을 모두 찾는다.
// 반환: { dongs: [말한 동 번호(중복 없음)], places: [{ dong(호실에 붙여 말한 동, 없으면 null), floor(층, 호수만 말했으면 null), unit(호수 숫자) }] }
export function findSpokenPlaces(text) {
  const out = { dongs: [], places: [] };
  let work = String(text == null ? "" : text).normalize("NFC");
  if (!work) return out;
  const eat = (re, fn) => {
    work = work.replace(re, (...args) => {
      fn(args);
      return " ";
    });
  };
  const dong = (s) => {
    const n = num(s);
    if (!Number.isInteger(n) || n < 1) return null;
    if (!out.dongs.includes(n)) out.dongs.push(n);
    return n;
  };
  // 읽을 수 없는 숫자("십이십호" 등)가 섞인 표현은 호실로 세지 않는다
  const place = (d, f, u) => {
    if (Number.isInteger(u) && (f === null || Number.isInteger(f))) out.places.push({ dong: d, floor: f, unit: u });
  };
  // 동이 붙은 표현부터 읽고(읽은 글자는 지운다), 그다음 동 없이 말한 호실, 마지막으로 호수만 말한 것
  eat(R_DONG_FLOOR_UNIT, (a) => place(dong(a[1]), num(a[2]), num(a[3])));
  eat(R_DONG_FULL, (a) => {
    const n = num(a[2]);
    place(dong(a[1]), Math.floor(n / 100), n % 100);
  });
  eat(R_DONG_UNIT, (a) => place(dong(a[1]), null, Number(a[2])));
  eat(R_DONG, (a) => {
    dong(a[1]);
  });
  eat(R_FLOOR_UNIT, (a) => place(null, num(a[1]), num(a[2])));
  eat(R_FULL, (a) => {
    const n = num(a[1]);
    place(null, Math.floor(n / 100), n % 100);
  });
  eat(R_UNIT, (a) => place(null, null, Number(a[2])));
  return out;
}

// 동 이름("101동")에서 번호(101)를 꺼낸다. 번호가 없는 이름이면 NaN.
export function buildingNo(building) {
  const m = String((building && building.name) || "").match(/\d+/);
  return m ? Number(m[0]) : NaN;
}

function findBuilding(buildings, no) {
  const hit = buildings.filter((b) => b && buildingNo(b) === no);
  return hit.length === 1 ? hit[0] : null; // 번호가 같은 동이 둘이면 어느 쪽인지 알 수 없다
}

function validUnit(building, unit) {
  const max = Number(building && building.unitsPerFloor) > 0 ? Number(building.unitsPerFloor) : 99;
  return Number.isInteger(unit) && unit >= 1 && unit <= max;
}

// 말한 글이 이 화면의 호실이 아닌 '다른 호실'을 가리키는지 알아낸다.
//   text: 말한 글(은어를 표준 용어로 바꾼 전체 문장)
//   here: 이 화면의 호실 { buildingId, floor, unit }
//   buildings: 현장의 모든 동 [{ id, name, floors, unitsPerFloor }]
// 반환:
//   { kind: "none" }                      호실·동을 말하지 않았다 → 평소처럼 이 호실의 보고
//   { kind: "same" }                      이 화면의 호실을 말했다 → 평소처럼 이 호실의 보고
//   { kind: "other", building, floor, unit }  다른 호실을 분명하게 말했다 → 그 호실의 보고로 저장 (unit은 "02"처럼 두 자리)
//   { kind: "unknown", place }            이 현장에 없는 동·층·호실을 말했다(place: "999동 5층 02호") → 옮기지 않고 알린다
//   { kind: "partial" }                   동이나 호수만 말해 어느 호실인지 알 수 없다 → 옮기지 않고 알린다
//   { kind: "multiple" }                  호실이나 동을 둘 이상 말했다 → 옮기지 않는다
export function resolveSpokenPlace(text, here, buildings) {
  const list = Array.isArray(buildings) ? buildings : [];
  const hereB = list.find((b) => b && here && b.id === here.buildingId) || null;
  if (!hereB) return { kind: "none" };
  const hereNo = buildingNo(hereB);
  const hereFloor = Number(here.floor);
  const hereUnit = canonUnit(here.unit, hereFloor);

  const { dongs, places } = findSpokenPlaces(text);
  if (dongs.length > 1) return { kind: "multiple" };
  const spokenDong = dongs.length === 1 ? dongs[0] : null; // 글에서 말한 동(호실에 붙여 말하지 않았어도 같은 동 이야기로 본다)
  if (places.length === 0) return spokenDong !== null && spokenDong !== hereNo ? { kind: "partial" } : { kind: "none" };

  let sawPartial = false;
  const targets = [];
  for (const p of places) {
    const dong = p.dong !== null ? p.dong : spokenDong; // null이면 이 화면의 동
    const sameBuilding = dong === null || dong === hereNo;
    const unitText = Number.isInteger(p.unit) ? String(p.unit).padStart(2, "0") : "";
    let floor = p.floor;
    if (floor === null) {
      // 호수만 말했다: 이 화면과 같은 동·같은 호수일 때만 이 호실 이야기로 읽는다
      if (sameBuilding && unitText === hereUnit) floor = hereFloor;
      else {
        sawPartial = true;
        continue;
      }
    }
    if (!Number.isInteger(floor)) {
      sawPartial = true;
      continue;
    }
    const key = `${sameBuilding ? "here" : dong}|${floor}|${p.unit}`;
    if (!targets.some((t) => t.key === key)) targets.push({ key, dong, sameBuilding, floor, unit: p.unit, unitText });
  }
  if (targets.length === 0) return { kind: "partial" };
  if (targets.length > 1 || sawPartial) return { kind: "multiple" };

  const t = targets[0];
  if (t.sameBuilding && t.floor === hereFloor && t.unitText === hereUnit) return { kind: "same" };
  const b = t.sameBuilding ? hereB : findBuilding(list, t.dong);
  if (!b || !floorChoices(b.floors).includes(t.floor) || !validUnit(b, t.unit)) {
    const dongText = t.dong !== null ? `${t.dong}동` : hereB.name;
    return { kind: "unknown", place: `${dongText} ${t.floor}층 ${t.unitText || t.unit}호` };
  }
  return { kind: "other", building: b, floor: t.floor, unit: t.unitText };
}
