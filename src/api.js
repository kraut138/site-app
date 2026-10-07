import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  writeBatch,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase.js";
import { QR_LIMITS, newQrBoardId, isValidQrBoardId } from "./qr.js";

function nowIso() {
  return new Date().toISOString();
}

function snapToArray(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Storage 없이(무료 Spark 요금제 유지) 압축된 base64 사진을 그대로 최대 3장까지 저장한다.
function capPhotos(photos) {
  if (!photos || photos.length === 0) return [];
  return photos.slice(0, 3);
}

// ---------------- bootstrap / seed ----------------

const DEFAULT_BUILDINGS = [
  { id: "bldg-101", name: "101동", floors: 20, unitsPerFloor: 4 },
  { id: "bldg-102", name: "102동", floors: 18, unitsPerFloor: 4 },
];

const DEFAULT_CHECKLIST_ITEMS = [
  { id: "frame-1", categoryId: "frame", text: "철근 배근 간격 및 규격 적정성", order: 0 },
  { id: "frame-2", categoryId: "frame", text: "철근 이음 위치 및 정착 길이", order: 1 },
  { id: "frame-3", categoryId: "frame", text: "거푸집 치수 및 수직·수평도", order: 2 },
  { id: "frame-4", categoryId: "frame", text: "거푸집 조립 상태 및 지지대(동바리) 고정", order: 3 },
  { id: "frame-5", categoryId: "frame", text: "콘크리트 타설 전 이물질 제거 상태", order: 4 },
  { id: "frame-6", categoryId: "frame", text: "콘크리트 타설 및 다짐 상태", order: 5 },
  { id: "frame-7", categoryId: "frame", text: "콘크리트 양생 관리(양생포·살수)", order: 6 },
  { id: "finish-1", categoryId: "finish", text: "PL창호", order: 0 },
  { id: "finish-2", categoryId: "finish", text: "단열재", order: 1 },
  { id: "finish-3", categoryId: "finish", text: "견출", order: 2 },
  { id: "finish-4", categoryId: "finish", text: "조적", order: 3 },
  { id: "finish-5", categoryId: "finish", text: "경량틀", order: 4 },
  { id: "finish-6", categoryId: "finish", text: "목창호", order: 5 },
  { id: "finish-7", categoryId: "finish", text: "석고판", order: 6 },
  { id: "finish-8", categoryId: "finish", text: "차음재", order: 7 },
  { id: "finish-9", categoryId: "finish", text: "기포 콘크리트 타설", order: 8 },
  { id: "finish-10", categoryId: "finish", text: "바닥 난방 코일", order: 9 },
  { id: "finish-11", categoryId: "finish", text: "방통 타설", order: 10 },
  { id: "finish-12", categoryId: "finish", text: "천정", order: 11 },
  { id: "finish-13", categoryId: "finish", text: "가구", order: 12 },
  { id: "finish-14", categoryId: "finish", text: "도배", order: 13 },
  { id: "finish-15", categoryId: "finish", text: "바닥마감", order: 14 },
  { id: "mep-1", categoryId: "mep", text: "급수·배수 배관 누수 압력 테스트", order: 0 },
  { id: "mep-2", categoryId: "mep", text: "배관 구배 및 고정 상태", order: 1 },
  { id: "mep-3", categoryId: "mep", text: "전기 간선 포설 경로 및 결속 상태", order: 2 },
  { id: "mep-4", categoryId: "mep", text: "절연 저항 측정값 기준 충족 여부", order: 3 },
  { id: "mep-5", categoryId: "mep", text: "분전반 결선 및 접지 상태", order: 4 },
  { id: "safety-1", categoryId: "safety", text: "추락 방지시설(안전난간·개구부 덮개) 설치", order: 0 },
  { id: "safety-2", categoryId: "safety", text: "가설 구조물(비계·동바리) 안전성", order: 1 },
  { id: "safety-3", categoryId: "safety", text: "개인 보호구(안전모·안전대) 착용 여부", order: 2 },
  { id: "safety-4", categoryId: "safety", text: "현장 정리정돈 및 자재 적치 상태", order: 3 },
  { id: "safety-5", categoryId: "safety", text: "화기 작업 관리 및 소화기 비치 여부", order: 4 },
];

// 문서 id를 명시적으로 지정해 setDoc으로 씨딩하므로, 여러 사용자가 동시에 처음 접속해도
// 같은 내용을 같은 id에 덮어쓸 뿐이라 안전하다(중복 생성되지 않음).
async function ensureSeeded() {
  const buildingsSnap = await getDocs(collection(db, "buildings"));
  if (buildingsSnap.empty) {
    const batch = writeBatch(db);
    DEFAULT_BUILDINGS.forEach(({ id, ...rest }) => {
      batch.set(doc(db, "buildings", id), { ...rest, createdAt: nowIso() });
    });
    await batch.commit();
  }
  const itemsSnap = await getDocs(collection(db, "checklistItems"));
  if (itemsSnap.empty) {
    const batch = writeBatch(db);
    DEFAULT_CHECKLIST_ITEMS.forEach(({ id, ...rest }) => {
      batch.set(doc(db, "checklistItems", id), { ...rest, createdAt: nowIso() });
    });
    await batch.commit();
  }
}

export async function fetchBootstrap() {
  await ensureSeeded();
  const [buildingsSnap, inspectionsSnap, ncrsSnap, unitNotesSnap, checklistItemsSnap, workersSnap, siteSettingsSnap, unitFloorPlansSnap, equipmentSnap] = await Promise.all([
    getDocs(collection(db, "buildings")),
    getDocs(collection(db, "inspections")),
    getDocs(collection(db, "ncrs")),
    getDocs(collection(db, "unitNotes")),
    getDocs(collection(db, "checklistItems")),
    getDocs(collection(db, "workers")),
    getDoc(doc(db, "meta", "siteSettings")),
    getDocs(collection(db, "unitFloorPlans")),
    getDocs(collection(db, "equipment")),
  ]);
  return {
    buildings: snapToArray(buildingsSnap),
    inspections: snapToArray(inspectionsSnap),
    ncrs: snapToArray(ncrsSnap),
    unitNotes: snapToArray(unitNotesSnap),
    checklistItems: snapToArray(checklistItemsSnap),
    workers: snapToArray(workersSnap),
    siteSettings: siteSettingsSnap.exists() ? siteSettingsSnap.data() : {},
    unitFloorPlans: snapToArray(unitFloorPlansSnap),
    equipment: snapToArray(equipmentSnap),
  };
}

// ---------------- buildings ----------------

export async function createBuilding(data) {
  if (!data.name || !data.floors || !data.unitsPerFloor) {
    throw new Error("name, floors, unitsPerFloor는 필수입니다.");
  }
  const payload = {
    name: String(data.name),
    floors: Number(data.floors),
    unitsPerFloor: Number(data.unitsPerFloor),
    createdAt: nowIso(),
  };
  const docRef = await addDoc(collection(db, "buildings"), payload);
  return { id: docRef.id, ...payload };
}

export async function deleteBuilding(id) {
  await deleteDoc(doc(db, "buildings", id));
  return { ok: true };
}

export async function updateBuilding(id, data) {
  const updates = {};
  if (data.name !== undefined) updates.name = String(data.name);
  if (data.floors !== undefined) updates.floors = Number(data.floors);
  if (data.unitsPerFloor !== undefined) updates.unitsPerFloor = Number(data.unitsPerFloor);
  if (data.siteX !== undefined) updates.siteX = data.siteX === null ? null : Number(data.siteX);
  if (data.siteY !== undefined) updates.siteY = data.siteY === null ? null : Number(data.siteY);
  if (data.footprint !== undefined) updates.footprint = Number(data.footprint);
  if (data.shape !== undefined) updates.shape = data.shape;
  await updateDoc(doc(db, "buildings", id), updates);
  const snap = await getDoc(doc(db, "buildings", id));
  return { id: snap.id, ...snap.data() };
}

// ---------------- site settings ----------------

export async function fetchSiteSettings() {
  const snap = await getDoc(doc(db, "meta", "siteSettings"));
  return snap.exists() ? snap.data() : {};
}

export async function updateSiteSettings(data) {
  await setDoc(doc(db, "meta", "siteSettings"), data, { merge: true });
  const snap = await getDoc(doc(db, "meta", "siteSettings"));
  return snap.data();
}

// 호실 내부 평면도(DXF) - 동 하나에 여러 개(호수 타입별)를 등록할 수 있다.
// data: { buildingId, name, units: string[], shapes, bounds, truncated }
export async function createUnitFloorPlan(data) {
  if (!data.buildingId || !Array.isArray(data.units) || data.units.length === 0) {
    throw new Error("buildingId, units(1개 이상)는 필수입니다.");
  }
  const payload = {
    buildingId: data.buildingId,
    name: data.name || "",
    units: data.units,
    shapes: data.shapes,
    bounds: data.bounds,
    truncated: !!data.truncated,
    createdAt: nowIso(),
  };
  const docRef = await addDoc(collection(db, "unitFloorPlans"), payload);
  return { id: docRef.id, ...payload };
}

export async function updateUnitFloorPlan(id, data) {
  const updates = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.units !== undefined) updates.units = data.units;
  if (data.shapes !== undefined) updates.shapes = data.shapes;
  if (data.bounds !== undefined) updates.bounds = data.bounds;
  if (data.truncated !== undefined) updates.truncated = !!data.truncated;
  await updateDoc(doc(db, "unitFloorPlans", id), updates);
  const snap = await getDoc(doc(db, "unitFloorPlans", id));
  return { id: snap.id, ...snap.data() };
}

