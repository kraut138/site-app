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
import { VOICE_TRADES, VOICE_LIMITS, clockString, defaultGlossary, sanitizeGlossary, checkTerm, convertVoiceText, buildSummary, glossaryHash, GLOSSARY_MESSAGES } from "./voice.js";
import { cleanImportEntries, planGlossaryImport, applyGlossaryImport } from "./glossaryImport.js";
import { SAMPLE_LIMITS, SAMPLE_MESSAGES, cleanSampleName, newSampleId, sanitizeSamples, sanitizeSegments, splitIntoChunks, joinChunks } from "./audioSamples.js";

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

// ---------------- 음성 검측 보고 (하도급사가 공종별로 말로 남기는 작업 보고) ----------------
// voiceReports/{id}: 시안(dashboard.html)이 쓰던 필드 이름(trade, author, zone, elem, time, rawText, summary, timestamp)을 그대로 따른다.
// 그래서 나중에 관리자 화면(대시보드)을 만들 때 이 컬렉션을 그대로 읽어 쓰면 된다.
//   trade: "frame" | "finish" | "mep"(관리자 '표준 공종' 탭의 분류: 골조공사·마감공사·설비/전기)   tradeItem: 고른 세부 공종("도배" 등 표준 항목 글, 안 골랐으면 "")
//   zone: "101동 3층"   elem: "C1 기둥"   via: "voice"(음성) | "text"(직접 입력)
//   rawText: 말한 그대로   normalized: 은어만 표준 용어로 바꾼 전체 문장(호실·진행도 계산이 읽는다)   summary: 공종별 요약 문장
//   dbText: '용어 DB에 있는 단어만 남기기'를 켜 둔 채 저장한 기록에만 있는 글(표에 있는 단어로만 이룬 문장, 단어가 없으면 ""). 화면의 '순화한 내용'과 요약은 이 글을 쓴다.
//           없는 기록(그 방식을 쓰기 전에 저장했거나 꺼 둔 채 저장한 기록)은 normalized를 쓴다.
//   fromUnit: 호실 QR 화면에서 다른 호실을 말해 그 호실의 기록으로 옮겨 저장했을 때만 있는 글. 말한 화면의 호실("101동 3층 301호").
//           이때 buildingId·buildingName·floor·zone·elem은 말한 호실의 것이다(그래서 그 호실의 '음성 기록'과 진행도에 그대로 쌓인다).
//   (공종을 철근·설비·형틀·품질 승인 중에서 고르던 때 저장된 기록은 trade가 "rebar"·"formwork"·"qc"(설비는 "mep")이고 tradeItem 항목이 없다 - 읽을 때 그대로 보여 준다)
const VOICE_SAVE_TIMEOUT_MS = 12000;

// 연결이 불안한 현장(지하 등)에서는 Firestore 쓰기가 에러 없이 한참 대기 상태로 남을 수 있다.
// 그 경우 화면이 "저장 중"에 멈춰 있지 않도록 시간 제한을 두고, 다시 보내도 중복되지 않게 문서 id를 미리 정해 둔다.
function withTimeout(promise, ms, code) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("시간이 너무 오래 걸립니다."), { code })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function newVoiceReportId() {
  return doc(collection(db, "voiceReports")).id;
}

export async function createVoiceReport(data) {
  const trade = String(data.trade || "");
  if (!VOICE_TRADES.some((t) => t.id === trade)) throw new Error("공종이 올바르지 않습니다.");
  const id = String(data.id || "");
  const zone = String(data.zone || "").trim();
  const elem = String(data.elem || "").trim().slice(0, VOICE_LIMITS.elem);
  const rawText = String(data.rawText || "").trim().slice(0, VOICE_LIMITS.rawText);
  if (!id || !zone || !elem || !rawText) throw new Error("위치(동·층·부재)와 내용은 필수입니다.");
  const now = new Date();
  const floor = Number(data.floor);
  const payload = {
    trade,
    tradeItem: String(data.tradeItem || "").trim().slice(0, VOICE_LIMITS.tradeItem),
    author: String(data.author || "").trim().slice(0, 60),
    buildingId: String(data.buildingId || ""),
    buildingName: String(data.buildingName || ""),
    floor: Number.isInteger(floor) ? floor : 0,
    zone,
    elem,
    time: clockString(now),
    rawText,
    normalized: String(data.normalized || ""),
    ...(typeof data.dbText === "string" ? { dbText: data.dbText } : {}),
    ...(typeof data.fromUnit === "string" && data.fromUnit.trim() ? { fromUnit: data.fromUnit.trim().slice(0, 60) } : {}),
    summary: String(data.summary || ""),
    via: data.via === "text" ? "text" : "voice",
    createdAt: now.toISOString(),
    timestamp: now.getTime(),
  };
  await withTimeout(setDoc(doc(db, "voiceReports", id), payload), VOICE_SAVE_TIMEOUT_MS, "voice/timeout");
  return { id, ...payload };
}

