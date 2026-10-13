// 음성 보고 → 호실별 공종 진행도. (문장 분석 자체는 progressText.js, 여기서는 "어느 호실의 보고인지"와 "보고들을 모아 진행도로 만드는 일"을 한다)
//
// 진행도는 저장해 두지 않고 보고에 저장된 글(normalized)과 지금의 체크리스트 항목으로 그때그때 계산한다.
// 그래서 용어 표를 다시 적용하거나(글이 바뀜) 관리자가 항목 이름을 고쳐도 진행도가 알아서 맞춰진다.
// 감리 승인(inspections)으로 계산하는 기존 진행도와는 따로 보여 주는 '음성 보고' 층이다. (골구도는 승인된 것만 쓰는 기존 규칙 그대로)

import { CATEGORIES, itemsForCategory } from "./data.js";
import { analyzeProgress, koreanNumber } from "./progressText.js";

// ---------------- 호실 식별 ----------------

// 호수는 "01"처럼 두 자리로 맞춰 같은 호실이 "1"/"01"로 다르게 적혀 있어도 한 곳으로 모은다. 숫자가 아닌 값은 그대로 둔다.
// 층을 함께 주면 "301"(3층 01호를 층×100+호로 적은 것)도 "01"로 본다. 골구도·현장 말투로는 3층 01호를 "301호"라고 부르기 때문이다.
export function canonUnit(unit, floor) {
  const s = String(unit == null ? "" : unit).trim();
  if (!/^\d+$/.test(s)) return s;
  const n = Number(s);
  const f = Number(floor);
  if (s.length >= 3 && s.length <= 4 && Number.isInteger(f) && f > 0 && Math.floor(n / 100) === f && n % 100 >= 1) return String(n % 100).padStart(2, "0");
  return String(n).padStart(2, "0");
}

export function unitKeyOf(buildingId, floor, unit) {
  return `${String(buildingId || "")}|${Number(floor)}|${canonUnit(unit, floor)}`;
}

// 문장이나 부재 이름 속에서 호실 표현을 모두 찾는다.
//  "3층 1호" → 3층 01호 / "301호" → 3층 01호 (층×100+호) / "2호"(호수만) → 그 보고의 층의 02호 / "삼백일호" → 301호
// 돌려주는 값: { units: [호수 문자열...](중복 없음), conflict: 층이 보고의 층과 다르거나 호수가 범위를 넘는 표현이 있었는지 }
export function findUnitMentions(text, floor, unitsPerFloor) {
  const out = { units: [], conflict: false };
  let work = String(text == null ? "" : text).normalize("NFC");
  if (!work) return out;
  const max = Number(unitsPerFloor) > 0 ? Number(unitsPerFloor) : 99;
  const add = (f, u) => {
    if (!Number.isInteger(u) || u < 1 || u > max || (f !== null && f !== floor)) {
      out.conflict = true;
      return;
    }
    const label = String(u).padStart(2, "0");
    if (!out.units.includes(label)) out.units.push(label);
  };
  const eat = (re, fn) => {
    work = work.replace(re, (...args) => {
      fn(args);
      return " ";
    });
  };
  const KO = "일이삼사오육칠팔구십백천";
  // 1) "3층 1호", "삼층 일호"
  eat(/(\d{1,2})\s*층\s*(\d{1,2})\s*호/g, (a) => add(Number(a[1]), Number(a[2])));
  eat(new RegExp(`([${KO}]{1,4})\\s*층\\s*([${KO}]{1,3})\\s*호`, "g"), (a) => add(koreanNumber(a[1]), koreanNumber(a[2])));
  // 2) "301호", "1002호", "삼백일호"
  eat(/(\d{3,4})\s*호(?:실)?(?!기|선|차|점)/g, (a) => add(Math.floor(Number(a[1]) / 100), Number(a[1]) % 100));
  eat(new RegExp(`((?:[일이삼사오육칠팔구])?백[일이삼사오육칠팔구십]{0,3})\\s*호(?:실)?(?!기|선|차|점)`, "g"), (a) => {
    const n = koreanNumber(a[1]);
    add(Math.floor(n / 100), n % 100);
  });
  // 3) "2호", "02호"(호수만) - 보고의 층에 있는 호실로 본다. "1호기"·"2호선" 같은 말은 호실이 아니다.
  eat(/(^|[^\d])(\d{1,2})\s*호(?:실)?(?!기|선|차|점|수)/g, (a) => add(null, Number(a[2])));
  return out;
}