export async function deleteUnitFloorPlan(id) {
  await deleteDoc(doc(db, "unitFloorPlans", id));
  return { ok: true };
}

// ---------------- unit notes ----------------

export async function createUnitNote(data) {
  const required = ["buildingId", "floor", "unit", "text"];
  for (const f of required) {
    if (data[f] === undefined || data[f] === null || data[f] === "") {
      throw new Error(`${f}는 필수입니다.`);
    }
  }
  const payload = {
    buildingId: data.buildingId,
    floor: data.floor,
    unit: data.unit,
    text: String(data.text),
    author: data.author || "감리단",
    createdAt: nowIso(),
  };
  if (data.pin) {
    payload.pin = { x: data.pin.x, y: data.pin.y };
    payload.pinColor = data.pinColor || "#17456f";
  }
  const docRef = await addDoc(collection(db, "unitNotes"), payload);
  return { id: docRef.id, ...payload };
}

export async function deleteUnitNote(id) {
  await deleteDoc(doc(db, "unitNotes", id));
  return { ok: true };
}

// ---------------- checklist items ----------------

export async function createChecklistItem(data) {
  if (!data.categoryId || !data.text) {
    throw new Error("categoryId, text는 필수입니다.");
  }
  const existingSnap = await getDocs(query(collection(db, "checklistItems"), where("categoryId", "==", data.categoryId)));
  const maxOrder = existingSnap.docs.reduce((max, d) => Math.max(max, d.data().order ?? -1), -1);
  const payload = { categoryId: data.categoryId, text: String(data.text), order: maxOrder + 1, createdAt: nowIso() };
  const docRef = await addDoc(collection(db, "checklistItems"), payload);
  return { id: docRef.id, ...payload };
}