// 한 위치(동+층)의 보고를 최신순으로 가져온다. (인덱스 없이 쓰려고 정렬은 화면에서 한다)
export async function fetchVoiceReports(zone) {
  const snap = await getDocs(query(collection(db, "voiceReports"), where("zone", "==", zone)));
  return snapToArray(snap).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

// 한 동의 한 층에서 남긴 모든 음성 보고(최신순). 관리자 호실 정보 화면이 '음성 보고 진행도'를 계산하고 '음성 기록'을 보여 주는 데 쓴다.
// 동 id와 층 숫자의 같음 조건 두 개뿐이라 별도 색인 없이 조회된다. (동 이름을 나중에 고쳐도 id로 찾으므로 옛 보고가 빠지지 않는다)
const VOICE_FLOOR_READ_TIMEOUT_MS = 15000;

export async function fetchFloorVoiceReports(buildingId, floor) {
  const q = query(collection(db, "voiceReports"), where("buildingId", "==", String(buildingId || "")), where("floor", "==", Number(floor)));
  const snap = await withTimeout(getDocs(q), VOICE_FLOOR_READ_TIMEOUT_MS, "voice/timeout");
  return snapToArray(snap).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

// 관리자가 잘못 인식된 보고를 호실 진행도에서 빼거나(off=true) 다시 넣는다(off=false). 보고 자체(글·요약)는 그대로 남는다.
export async function setVoiceReportProgressOff(id, off, by) {
  const ref = doc(db, "voiceReports", String(id));
  const data = off
    ? { progressOff: true, progressOffBy: String(by || "").trim().slice(0, 60), progressOffAt: nowIso() }
    : { progressOff: false, progressOffBy: "", progressOffAt: "" };
  await withTimeout(updateDoc(ref, data), VOICE_SAVE_TIMEOUT_MS, "voice/timeout");
  return data;
}

// ---------------- 용어 DB (현장 은어 → 표준 용어) ----------------
// meta/glossary: { terms: [{ id, slang, standard }], onlyDb(용어 DB에 있는 단어만 남기는지 - 문서에 없으면 켜짐), updatedAt, updatedBy }
// 관리자 화면의 "용어 DB" 탭이 고치는 표이고, 음성 검측이 말한 내용을 표준 용어로 바꿀 때 이 표를 쓴다.
// onlyDb가 켜져 있으면 바꾼 결과에는 표에 있는 단어(은어는 표준 용어로 바꾼 것, 표준 용어를 직접 말한 것)만 남고 나머지 말은 빠진다(voice.js applyGlossaryOnly).
// 표 전체를 문서 1개에 넣어 둔다: 음성 검측 화면이 열릴 때마다 읽어도 1건만 읽으면 되고(무료 요금제의 읽기 한도 절약), 저장도 한 번에 끝난다.
// 이 문서가 아직 없으면(관리자가 표를 한 번도 고치지 않았으면) 코드에 들어 있는 기본 용어(voice.js의 SLANG_RULES)를 그대로 쓴다.
// 표를 고칠 때는 먼저 최신 표를 읽은 뒤 그 위에 한 줄만 바꿔서 저장한다(다른 관리자가 그 사이에 넣은 용어를 덮어쓰지 않도록).
const GLOSSARY_READ_TIMEOUT_MS = 6000;
const GLOSSARY_WRITE_TIMEOUT_MS = 12000;

function glossaryError(code) {
  return Object.assign(new Error(GLOSSARY_MESSAGES[code] || "용어를 저장하지 못했습니다."), { code: `glossary/${code}` });
}

function newGlossaryId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// 반환: { saved: 표가 한 번이라도 저장돼 있는지, terms: 표(저장된 적이 없으면 기본 용어), onlyDb: 용어 DB에 있는 단어만 남기는지(기본 켜짐) }
// 문서가 있어도 terms 목록이 없으면(변환 방식만 먼저 저장한 경우) 표는 아직 저장된 적이 없는 것으로 보고 기본 용어를 쓴다.
export async function fetchGlossary() {
  const snap = await withTimeout(getDoc(doc(db, "meta", "glossary")), GLOSSARY_READ_TIMEOUT_MS, "glossary/timeout");
  if (!snap.exists()) return { saved: false, terms: defaultGlossary(), onlyDb: true };
  const data = snap.data() || {};
  const onlyDb = data.onlyDb !== false;
  if (!Array.isArray(data.terms)) return { saved: false, terms: defaultGlossary(), onlyDb };
  return { saved: true, terms: sanitizeGlossary(data.terms), onlyDb };
}

// 표만 저장한다. merge로 써서 같은 문서의 변환 방식(onlyDb)은 그대로 둔다(표 목록은 통째로 바뀐다).
async function saveGlossary(terms, by) {
  await withTimeout(
    setDoc(doc(db, "meta", "glossary"), { terms, updatedAt: nowIso(), updatedBy: String(by || "").trim().slice(0, 60) }, { merge: true }),
    GLOSSARY_WRITE_TIMEOUT_MS,
    "glossary/timeout"
  );
  return terms;
}

// '용어 DB에 있는 단어만 남기기' 켜기/끄기. 표(terms)는 건드리지 않는다. 아직 표를 저장한 적이 없어도 되고(그때는 기본 용어가 계속 쓰인다),
// 저장하면 앞으로 남기는 보고부터 새 방식이 쓰인다(이미 저장된 기록은 '저장된 음성 기록에 다시 적용'으로 바꾼다). 반환: 저장된 값(true/false)
export async function setGlossaryOnlyDb(onlyDb, by) {
  const flag = onlyDb !== false;
  await withTimeout(
    setDoc(doc(db, "meta", "glossary"), { onlyDb: flag, updatedAt: nowIso(), updatedBy: String(by || "").trim().slice(0, 60) }, { merge: true }),
    GLOSSARY_WRITE_TIMEOUT_MS,
    "glossary/timeout"
  );
  return flag;
}

// 새 용어 한 줄 추가. 반환: { terms(저장된 최신 표), term(추가된 줄) }
export async function addGlossaryTerm({ slang, standard }, by) {
  const current = await fetchGlossary();
  const res = checkTerm({ slang, standard }, current.terms);
  if (res.code !== "ok") throw glossaryError(res.code);
  const term = { id: newGlossaryId(), slang: res.slang, standard: res.standard };
  const terms = await saveGlossary([...current.terms, term], by);
  return { terms, term };
}

// 한 줄 고치기. 그 사이 다른 관리자가 지운 줄이면 not-found를 던진다(화면은 목록을 새로 불러온다).
export async function updateGlossaryTerm(id, { slang, standard }, by) {
  const current = await fetchGlossary();
  if (!current.terms.some((t) => t.id === id)) throw glossaryError("not-found");
  const res = checkTerm({ slang, standard }, current.terms, id);
  if (res.code !== "ok") throw glossaryError(res.code);
  const terms = await saveGlossary(
    current.terms.map((t) => (t.id === id ? { id, slang: res.slang, standard: res.standard } : t)),
    by
  );
  return { terms };
}

export async function deleteGlossaryTerm(id, by) {
  const current = await fetchGlossary();
  if (!current.terms.some((t) => t.id === id)) throw glossaryError("not-found");
  const terms = await saveGlossary(
    current.terms.filter((t) => t.id !== id),
    by
  );
  return { terms };
}

// 엑셀·CSV에서 읽은 용어들을 한꺼번에 반영한다(glossaryImport.js가 줄을 읽고 견주는 방법을 정한다).
//   entries: parseTermRows가 받아들인 줄들, mode: "merge"(지금 표에 더하기) | "replace"(표 전체를 파일로 바꾸기)
// 다른 관리자가 그 사이에 표를 고쳤을 수 있어 여기서 최신 표를 다시 읽어 견준다(화면에 보인 미리보기와 숫자가 조금 다를 수 있다).
// 반환: { terms(저장된 최신 표), plan(실제로 반영한 내용), changed(표가 실제로 바뀌었는지) }. 바뀔 게 없으면 저장하지 않는다.
export async function importGlossaryTerms(entries, mode, by) {
  const current = await fetchGlossary();
  const plan = planGlossaryImport(cleanImportEntries(entries), current.terms, mode);
  if (plan.blocked) throw glossaryError(plan.blocked);
  if (plan.changes === 0) return { terms: current.terms, plan, changed: false };
  const terms = await saveGlossary(applyGlossaryImport(plan, current.terms, newGlossaryId), by);
  return { terms, plan, changed: true };
}

// ---------------- 음성 샘플 (용어 DB의 '음성 샘플로 인식 점검하기') ----------------
// 현장 은어·사투리를 녹음한 파일을 최대 5개까지 올려 두고, 관리자가 크롬이 그 녹음을 어떻게 듣는지 점검한다.
// meta/glossarySamples: { samples: [{ id, name, mime, size, duration, chunks, segments: [{ id, start, end, label }], by, at }], updatedAt, updatedBy }
//   - 녹음마다 말 구간(start~end 초)과, 관리자가 적은 정답(label = 그 구간에서 말한 표준 용어)을 함께 둔다.
// glossarySampleAudio/{녹음id}_{번호}: { sampleId, n, data } - 녹음 파일 내용을 문서 1개(최대 1MiB)에 들어갈 크기로 나눈 조각(data는 base64 글자)
// Storage 없이(무료 Spark 요금제 유지) Firestore만 쓰려고 파일을 조각으로 나눠 넣는다. 목록 문서에는 조각 수만 들어 있어서 목록을 읽을 때는 문서 1건만 읽고,
// 녹음을 열 때만 그 녹음의 조각들(파일당 최대 7건)을 읽는다.
const SAMPLE_READ_TIMEOUT_MS = 8000;
const SAMPLE_LIST_WRITE_TIMEOUT_MS = 12000;
const SAMPLE_CHUNK_TIMEOUT_MS = 30000;

function sampleError(code) {
  return Object.assign(new Error(SAMPLE_MESSAGES[code] || "녹음을 저장하지 못했습니다."), { code: `sample/${code}` });
}

function sampleChunkRef(sampleId, n) {
  return doc(db, "glossarySampleAudio", `${sampleId}_${n}`);
}

export async function fetchGlossarySamples() {
  const snap = await withTimeout(getDoc(doc(db, "meta", "glossarySamples")), SAMPLE_READ_TIMEOUT_MS, "sample/timeout");
  return { samples: snap.exists() ? sanitizeSamples(snap.data().samples) : [] };
}

async function saveSampleList(samples, by) {
  await withTimeout(
    setDoc(doc(db, "meta", "glossarySamples"), { samples, updatedAt: nowIso(), updatedBy: String(by || "").trim().slice(0, 60) }),
    SAMPLE_LIST_WRITE_TIMEOUT_MS,
    "sample/timeout"
  );
  return samples;
}

// 조각 문서를 지운다. 목록에 없는 조각은 어디에서도 쓰이지 않으므로, 지우지 못해도 화면에는 영향이 없다.
async function removeSampleChunks(sampleId, count) {
  try {
    const batch = writeBatch(db);
    for (let n = 0; n < count; n += 1) batch.delete(sampleChunkRef(sampleId, n));
    await withTimeout(batch.commit(), SAMPLE_CHUNK_TIMEOUT_MS, "sample/timeout");
  } catch {
    // 남은 조각은 그대로 둔다.
  }
}

// 녹음 하나를 저장한다. data: 파일 내용(ArrayBuffer 또는 Uint8Array), segments: 나눠 둔 말 구간.
// 조각을 먼저 모두 쓰고 마지막에 목록에 올리므로, 도중에 실패해도 목록에는 반쯤 올라간 녹음이 보이지 않는다(쓴 조각은 되도록 지운다).
// 반환: { samples(저장된 최신 목록), sample(올린 녹음) }
export async function addGlossarySample({ name, mime, data, duration, segments }, by) {
  const current = await fetchGlossarySamples();
  if (current.samples.length >= SAMPLE_LIMITS.maxFiles) throw sampleError("full");
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length === 0) throw sampleError("empty");
  if (bytes.length > SAMPLE_LIMITS.maxBytes) throw sampleError("too-big");
  const id = newSampleId();
  const parts = splitIntoChunks(bytes);
  try {
    for (let n = 0; n < parts.length; n += 1) {
      await withTimeout(setDoc(sampleChunkRef(id, n), { sampleId: id, n, data: parts[n] }), SAMPLE_CHUNK_TIMEOUT_MS, "sample/timeout");
    }
  } catch (err) {
    await removeSampleChunks(id, parts.length);
    throw err;
  }
  const sample = {
    id,
    name: cleanSampleName(name),
    mime: String(mime || "audio/mpeg"),
    size: bytes.length,
    duration: Math.round((Number(duration) || 0) * 10) / 10,
    chunks: parts.length,
    segments: sanitizeSegments(segments),
    by: String(by || "").trim().slice(0, 60),
    at: nowIso(),
  };
  try {
    // 조각을 쓰는 사이 다른 관리자가 목록을 바꿨을 수 있어 목록을 다시 읽고 그 위에 더한다
    const latest = await fetchGlossarySamples();
    if (latest.samples.length >= SAMPLE_LIMITS.maxFiles) throw sampleError("full");
    const samples = await saveSampleList([...latest.samples, sample], by);
    return { samples, sample };
  } catch (err) {
    // 저장이 느려 멈춘 경우는 실제로는 저장됐을 수 있어 조각을 남겨 둔다
    if (!(err && err.code === "sample/timeout")) await removeSampleChunks(id, parts.length);
    throw err;
  }
}

// 한 녹음의 말 구간(시작·끝·정답)을 저장한다. 그 사이 다른 관리자가 지운 녹음이면 sample/not-found를 던진다.
export async function saveGlossarySampleSegments(id, segments, by) {
  const current = await fetchGlossarySamples();
  if (!current.samples.some((s) => s.id === id)) throw sampleError("not-found");
  const cleaned = sanitizeSegments(segments);
  const samples = await saveSampleList(
    current.samples.map((s) => (s.id === id ? { ...s, segments: cleaned } : s)),
    by
  );
  return { samples };
}

export async function deleteGlossarySample(id, by) {
  const current = await fetchGlossarySamples();
  const target = current.samples.find((s) => s.id === id);
  if (!target) throw sampleError("not-found");
  const samples = await saveSampleList(
    current.samples.filter((s) => s.id !== id),
    by
  );
  await removeSampleChunks(id, target.chunks);
  return { samples };
}

// 녹음 파일 내용을 조각들에서 이어 붙여 읽어 온다(Uint8Array). 조각이 빠졌거나 크기가 맞지 않으면 sample/audio-missing.
export async function fetchGlossarySampleAudio(sample) {
  const reads = [];
  for (let n = 0; n < sample.chunks; n += 1) reads.push(withTimeout(getDoc(sampleChunkRef(sample.id, n)), SAMPLE_CHUNK_TIMEOUT_MS, "sample/timeout"));
  const snaps = await Promise.all(reads);
  const parts = snaps.map((s) => (s.exists() && typeof s.data().data === "string" ? s.data().data : null));
  if (parts.some((p) => p === null)) throw sampleError("audio-missing");
  const bytes = joinChunks(parts, sample.size);
  if (!bytes) throw sampleError("audio-missing");
  return bytes;
}

// ---------------- 저장된 음성 기록에 용어 표 다시 적용 ----------------
// 용어 표를 고치거나 변환 방식(용어 DB에 있는 단어만 남기기)을 바꾸면 앞으로 남기는 음성 보고만 새 표·새 방식으로 바뀐다.
// 이미 저장된 기록의 '바뀐 문장(normalized)'과 '용어 DB 단어만 남긴 글(dbText)', '요약(summary)'은 저장할 때의 표·방식대로 남아 있다.
// 그래서 원문(rawText: 말한 그대로, 건드리지 않는다)에 지금의 표와 방식을 다시 적용해 이 값들만 새로 만든다. 같은 표·방식으로 몇 번을 눌러도 결과는 같다.
// 두 단계로 나눴다: (1) planGlossaryReapply - 모든 기록을 읽어 무엇이 바뀔지 계산만 한다(쓰기 없음), (2) applyGlossaryReapply - 바뀔 기록만 한 번에 400건씩 묶어 쓴다.
// 미리보기와 적용 사이에 다른 관리자가 표를 또 고쳤다면 적용하지 않고 미리보기를 다시 하게 한다(보여 준 것과 다른 결과가 저장되지 않도록).
// meta/glossaryApplied: { at, by, tableHash, onlyDb, total, changed } - 마지막으로 다시 적용한 기록(화면에 '언제, 몇 건'을 보여 주고, tableHash로 그 뒤에 표나 변환 방식이 바뀌었는지 알려 준다.
// onlyDb는 그때의 변환 방식 - 이 값이 없는 기록은 은어만 바꾸던 때(false)에 적용한 것이다)
// tableHash는 표의 내용(은어·표준 용어·순서)과 변환 방식으로 만든 지문이다(voice.js glossaryHash). 표를 저장한 시각이 아니라 내용을 견주므로,
// 표를 고쳤다가 같은 내용으로 되돌려 놓았을 때는 '그대로'로 보이고, 화면은 표를 다시 읽지 않고도(이미 불러온 표로) 바뀐 여부를 알 수 있다.
const REAPPLY_READ_TIMEOUT_MS = 30000;
const REAPPLY_WRITE_TIMEOUT_MS = 30000;
const REAPPLY_BATCH = 400;

export async function planGlossaryReapply() {
  const current = await fetchGlossary();
  const snap = await withTimeout(getDocs(collection(db, "voiceReports")), REAPPLY_READ_TIMEOUT_MS, "voice/timeout");
  const changes = [];
  let total = 0;
  let noText = 0;
  snap.docs.forEach((d) => {
    const data = d.data();
    total += 1;
    const rawText = typeof data.rawText === "string" ? data.rawText : "";
    if (!rawText) {
      noText += 1;
      return;
    }
    const conv = convertVoiceText(rawText, current.terms, current.onlyDb);
    // tradeItem이 없는 기록은 세부 공종 칸이 없던 예전 기록이다 - buildSummary가 예전 문장 틀로 같은 요약을 만든다.
    const summary = buildSummary(String(data.trade || ""), conv.shown, typeof data.tradeItem === "string" ? data.tradeItem : undefined);
    const beforeFull = typeof data.normalized === "string" ? data.normalized : "";
    const beforeDb = typeof data.dbText === "string" ? data.dbText : null;
    if (conv.normalized === beforeFull && conv.dbText === beforeDb && summary === (typeof data.summary === "string" ? data.summary : "")) return;
    changes.push({
      id: d.id,
      timestamp: data.timestamp || 0,
      zone: String(data.zone || ""),
      elem: String(data.elem || ""),
      rawText,
      before: beforeDb !== null ? beforeDb : beforeFull, // 지금까지 화면에 '순화한 내용'으로 보이던 글
      after: conv.shown, // 새로 보일 글
      normalized: conv.normalized,
      dbText: conv.dbText, // 문자열(켜 둔 방식) 또는 null(끈 방식)
      hadDbText: beforeDb !== null,
      summary,
    });
  });
  changes.sort((a, b) => b.timestamp - a.timestamp);
  return { total, noText, changes, termCount: current.terms.length, onlyDb: current.onlyDb, tableHash: glossaryHash(current.terms, current.onlyDb), tableSaved: current.saved };
}

export async function fetchGlossaryApplied() {
  const snap = await withTimeout(getDoc(doc(db, "meta", "glossaryApplied")), GLOSSARY_READ_TIMEOUT_MS, "glossary/timeout");
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    at: typeof d.at === "string" ? d.at : "",
    by: typeof d.by === "string" ? d.by : "",
    tableHash: typeof d.tableHash === "string" ? d.tableHash : "",
    onlyDb: d.onlyDb === true,
    total: Number(d.total) || 0,
    changed: Number(d.changed) || 0,
  };
}