// 보고 한 건이 어느 호실의 것인지 알아낸다. 보고의 동·층(위치 선택)은 그대로 믿고, 호수만 찾는다.
//   rep: { buildingId, buildingName, floor, elem, normalized, rawText }
//   opts: { fixedUnit }(호실 QR 화면처럼 호수가 이미 정해진 경우), { unitsPerFloor }(범위 확인용)
// 호수를 정하는 순서: 고정 호수(fixedUnit) > 부재 칸(elem)에 적힌 호실 > 말한 글 속의 호실.
// 앞의 둘로 호실이 정해져 있어도, 말한 글에 '다른' 호실·층·동이 들어 있으면 어느 호실 이야기인지 알 수 없으므로 반영하지 않는다
// (301호 QR 앞에서 "302호 도배 완료"라고 말한 경우 301호에 잘못 쌓이지 않도록).
// 돌려주는 값: { ok: true, key, buildingId, floor, unit, via: "fixed" | "elem" | "text" }
//             { ok: false, reason: "location"(동·층을 알 수 없음) | "none"(호수가 없음) | "multiple"(여러 호실) | "conflict"(층·동·호실·범위가 맞지 않음) }
export function resolveUnit(rep, opts = {}) {
  const buildingId = String((rep && rep.buildingId) || "");
  const floor = Number(rep && rep.floor);
  if (!buildingId || !Number.isInteger(floor) || floor === 0) return { ok: false, reason: "location" };
  const done = (unit, via) => ({ ok: true, key: unitKeyOf(buildingId, floor, unit), buildingId, floor, unit: canonUnit(unit, floor), via });

  const text = String((rep && (rep.normalized || rep.rawText)) || "");
  // 문장 속 "102동"이 이 보고의 동과 다르면 다른 동 이야기이므로 반영하지 않는다.
  const dong = text.match(/(\d{1,4})\s*동(?!안|시|바리)/);
  const own = String((rep && rep.buildingName) || "").match(/\d+/);
  if (dong && own && Number(dong[1]) !== Number(own[0])) return { ok: false, reason: "conflict" };
  const mentions = findUnitMentions(text, floor, opts.unitsPerFloor);

  // 호수가 이미 정해진 경우(호실 QR 화면의 고정 호수, 부재 칸에 적힌 호실)
  let chosen = null;
  if (opts.fixedUnit != null && String(opts.fixedUnit).trim()) {
    chosen = { unit: opts.fixedUnit, via: "fixed" };
  } else {
    const fromElem = findUnitMentions(rep && rep.elem, floor, opts.unitsPerFloor);
    if (fromElem.units.length === 1 && !fromElem.conflict) chosen = { unit: fromElem.units[0], via: "elem" };
    else if (fromElem.units.length > 1) return { ok: false, reason: "multiple" };
    else if (fromElem.conflict) return { ok: false, reason: "conflict" };
  }
  if (chosen) {
    const canon = canonUnit(chosen.unit, floor);
    const others = mentions.units.filter((u) => u !== canon);
    if (mentions.conflict || others.length > 0) return { ok: false, reason: !mentions.conflict && mentions.units.includes(canon) ? "multiple" : "conflict" };
    return done(chosen.unit, chosen.via);
  }

  // 말한 글에서 찾는다
  if (mentions.units.length === 1 && !mentions.conflict) return done(mentions.units[0], "text");
  if (mentions.units.length > 1) return { ok: false, reason: "multiple" };
  if (mentions.conflict) return { ok: false, reason: "conflict" };
  return { ok: false, reason: "none" };
}

// ---------------- 보고 → 반영 내용 ----------------

// 보고 하나를 분석한다. 반환: { resolved(resolveUnit 결과), analysis(analyzeProgress 결과) }
export function analyzeReport(rep, checklistItems, opts = {}) {
  const text = String((rep && (rep.normalized || rep.rawText)) || "");
  return { resolved: resolveUnit(rep, opts), analysis: analyzeProgress(text, checklistItems) };
}

