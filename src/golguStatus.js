// 골구도에서 호실마다 세부 공종 항목이 '완료'인지 판정한다. 완료로 치는 것은 두 가지다.
//   1) 감리단이 "공사 확인 요청"을 승인한 항목(inspections) - 기존 기준 그대로
//   2) 음성 보고로 "101동 502호 도배 완료"처럼 완료라고 말한 항목(unitVoiceDone, api.js) - 공종별 QR 등에서 말한 것
// 두 가지를 구분해서 알려 주고(approved | voice), 승인이 있으면 승인으로 본다.
// 기존 규칙: 마감·설비 공종은 그 호실의 골조공사가 다 끝나야 색으로 보여 준다(골조 없이 마감을 색칠하는 건 의미가 없다).
//   승인은 이 규칙을 그대로 따르고, 음성 보고로 말한 완료는 (일부러) 이 규칙을 건너뛰어 말한 그대로 보여 준다 - 현장에서 완료라고 보고한 것을 골구도에서 놓치지 않으려는 것이다.
//   골조가 끝났는지를 따질 때는 승인과 음성 완료를 합쳐서 본다.
import { itemsForCategory } from "./data.js";

// 호실 하나를 가리키는 키. 승인(inspections)과 음성 완료 양쪽에서 같은 모양을 쓴다(호수는 "02"처럼 두 자리 글자).
export function unitCellKey(buildingId, floor, unit) {
  return `${buildingId}~${String(floor)}~${unit}`;
}

// 승인된 항목을 호실마다 모은다: Map(키 → Set(항목 id)). 기준은 예전과 같다 - 상태가 "승인"인 요청이 확인한 항목.
export function approvedIndex(inspections) {
  const map = new Map();
  for (const i of Array.isArray(inspections) ? inspections : []) {
    if (!i || i.status !== "승인" || !Array.isArray(i.checkedItemIds)) continue;
    const key = unitCellKey(i.buildingId, i.floor, i.unit);
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    for (const id of i.checkedItemIds) set.add(id);
  }
  return map;
}

// 음성 완료 문서들(api.js subscribeUnitVoiceDone)을 호실마다 모은다: Map(키 → { [항목 id]: { at, by, report } })
export function voiceIndex(docs) {
  const map = new Map();
  for (const d of Array.isArray(docs) ? docs : []) {
    if (!d || !d.items || typeof d.items !== "object") continue;
    map.set(unitCellKey(d.buildingId, d.floor, d.unit), d.items);
  }
  return map;
}

// 골구도 한 화면(보고 있는 공종·항목)의 판정기를 만든다.
//   cell(buildingId, floor, unit, categoryId, itemId) → {
//     complete: 칠할지, kind: "approved" | "voice" | null(완료 아님), unfilled: 골조 대기(색 없음),
//     approvedItem: 이 항목이 승인됐는지(골조 규칙과 무관), voiceItem: 음성 완료가 있는지, voiceAt, voiceBy }
//   itemKind(buildingId, floor, unit, itemId) → "approved" | "voice" | null  (엑셀용: 골조 규칙 없이 항목만 본다)
//   frameDone(buildingId, floor, unit) → 골조공사 항목이 모두 승인 또는 음성 완료인지
export function createStatus({ checklistItems, inspections, voiceDocs }) {
  const approved = approvedIndex(inspections);
  const voice = voiceIndex(voiceDocs);
  const frameItems = itemsForCategory(checklistItems, "frame");
  const isApproved = (key, itemId) => {
    const set = approved.get(key);
    return !!set && set.has(itemId);
  };
  const voiceEntry = (key, itemId) => {
    const items = voice.get(key);
    return items && Object.prototype.hasOwnProperty.call(items, itemId) ? items[itemId] : null;
  };
  const frameDoneKey = (key) => frameItems.length === 0 || frameItems.every((it) => isApproved(key, it.id) || !!voiceEntry(key, it.id)); // 항목이 하나도 없으면 막을 대상이 없으므로 끝난 것으로 본다(기존 규칙)

  return {
    frameDone: (buildingId, floor, unit) => frameDoneKey(unitCellKey(buildingId, floor, unit)),
    itemKind: (buildingId, floor, unit, itemId) => {
      const key = unitCellKey(buildingId, floor, unit);
      if (isApproved(key, itemId)) return "approved";
      return voiceEntry(key, itemId) ? "voice" : null;
    },
    cell: (buildingId, floor, unit, categoryId, itemId) => {
      const key = unitCellKey(buildingId, floor, unit);
      const approvedItem = !!itemId && isApproved(key, itemId);
      const entry = itemId ? voiceEntry(key, itemId) : null;
      const gated = categoryId !== "frame" && !frameDoneKey(key);
      const kind = approvedItem && !gated ? "approved" : entry ? "voice" : null;
      return {
        complete: kind !== null,
        kind,
        unfilled: gated && kind === null,
        approvedItem,
        voiceItem: !!entry,
        voiceAt: entry ? entry.at || "" : "",
        voiceBy: entry ? entry.by || "" : "",
      };
    },
  };
}

// 음성 완료가 있는 호실 수(동·호수가 같은 문서가 둘 있을 수는 없으므로 문서 수와 같다)와 항목 수
export function voiceTotals(docs) {
  let units = 0;
  let items = 0;
  for (const d of Array.isArray(docs) ? docs : []) {
    const n = d && d.items && typeof d.items === "object" ? Object.keys(d.items).length : 0;
    if (n > 0) {
      units += 1;
      items += n;
    }
  }
  return { units, items };
}
