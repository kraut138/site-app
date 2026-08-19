import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const STORE_NAME = "apt-inspection-data";

function dataStore() {
  return getStore(STORE_NAME);
}

async function getCollection(key: string): Promise<any[]> {
  const data = await dataStore().get(key, { type: "json" });
  return Array.isArray(data) ? data : [];
}

async function setCollection(key: string, value: any[]): Promise<void> {
  await dataStore().setJSON(key, value);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return randomUUID();
}

const DEFAULT_BUILDINGS = [
  { id: "bldg-101", name: "101동", floors: 20, unitsPerFloor: 4, createdAt: nowIso() },
  { id: "bldg-102", name: "102동", floors: 18, unitsPerFloor: 4, createdAt: nowIso() },
];

const DEFAULT_CHECKLIST_ITEMS = [
  { id: "frame-1", categoryId: "frame", text: "철근 배근 간격 및 규격 적정성" },
  { id: "frame-2", categoryId: "frame", text: "철근 이음 위치 및 정착 길이" },
  { id: "frame-3", categoryId: "frame", text: "거푸집 치수 및 수직·수평도" },
  { id: "frame-4", categoryId: "frame", text: "거푸집 조립 상태 및 지지대(동바리) 고정" },
  { id: "frame-5", categoryId: "frame", text: "콘크리트 타설 전 이물질 제거 상태" },
  { id: "frame-6", categoryId: "frame", text: "콘크리트 타설 및 다짐 상태" },
  { id: "frame-7", categoryId: "frame", text: "콘크리트 양생 관리(양생포·살수)" },
  { id: "finish-1", categoryId: "finish", text: "PL창호" },
  { id: "finish-2", categoryId: "finish", text: "단열재" },
  { id: "finish-3", categoryId: "finish", text: "견출" },
  { id: "finish-4", categoryId: "finish", text: "조적" },
  { id: "finish-5", categoryId: "finish", text: "경량틀" },
  { id: "finish-6", categoryId: "finish", text: "목창호" },
  { id: "finish-7", categoryId: "finish", text: "석고판" },
  { id: "finish-8", categoryId: "finish", text: "차음재" },
  { id: "finish-9", categoryId: "finish", text: "기포 콘크리트 타설" },
  { id: "finish-10", categoryId: "finish", text: "바닥 난방 코일" },
  { id: "finish-11", categoryId: "finish", text: "방통 타설" },
  { id: "finish-12", categoryId: "finish", text: "천정" },
  { id: "finish-13", categoryId: "finish", text: "가구" },
  { id: "finish-14", categoryId: "finish", text: "도배" },
  { id: "finish-15", categoryId: "finish", text: "바닥마감" },
  { id: "mep-1", categoryId: "mep", text: "급수·배수 배관 누수 압력 테스트" },
  { id: "mep-2", categoryId: "mep", text: "배관 구배 및 고정 상태" },
  { id: "mep-3", categoryId: "mep", text: "전기 간선 포설 경로 및 결속 상태" },
  { id: "mep-4", categoryId: "mep", text: "절연 저항 측정값 기준 충족 여부" },
  { id: "mep-5", categoryId: "mep", text: "분전반 결선 및 접지 상태" },
  { id: "safety-1", categoryId: "safety", text: "추락 방지시설(안전난간·개구부 덮개) 설치" },
  { id: "safety-2", categoryId: "safety", text: "가설 구조물(비계·동바리) 안전성" },
  { id: "safety-3", categoryId: "safety", text: "개인 보호구(안전모·안전대) 착용 여부" },
  { id: "safety-4", categoryId: "safety", text: "현장 정리정돈 및 자재 적치 상태" },
  { id: "safety-5", categoryId: "safety", text: "화기 작업 관리 및 소화기 비치 여부" },
];