export function hasEffect(analysis) {
  return !!analysis && (analysis.items.length > 0 || analysis.categories.length > 0);
}

// ---------------- 보고들을 모아 호실 진행도로 ----------------

const EMPTY_CAT = () => ({ percent: 0, total: 0, done: 0, doing: 0 });

// 한 호실의 보고들(이 호실의 것으로 확인된 것만)을 시간순으로 모아 항목별·공종별 진행도를 만든다.
//   entries: [{ id, timestamp, createdAt, author, off(관리자가 제외한 보고인지), analysis }]
// 규칙: 항목의 진행도는 제외되지 않은 보고들 중 가장 큰 값(한 번 완료로 말해지면 완료로 남는다 - 승인 기록과 같은 방식).
//       잘못 반영된 보고는 관리자가 제외한다. 공종 전체를 "완료"로 말한 보고는 그 공종의 모든 항목을 완료로 본다.
// 반환: { byItem: { [itemId]: { percent, state, reportId, author, at, via: "item" | "category" } },
//         byCategory: { [categoryId]: { percent, total, done, doing } },
//         effects: [{ reportId, off, items, categories }]  - 보고별 반영 내용(최신순 아님, 입력 순서 유지) }
export function foldUnitProgress(entries, checklistItems) {
  const list = (Array.isArray(entries) ? entries : []).slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const byItem = {};
  const effects = [];
  const catItems = {};
  for (const c of CATEGORIES) catItems[c.id] = itemsForCategory(checklistItems, c.id);
  const raise = (itemId, percent, e, via) => {
    const prev = byItem[itemId];
    if (prev && prev.percent >= percent) return;
    byItem[itemId] = { percent, state: percent >= 100 ? "done" : "doing", reportId: e.id, author: e.author || "", at: e.createdAt || "", via };
  };
  for (const e of list) {
    const a = e.analysis;
    if (!hasEffect(a)) continue;
    effects.push({ reportId: e.id, off: !!e.off, items: a.items, categories: a.categories });
    if (e.off) continue;
    for (const it of a.items) raise(it.itemId, it.percent, e, "item");
    for (const cat of a.categories) for (const item of catItems[cat.categoryId] || []) raise(item.id, 100, e, "category");
  }
  const byCategory = {};
  for (const c of CATEGORIES) {
    const items = catItems[c.id];
    const row = EMPTY_CAT();
    row.total = items.length;
    let sum = 0;
    for (const item of items) {
      const v = byItem[item.id];
      if (!v) continue;
      sum += v.percent;
      if (v.state === "done") row.done += 1;
      else row.doing += 1;
    }
    row.percent = row.total ? Math.round(sum / row.total) : 0;
    byCategory[c.id] = row;
  }
  return { byItem, byCategory, effects };
}

// 보고 목록(한 층 전체)에서 이 호실의 보고만 골라 분석하고 모은다.
//   reports: fetchUnitFloorVoiceReports 결과, unit: { buildingId, floor, unit }, unitsPerFloor: 그 동의 층당 세대수
export function progressForUnit(reports, unit, checklistItems, unitsPerFloor) {
  const key = unitKeyOf(unit.buildingId, unit.floor, unit.unit);
  const mine = [];
  for (const r of Array.isArray(reports) ? reports : []) {
    if (!r || r.buildingId !== unit.buildingId || Number(r.floor) !== Number(unit.floor)) continue;
    // 호실부터 확인하고(가볍다), 이 호실의 보고만 글을 분석한다(한 층에 보고가 많아도 빠르게)
    const resolved = resolveUnit(r, { unitsPerFloor });
    if (!resolved.ok || resolved.key !== key) continue;
    const analysis = analyzeProgress(String(r.normalized || r.rawText || ""), checklistItems);
    mine.push({ id: r.id, timestamp: r.timestamp || 0, createdAt: r.createdAt || "", author: r.author || "", off: !!r.progressOff, analysis, report: r });
  }
  const folded = foldUnitProgress(mine, checklistItems);
  return { ...folded, entries: mine };
}