export async function deleteChecklistItem(id) {
  await deleteDoc(doc(db, "checklistItems", id));
  return { ok: true };
}

export async function resetChecklistCategory(categoryId, items) {
  if (!categoryId || !Array.isArray(items)) {
    throw new Error("categoryId, items(배열)는 필수입니다.");
  }
  const existingSnap = await getDocs(query(collection(db, "checklistItems"), where("categoryId", "==", categoryId)));
  const batch = writeBatch(db);
  existingSnap.docs.forEach((d) => batch.delete(d.ref));
  const cleanTexts = items.map((t) => String(t).trim()).filter((t) => t.length > 0);
  const created = cleanTexts.map((text, order) => {
    const newRef = doc(collection(db, "checklistItems"));
    batch.set(newRef, { categoryId, text, order, createdAt: nowIso() });
    return { id: newRef.id, categoryId, text, order, createdAt: nowIso() };
  });
  await batch.commit();
  return created;
}

// 드래그로 바꾼 새 순서를 그대로 저장 - orderedIds는 그 공종의 전체 항목 id를 원하는 순서대로 나열한 배열
export async function reorderChecklistItems(categoryId, orderedIds) {
  if (!categoryId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error("categoryId, orderedIds(배열)는 필수입니다.");
  }
  const batch = writeBatch(db);
  orderedIds.forEach((id, order) => {
    batch.update(doc(db, "checklistItems", id), { order });
  });
  await batch.commit();
  return orderedIds.map((id, order) => ({ id, order }));
}

// ---------------- inspections ----------------