export default async (req: Request, context: Context): Promise<Response> => {
  const url = new URL(req.url);
  const segments = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [resource, id] = segments;
  const method = req.method;

  try {
    // ---- bootstrap: single call to hydrate the whole app ----
    if (resource === "bootstrap" && method === "GET") {
      let buildings = await getCollection("buildings");
      if (buildings.length === 0) {
        buildings = DEFAULT_BUILDINGS;
        await setCollection("buildings", buildings);
      }
      let checklistItems = await getCollection("checklist-items");
      if (checklistItems.length === 0) {
        checklistItems = DEFAULT_CHECKLIST_ITEMS.map((i) => ({ ...i, createdAt: nowIso() }));
        await setCollection("checklist-items", checklistItems);
      }
      const [inspections, ncrs, siteSettings, unitNotes] = await Promise.all([
        getCollection("inspections"),
        getCollection("ncrs"),
        dataStore().get("site-settings", { type: "json" }),
        getCollection("unit-notes"),
      ]);
      return jsonResponse({ buildings, inspections, ncrs, siteSettings: siteSettings || {}, unitNotes, checklistItems });
    }

    // ---- buildings ----
    if (resource === "buildings") {
      if (method === "GET") {
        return jsonResponse(await getCollection("buildings"));
      }
      if (method === "POST") {
        const body = await req.json();
        if (!body.name || !body.floors || !body.unitsPerFloor) {
          return jsonResponse({ error: "name, floors, unitsPerFloor는 필수입니다." }, 400);
        }
        const list = await getCollection("buildings");
        const item = {
          id: newId(),
          name: String(body.name),
          floors: Number(body.floors),
          unitsPerFloor: Number(body.unitsPerFloor),
          createdAt: nowIso(),
        };
        list.push(item);
        await setCollection("buildings", list);
        return jsonResponse(item, 201);
      }
      if (method === "DELETE" && id) {
        const list = await getCollection("buildings");
        await setCollection("buildings", list.filter((b) => b.id !== id));
        return jsonResponse({ ok: true });
      }
      if (method === "PATCH" && id) {
        const body = await req.json();
        const list = await getCollection("buildings");
        const idx = list.findIndex((b) => b.id === id);
        if (idx === -1) return jsonResponse({ error: "동을 찾을 수 없습니다." }, 404);
        const updated = { ...list[idx] };
        if (body.name !== undefined) updated.name = String(body.name);
        if (body.floors !== undefined) updated.floors = Number(body.floors);
        if (body.unitsPerFloor !== undefined) updated.unitsPerFloor = Number(body.unitsPerFloor);
        if (body.siteX !== undefined) updated.siteX = body.siteX === null ? null : Number(body.siteX);
        if (body.siteY !== undefined) updated.siteY = body.siteY === null ? null : Number(body.siteY);
        if (body.footprint !== undefined) updated.footprint = Number(body.footprint);
        if (body.shape !== undefined) updated.shape = body.shape;
        list[idx] = updated;
        await setCollection("buildings", list);
        return jsonResponse(updated);
      }
    }

    // ---- inspection requests ----
    if (resource === "inspections") {
      if (method === "GET") {
        return jsonResponse(await getCollection("inspections"));
      }
      if (method === "POST") {
        const body = await req.json();
        const required = ["categoryId", "buildingId", "floor"];
        for (const field of required) {
          if (body[field] === undefined || body[field] === null || body[field] === "") {
            return jsonResponse({ error: `${field}는 필수입니다.` }, 400);
          }
        }
        const list = await getCollection("inspections");
        const item = {
          id: newId(),
          categoryId: body.categoryId,
          buildingId: body.buildingId,
          floor: body.floor,
          unit: body.unit || "",
          checkedItemIds: Array.isArray(body.checkedItemIds) ? body.checkedItemIds : [],
          photos: Array.isArray(body.photos) ? body.photos.slice(0, 3) : [],
          pin: body.pin || null,
          memo: body.memo || "",
          requestedBy: body.requestedBy || "하도급사 담당자",
          status: "대기",
          createdAt: nowIso(),
          history: [{ action: "제출", at: nowIso(), by: body.requestedBy || "하도급사 담당자" }],
        };
        list.push(item);
        await setCollection("inspections", list);
        return jsonResponse(item, 201);
      }
      if (method === "PATCH" && id) {
        const body = await req.json();
        const list = await getCollection("inspections");
        const idx = list.findIndex((i) => i.id === id);
        if (idx === -1) return jsonResponse({ error: "검측 요청을 찾을 수 없습니다." }, 404);
        if (!["승인", "반려"].includes(body.status)) {
          return jsonResponse({ error: "status는 승인 또는 반려여야 합니다." }, 400);
        }
        const updated = {
          ...list[idx],
          status: body.status,
          approver: body.approver || "감리단",
          history: [
            ...(list[idx].history || []),
            { action: body.status, at: nowIso(), by: body.approver || "감리단", comment: body.comment || "" },
          ],
        };
        list[idx] = updated;
        await setCollection("inspections", list);

        if (body.status === "반려") {
          const ncrs = await getCollection("ncrs");
          const ncr = {
            id: newId(),
            inspectionId: updated.id,
            categoryId: updated.categoryId,
            buildingId: updated.buildingId,
            floor: updated.floor,
            unit: updated.unit,
            photos: updated.photos,
            pin: updated.pin,
            description: body.comment || "검측 불합격",
            assignedTo: updated.requestedBy,
            status: "발생",
            createdAt: nowIso(),
            history: [{ action: "발생", at: nowIso(), by: body.approver || "감리단" }],
          };
          ncrs.push(ncr);
          await setCollection("ncrs", ncrs);
          return jsonResponse({ inspection: updated, ncr });
        }

        return jsonResponse({ inspection: updated });
      }
    }

    // ---- NCRs ----
    if (resource === "ncrs") {
      if (method === "GET") {
        return jsonResponse(await getCollection("ncrs"));
      }
      if (method === "PATCH" && id) {
        const body = await req.json();
        const allowed = ["조치중", "재검측요청", "완료"];
        if (!allowed.includes(body.status)) {
          return jsonResponse({ error: `status는 ${allowed.join("/")} 중 하나여야 합니다.` }, 400);
        }
        const list = await getCollection("ncrs");
        const idx = list.findIndex((n) => n.id === id);
        if (idx === -1) return jsonResponse({ error: "NCR을 찾을 수 없습니다." }, 404);
        const updated = {
          ...list[idx],
          status: body.status,
          history: [
            ...(list[idx].history || []),
            { action: body.status, at: nowIso(), by: body.by || "", comment: body.comment || "" },
          ],
        };
        if (body.status === "재검측요청" && Array.isArray(body.photos) && body.photos.length) {
          updated.actionPhotos = body.photos.slice(0, 3);
        }
        list[idx] = updated;
        await setCollection("ncrs", list);
        return jsonResponse(updated);
      }
    }

    // ---- site settings (site-wide layout background image, etc.) ----
    if (resource === "sitesettings") {
      if (method === "GET") {
        const s = await dataStore().get("site-settings", { type: "json" });
        return jsonResponse(s || {});
      }
      if (method === "PATCH") {
        const body = await req.json();
        const current = (await dataStore().get("site-settings", { type: "json" })) || {};
        const updated = { ...current, ...body };
        await dataStore().setJSON("site-settings", updated);
        return jsonResponse(updated);
      }
    }

    // ---- unit notes (호실별 특이사항) ----
    if (resource === "unitnotes") {
      if (method === "GET") {
        return jsonResponse(await getCollection("unit-notes"));
      }
      if (method === "POST") {
        const body = await req.json();
        const required = ["buildingId", "floor", "unit", "text"];
        for (const field of required) {
          if (body[field] === undefined || body[field] === null || body[field] === "") {
            return jsonResponse({ error: `${field}는 필수입니다.` }, 400);
          }
        }
        const list = await getCollection("unit-notes");
        const item = {
          id: newId(),
          buildingId: body.buildingId,
          floor: body.floor,
          unit: body.unit,
          text: String(body.text),
          author: body.author || "감리단",
          createdAt: nowIso(),
        };
        list.push(item);
        await setCollection("unit-notes", list);
        return jsonResponse(item, 201);
      }
      if (method === "DELETE" && id) {
        const list = await getCollection("unit-notes");
        await setCollection("unit-notes", list.filter((n) => n.id !== id));
        return jsonResponse({ ok: true });
      }
    }

    // ---- checklist items (감리단이 표준 체크리스트 항목을 추가/삭제) ----
    if (resource === "checklistitems") {
      if (method === "GET") {
        return jsonResponse(await getCollection("checklist-items"));
      }
      if (method === "POST" && id === "reset") {
        const body = await req.json();
        if (!body.categoryId || !Array.isArray(body.items)) {
          return jsonResponse({ error: "categoryId, items(배열)는 필수입니다." }, 400);
        }
        let list = await getCollection("checklist-items");
        list = list.filter((i) => i.categoryId !== body.categoryId);
        const newItems = body.items
          .map((t: unknown) => String(t).trim())
          .filter((t: string) => t.length > 0)
          .map((text: string) => ({ id: newId(), categoryId: body.categoryId, text, createdAt: nowIso() }));
        list = [...list, ...newItems];
        await setCollection("checklist-items", list);
        return jsonResponse(newItems, 201);
      }
      if (method === "POST") {
        const body = await req.json();
        if (!body.categoryId || !body.text) {
          return jsonResponse({ error: "categoryId, text는 필수입니다." }, 400);
        }
        const list = await getCollection("checklist-items");
        const item = {
          id: newId(),
          categoryId: body.categoryId,
          text: String(body.text),
          createdAt: nowIso(),
        };
        list.push(item);
        await setCollection("checklist-items", list);
        return jsonResponse(item, 201);
      }
      if (method === "DELETE" && id) {
        const list = await getCollection("checklist-items");
        await setCollection("checklist-items", list.filter((i) => i.id !== id));
        return jsonResponse({ ok: true });
      }
    }

    return jsonResponse({ error: "찾을 수 없는 경로입니다." }, 404);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
