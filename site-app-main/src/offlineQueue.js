// 통신이 끊긴 현장(지하주차장, 밀폐 공간 등)에서도 하도급사가 "공사 확인 요청"을
// 작성할 수 있게 하기 위한 오프라인 임시저장소.
//
// 동작 방식:
// 1. 요청을 서버(Firestore)로 보내려는데 기기가 오프라인이거나 전송이 네트워크 오류로 실패하면,
//    텍스트+사진(base64)을 스마트폰 "내부 저장소"인 IndexedDB에 그대로 저장해둔다.
// 2. 이후 인터넷(와이파이/데이터)이 다시 연결되면 App.jsx가 이를 감지해서
//    저장해둔 요청들을 순서대로 서버에 자동 전송(동기화)하고, 성공한 건 저장소에서 지운다.
//
// IndexedDB는 브라우저 표준 API라 별도 라이브러리 없이 오프라인에서도 항상 접근 가능하다.

const DB_NAME = "site-app-offline-db";
const DB_VERSION = 1;
const STORE = "pendingConfirmationRequests";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 기기/브라우저에서는 오프라인 저장을 지원하지 않습니다."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try {
      result = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// data: ConfirmationRequestForm이 onSubmit으로 넘기는 그 payload 그대로(categoryId, buildingId, units, photos 등)
export async function queueOfflineRequest(data) {
  const localId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const record = { localId, data, createdAt: new Date().toISOString(), attempts: 0, lastError: "" };
  await withStore("readwrite", (store) => reqToPromise(store.add(record)));
  return record;
}

export async function getQueuedRequests() {
  try {
    return await withStore("readonly", (store) => reqToPromise(store.getAll()));
  } catch {
    return [];
  }
}

export async function removeQueuedRequest(localId) {
  await withStore("readwrite", (store) => reqToPromise(store.delete(localId)));
}

export async function markQueuedRequestFailed(localId, errorMessage) {
  await withStore("readwrite", async (store) => {
    const existing = await reqToPromise(store.get(localId));
    if (!existing) return;
    existing.attempts = (existing.attempts || 0) + 1;
    existing.lastError = errorMessage || "";
    store.put(existing);
  });
}

export async function countQueuedRequests() {
  const items = await getQueuedRequests();
  return items.length;
}