export async function createInspection(data) {
  const required = ["categoryId", "buildingId", "floor"];
  for (const f of required) {
    if (data[f] === undefined || data[f] === null || data[f] === "") {
      throw new Error(`${f}는 필수입니다.`);
    }
  }
  const photos = capPhotos(data.photos);
  const payload = {
    categoryId: data.categoryId,
    buildingId: data.buildingId,
    floor: data.floor,
    unit: data.unit || "",
    checkedItemIds: Array.isArray(data.checkedItemIds) ? data.checkedItemIds : [],
    photos,
    pin: data.pin || null,
    memo: data.memo || "",
    requestedBy: data.requestedBy || "하도급사 담당자",
    status: "대기",
    createdAt: nowIso(),
    history: [{ action: "제출", at: nowIso(), by: data.requestedBy || "하도급사 담당자" }],
  };
  const docRef = await addDoc(collection(db, "inspections"), payload);
  return { id: docRef.id, ...payload };
}

// 여러 호실을 한 번에 선택해 동일한 공종·확인 항목·사진으로 일괄 제출
// data: { categoryId, buildingId, units: [{floor, unit}], checkedItemIds, photos, pin, memo, requestedBy }
export async function createInspections(data) {
  if (!Array.isArray(data.units) || data.units.length === 0) {
    throw new Error("units(선택한 호실 목록)는 최소 1개 이상이어야 합니다.");
  }
  const photos = capPhotos(data.photos); // 여러 호실에 동일 사진을 재업로드하지 않도록 한 번만 처리
  return Promise.all(
    data.units.map((u) =>
      createInspection({
        categoryId: data.categoryId,
        buildingId: data.buildingId,
        floor: u.floor,
        unit: u.unit,
        checkedItemIds: data.checkedItemIds,
        photos,
        pin: data.pin,
        memo: data.memo,
        requestedBy: data.requestedBy,
      })
    )
  );
}

export async function updateInspectionStatus(id, data) {
  if (!["승인", "반려"].includes(data.status)) {
    throw new Error("status는 승인 또는 반려여야 합니다.");
  }
  const historyEntry = { action: data.status, at: nowIso(), by: data.approver || "감리단", comment: data.comment || "" };
  await updateDoc(doc(db, "inspections", id), {
    status: data.status,
    approver: data.approver || "감리단",
    history: arrayUnion(historyEntry),
  });
  const snap = await getDoc(doc(db, "inspections", id));
  const inspection = { id: snap.id, ...snap.data() };

  if (data.status === "반려") {
    const ncrPayload = {
      inspectionId: inspection.id,
      categoryId: inspection.categoryId,
      buildingId: inspection.buildingId,
      floor: inspection.floor,
      unit: inspection.unit,
      photos: inspection.photos,
      pin: inspection.pin,
      description: data.comment || "검측 불합격",
      assignedTo: inspection.requestedBy,
      status: "발생",
      createdAt: nowIso(),
      history: [{ action: "발생", at: nowIso(), by: data.approver || "감리단" }],
    };
    const ncrRef = await addDoc(collection(db, "ncrs"), ncrPayload);
    return { inspection, ncr: { id: ncrRef.id, ...ncrPayload } };
  }

  return { inspection };
}

// ---------------- NCRs ----------------

export async function updateNcrStatus(id, data) {
  const allowed = ["조치중", "재검측요청", "완료"];
  if (!allowed.includes(data.status)) {
    throw new Error(`status는 ${allowed.join("/")} 중 하나여야 합니다.`);
  }
  const updates = {
    status: data.status,
    history: arrayUnion({ action: data.status, at: nowIso(), by: data.by || "", comment: data.comment || "" }),
  };
  if (data.status === "재검측요청" && Array.isArray(data.photos) && data.photos.length) {
    updates.actionPhotos = capPhotos(data.photos);
  }
  await updateDoc(doc(db, "ncrs", id), updates);
  const snap = await getDoc(doc(db, "ncrs", id));
  return { id: snap.id, ...snap.data() };
}

// ---------------- workers ----------------

async function createWorker(data) {
  if (!data.companyName || !data.categoryId || !data.workerName) {
    throw new Error("companyName, categoryId, workerName은 필수입니다.");
  }
  const payload = {
    companyName: String(data.companyName).trim(),
    categoryId: data.categoryId,
    workerName: String(data.workerName).trim(),
    status: "대기",
    requestedBy: data.requestedBy || data.companyName,
    createdAt: nowIso(),
    history: [{ action: "등록", at: nowIso(), by: data.requestedBy || data.companyName }],
  };
  const docRef = await addDoc(collection(db, "workers"), payload);
  return { id: docRef.id, ...payload };
}

// data: { companyName, categoryId, names: string[] } - 이름별로 병렬 등록
export async function createWorkers({ companyName, categoryId, names }) {
  return Promise.all(names.map((workerName) => createWorker({ companyName, categoryId, workerName, requestedBy: companyName })));
}

