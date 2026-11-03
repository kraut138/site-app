// 하루치 음성 기록을 서류 세 가지가 함께 쓰는 "하루 요약"으로 모은다.
//   entries : 기록 하나하나(시간순)   groups : 같은 동·층·공종·세부 공종끼리 묶은 것   places : 일한 동·층   hazards : 위험 낱말이 들어 있는 기록
// 순수 함수(화면·저장소와 무관)라 Node에서 그대로 시험한다.
import { VOICE_TRADES, tradeName } from "../voice.js";
import { stampOf } from "./dayTools.js";
import { oneLine, sameKey, statementOf, placeOf, buildingNumber, unitsAndElem, hazardText, floorText, joinUnits } from "./textRules.js";

function tradeRank(id) {
  const i = VOICE_TRADES.findIndex((t) => t.id === id);
  return i < 0 ? VOICE_TRADES.length : i;
}

function toEntry(report) {
  const { building, floor } = placeOf(report);
  const { units, structural } = unitsAndElem(report, floor);
  const trade = String(report.trade || "");
  return {
    id: String(report.id || ""),
    ts: stampOf(report),
    building,
    floor,
    trade,
    tradeLabel: tradeName(trade),
    item: oneLine(report.tradeItem),
    statement: statementOf(report),
    units,
    structural,
    hazard: hazardText(report),
  };
}

// 동·층 이름 한 줄: "101동 3층"
export function placeLabel(e) {
  return [e.building, floorText(e.floor)].filter(Boolean).join(" ");
}

function byBuilding(a, b) {
  const na = buildingNumber(a);
  const nb = buildingNumber(b);
  if (na !== nb) return na - nb;
  return String(a).localeCompare(String(b), "ko");
}

function groupEntries(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = [e.building, e.floor === null ? "" : e.floor, e.trade, e.item].join("|");
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        building: e.building,
        floor: e.floor,
        trade: e.trade,
        tradeLabel: e.tradeLabel,
        item: e.item,
        work: [e.tradeLabel, e.item].filter(Boolean).join(" · "),
        units: [],
        structural: [],
        statements: [],
        count: 0,
        firstTs: e.ts,
        lastTs: e.ts,
      };
      map.set(key, g);
    }
    g.count += 1;
    if (Number.isFinite(e.ts)) {
      if (!Number.isFinite(g.firstTs) || e.ts < g.firstTs) g.firstTs = e.ts;
      if (!Number.isFinite(g.lastTs) || e.ts > g.lastTs) g.lastTs = e.ts;
    }
    for (const u of e.units) if (!g.units.includes(u)) g.units.push(u);
    if (e.structural && !g.structural.includes(e.structural)) g.structural.push(e.structural);
    const k = sameKey(e.statement);
    let s = g.statements.find((x) => x.key === k);
    if (!s) {
      s = { key: k, text: e.statement, units: [] };
      g.statements.push(s);
    }
    for (const u of e.units) if (!s.units.includes(u)) s.units.push(u);
  }
  const list = Array.from(map.values());
  list.forEach((g) => g.units.sort((a, b) => Number(a) - Number(b)));
  list.forEach((g) => g.statements.forEach((s) => s.units.sort((a, b) => Number(a) - Number(b))));
  list.sort((a, b) => {
    const byB = byBuilding(a.building, b.building);
    if (byB !== 0) return byB;
    const fa = a.floor === null ? Number.MAX_SAFE_INTEGER : a.floor;
    const fb = b.floor === null ? Number.MAX_SAFE_INTEGER : b.floor;
    if (fa !== fb) return fa - fb;
    const byT = tradeRank(a.trade) - tradeRank(b.trade);
    if (byT !== 0) return byT;
    return a.item.localeCompare(b.item, "ko");
  });
  return list;
}

function placesOf(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!e.building && e.floor === null) continue;
    if (!map.has(e.building)) map.set(e.building, []);
    if (e.floor !== null && !map.get(e.building).includes(e.floor)) map.get(e.building).push(e.floor);
  }
  return Array.from(map.entries())
    .sort((a, b) => byBuilding(a[0], b[0]))
    .map(([building, floors]) => ({ building, floors: floors.slice().sort((x, y) => x - y) }));
}

function hazardsOf(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (!e.hazard) continue;
    const place = [placeLabel(e), joinUnits(e.units)].filter(Boolean).join(" ");
    const k = sameKey(`${place}|${e.hazard}`);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ place, text: e.hazard });
  }
  return out;
}

// reports: 하루치 음성 기록(voiceReports 문서들, id 포함). 반환: { total, entries, groups, places, workNames, hazards }
export function digestDay(reports) {
  const list = (Array.isArray(reports) ? reports : []).filter((r) => r && typeof r === "object");
  const entries = list
    .map(toEntry)
    .sort((a, b) => {
      const ta = Number.isFinite(a.ts) ? a.ts : 0;
      const tb = Number.isFinite(b.ts) ? b.ts : 0;
      return ta - tb || a.id.localeCompare(b.id);
    });
  const groups = groupEntries(entries);
  const workNames = [];
  for (const g of groups) {
    const name = g.item || g.tradeLabel;
    if (name && !workNames.includes(name)) workNames.push(name);
  }
  return { total: entries.length, entries, groups, places: placesOf(entries), workNames, hazards: hazardsOf(entries) };
}