export async function recordGlossaryApplied({ tableHash, onlyDb, total, changed }, by) {
  const record = {
    at: nowIso(),
    by: String(by || "").trim().slice(0, 60),
    tableHash: String(tableHash || ""),
    onlyDb: onlyDb === true,
    total: Number(total) || 0,
    changed: Number(changed) || 0,
  };
  await withTimeout(setDoc(doc(db, "meta", "glossaryApplied"), record), GLOSSARY_WRITE_TIMEOUT_MS, "glossary/timeout");
  return record;
}

// opts: { onProgress({ done, total }), shouldStop() } - 묶음 하나를 쓸 때마다 진행을 알리고, 멈추라고 하면 다음 묶음부터 쓰지 않는다.
// 반환: { updated(바꾼 기록 수), missing(그 사이 지워져 건너뛴 수), stopped(중간에 멈췄는지), total(바꾸려던 기록 수) }
export async function applyGlossaryReapply(plan, by, opts = {}) {
  const changes = Array.isArray(plan && plan.changes) ? plan.changes : [];
  const now = await fetchGlossary();
  if (glossaryHash(now.terms, now.onlyDb) !== ((plan && plan.tableHash) || "")) throw glossaryError("table-changed");
  let updated = 0;
  let missing = 0;
  let stopped = false;
  // dbText는 켜 둔 방식이면 새 글을 쓰고, 끈 방식이면 예전에 있던 글만 지운다(null). 원래 없던 기록에는 필드를 만들지 않는다.
  const fields = (c) => ({ normalized: c.normalized, summary: c.summary, ...(c.dbText !== null && c.dbText !== undefined ? { dbText: c.dbText } : c.hadDbText ? { dbText: null } : {}) });
  for (let i = 0; i < changes.length; i += REAPPLY_BATCH) {
    if (opts.shouldStop && opts.shouldStop()) {
      stopped = true;
      break;
    }
    const chunk = changes.slice(i, i + REAPPLY_BATCH);
    try {
      const batch = writeBatch(db);
      chunk.forEach((c) => batch.update(doc(db, "voiceReports", c.id), fields(c)));
      await withTimeout(batch.commit(), REAPPLY_WRITE_TIMEOUT_MS, "voice/timeout");
      updated += chunk.length;
    } catch (err) {
      if (!err || err.code !== "not-found") throw err;
      // 읽은 뒤에 지워진 기록이 끼어 있으면 묶음 전체가 거절된다 - 하나씩 다시 쓰면서 지워진 것만 건너뛴다.
      for (const c of chunk) {
        try {
          await withTimeout(updateDoc(doc(db, "voiceReports", c.id), fields(c)), VOICE_SAVE_TIMEOUT_MS, "voice/timeout");
          updated += 1;
        } catch (err2) {
          if (err2 && err2.code === "not-found") missing += 1;
          else throw err2;
        }
      }
    }
    if (opts.onProgress) opts.onProgress({ done: Math.min(i + REAPPLY_BATCH, changes.length), total: changes.length });
  }
  if (!stopped) {
    try {
      await recordGlossaryApplied({ tableHash: plan.tableHash, onlyDb: plan.onlyDb === true, total: plan.total, changed: updated }, by);
    } catch {
      // 기록을 남기지 못해도 이미 바뀐 내용에는 영향이 없다.
    }
  }
  return { updated, missing, stopped, total: changes.length };
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