export async function updateWorkerStatus(id, data) {
  if (!["승인", "반려", "퇴출"].includes(data.status)) {
    throw new Error("status는 승인, 반려, 퇴출 중 하나여야 합니다.");
  }
  await updateDoc(doc(db, "workers", id), {
    status: data.status,
    approver: data.approver || "감리단",
    history: arrayUnion({ action: data.status, at: nowIso(), by: data.approver || "감리단", comment: data.comment || "" }),
  });
  const snap = await getDoc(doc(db, "workers", id));
  return { id: snap.id, ...snap.data() };
}

// 인력 한 명에게 경고 카드를 부여한다. 3장이 누적되면 화면에서 퇴출 버튼이 활성화된다(그 판정 자체는
// 프론트에서 warnings 배열 길이로 계산하고, 여기서는 그냥 경고 이력만 쌓는다).
export async function addWorkerWarning(id, { reason, issuedBy }) {
  if (!reason || !reason.trim()) {
    throw new Error("경고 사유는 필수입니다.");
  }
  const warning = { reason: reason.trim(), issuedBy: issuedBy || "감리단", issuedAt: nowIso() };
  await updateDoc(doc(db, "workers", id), {
    warnings: arrayUnion(warning),
    history: arrayUnion({ action: "경고", at: nowIso(), by: issuedBy || "감리단", comment: reason.trim() }),
  });
  const snap = await getDoc(doc(db, "workers", id));
  return { id: snap.id, ...snap.data() };
}

// ---------------- 건설기계 등록 ----------------

export async function createEquipment(data) {
  if (!data.companyName || !data.registrantName || !data.equipmentName) {
    throw new Error("companyName, registrantName, equipmentName은 필수입니다.");
  }
  const payload = {
    companyName: String(data.companyName).trim(),
    registrantName: String(data.registrantName).trim(),
    equipmentName: String(data.equipmentName).trim(),
    imageDataUrl: data.imageDataUrl || null,
    status: "대기",
    createdAt: nowIso(),
    history: [{ action: "등록", at: nowIso(), by: data.registrantName }],
  };
  const docRef = await addDoc(collection(db, "equipment"), payload);
  return { id: docRef.id, ...payload };
}

export async function updateEquipmentStatus(id, data) {
  if (!["승인", "반려"].includes(data.status)) {
    throw new Error("status는 승인 또는 반려여야 합니다.");
  }
  await updateDoc(doc(db, "equipment", id), {
    status: data.status,
    approver: data.approver || "감리단",
    history: arrayUnion({ action: data.status, at: nowIso(), by: data.approver || "감리단", comment: data.comment || "" }),
  });
  const snap = await getDoc(doc(db, "equipment", id));
  return { id: snap.id, ...snap.data() };
}

// ---------------- QR 기록판 (임의 QR 코드 + 스캔한 사람이 남기는 메모·사진·음성) ----------------
// qrCodes/{id}   : { title, note, createdAt, createdBy }
// qrEntries/{id} : { qrId, author, text, hasImage, hasAudio, audioSec, thumb, createdAt }  <- 목록용(가벼움)
// qrMedia/{id}   : { qrId, image, audio }  <- 사진 원본·음성. 사진을 크게 보거나 음성을 재생할 때만 읽는다(id는 qrEntries와 같음)
// 목록에는 작은 미리보기(thumb)만 실어서, 기록이 많아져도 목록을 여는 데이터가 크게 늘지 않게 했다.

function newestFirst(a, b) {
  return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}

export async function createQrCode({ title, note, createdBy }) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) throw new Error("QR 코드 이름을 입력해주세요.");
  const payload = {
    title: cleanTitle.slice(0, QR_LIMITS.titleMax),
    note: String(note || "").trim().slice(0, QR_LIMITS.noteMax),
    createdAt: nowIso(),
    createdBy: createdBy || "",
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newQrBoardId();
    const ref = doc(db, "qrCodes", id);
    const existing = await getDoc(ref);
    if (existing.exists()) continue; // 10글자 무작위 코드라 사실상 겹치지 않지만, 겹치면 다시 뽑는다
    await setDoc(ref, payload);
    return { id, ...payload };
  }
  throw new Error("QR 코드를 만들지 못했습니다. 다시 시도해주세요.");
}

export async function updateQrCode(id, { title, note }) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) throw new Error("QR 코드 이름을 입력해주세요.");
  const patch = {
    title: cleanTitle.slice(0, QR_LIMITS.titleMax),
    note: String(note || "").trim().slice(0, QR_LIMITS.noteMax),
  };
  await updateDoc(doc(db, "qrCodes", id), patch);
  return patch;
}

// 관리자 탭용: 모든 QR 코드와 모든 기록(미리보기만, 사진 원본·음성 제외)
export async function fetchQrOverview() {
  const [codesSnap, entriesSnap] = await Promise.all([getDocs(collection(db, "qrCodes")), getDocs(collection(db, "qrEntries"))]);
  return { codes: snapToArray(codesSnap).sort(newestFirst), entries: snapToArray(entriesSnap).sort(newestFirst) };
}

// 스캔 화면용: QR 코드 1개와 그 QR에 남겨진 기록. QR 코드가 없으면 code가 null이다.
export async function fetchQrBoard(qrId) {
  if (!isValidQrBoardId(qrId)) return { code: null, entries: [] };
  const snap = await getDoc(doc(db, "qrCodes", qrId));
  if (!snap.exists()) return { code: null, entries: [] };
  const entriesSnap = await getDocs(query(collection(db, "qrEntries"), where("qrId", "==", qrId)));
  return { code: { id: snap.id, ...snap.data() }, entries: snapToArray(entriesSnap).sort(newestFirst) };
}

export async function createQrEntry({ qrId, author, text, image, thumb, audio, audioSec }) {
  if (!isValidQrBoardId(qrId)) throw new Error("잘못된 QR 코드입니다.");
  const cleanText = String(text || "").trim().slice(0, QR_LIMITS.textMax);
  if (!cleanText && !image && !audio) throw new Error("메모, 사진, 음성 중 하나 이상을 입력해주세요.");
  const mediaChars = (image ? image.length : 0) + (audio ? audio.length : 0);
  if (mediaChars > QR_LIMITS.mediaDocMaxChars) {
    const err = new Error("첨부 용량이 너무 큽니다.");
    err.code = "qr/too-large";
    throw err;
  }
  const meta = {
    qrId,
    author: String(author || "").trim().slice(0, QR_LIMITS.authorMax),
    text: cleanText,
    hasImage: !!image,
    hasAudio: !!audio,
    createdAt: nowIso(),
  };
  if (image) meta.thumb = thumb || "";
  if (audio) meta.audioSec = Math.max(0, Math.round(audioSec || 0));

  // 목록용 문서와 사진·음성 문서를 한 번에(둘 다 저장되거나 둘 다 안 되게) 저장한다.
  const entryRef = doc(collection(db, "qrEntries"));
  const batch = writeBatch(db);
  batch.set(entryRef, meta);
  if (image || audio) {
    const media = { qrId };
    if (image) media.image = image;
    if (audio) media.audio = audio;
    batch.set(doc(db, "qrMedia", entryRef.id), media);
  }
  await batch.commit();
  return { id: entryRef.id, ...meta };
}

export async function fetchQrMedia(entryId) {
  const snap = await getDoc(doc(db, "qrMedia", entryId));
  return snap.exists() ? snap.data() : null;
}

export async function deleteQrEntry(id) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "qrEntries", id));
  batch.delete(doc(db, "qrMedia", id));
  await batch.commit();
  return { ok: true };
}

// QR 코드를 지우면 그 QR에 남겨진 기록도 함께 지운다. 중간에 실패해도 다시 시도할 수 있도록 QR 코드 문서는 맨 마지막에 지운다.
export async function deleteQrCode(id) {
  const entriesSnap = await getDocs(query(collection(db, "qrEntries"), where("qrId", "==", id)));
  const entryIds = entriesSnap.docs.map((d) => d.id);
  for (let i = 0; i < entryIds.length; i += 200) {
    const batch = writeBatch(db);
    entryIds.slice(i, i + 200).forEach((entryId) => {
      batch.delete(doc(db, "qrEntries", entryId));
      batch.delete(doc(db, "qrMedia", entryId));
    });
    await batch.commit();
  }
  await deleteDoc(doc(db, "qrCodes", id));
  return { ok: true, removedEntries: entryIds.length };
}

// ---------------- image helper (변경 없음, 순수 클라이언트 로직) ----------------

// 브라우저에서 이미지를 리사이즈/압축하여 base64 데이터 URL로 변환
// (Storage 없이 Firestore 문서에 직접 저장하므로 문서당 1MB 제한을 고려해 기본값을 보수적으로 설정)
export function compressImage(file, maxSize = 900, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 처리할 수 없습니다."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
