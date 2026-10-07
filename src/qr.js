// 호실 QR 코드 딥링크 유틸리티.
// URL에 동/층/호를 쿼리 파라미터로 담아두면, 카메라로 QR을 스캔했을 때
// 이 앱이 로드되자마자 App.jsx가 해당 파라미터를 읽어 호실 정보 화면으로 바로 이동시킨다.

// 쿼리 파라미터 이름은 짧게(b/f/u) 유지 - QR 코드에 담기는 URL이 짧을수록
// 코드 패턴이 단순해져 스캔이 더 잘 되고 인쇄 크기도 작아진다.
export function buildUnitDeepLink(buildingId, floor, unit) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({ b: buildingId, f: String(floor), u: unit });
  return `${base}?${params.toString()}`;
}

// 현재 페이지 URL에서 딥링크 파라미터를 읽는다. 없으면 null.
export function readUnitDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const b = params.get("b");
  const f = params.get("f");
  const u = params.get("u");
  if (!b || !f || !u) return null;
  return { buildingId: b, floor: Number(f), unit: u };
}

// 딥링크로 진입한 경우, 주소창에 파라미터가 계속 남아있으면 이후 새로고침 시에도
// 계속 같은 호실로 튕기므로, 한 번 읽은 뒤에는 주소를 깨끗하게 정리한다.
export function clearUnitDeepLinkFromUrl() {
  const clean = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState(null, "", clean);
}

// ---------------- QR 기록판 (관리자가 만든 "임의의 QR 코드") ----------------
// 관리자가 "QR코드" 탭에서 만든 QR에는 ?qr=<코드> 링크가 담긴다. 스캔한 사람은 로그인 없이
// 메모·사진·음성을 남기고, 같은 QR을 스캔한 다른 사람도 남겨진 기록을 볼 수 있다.
// 호실 QR(b/f/u)과는 파라미터 이름이 달라 서로 영향을 주지 않는다.

// 사진·음성은 Storage 없이 base64 문자열로 Firestore 문서에 직접 저장한다(문서 1개당 1MiB 제한).
// 그래서 올리기 전에 용량을 줄이고, 아래 한도를 넘으면 저장하지 않는다.
export const QR_LIMITS = {
  titleMax: 60,
  noteMax: 200,
  authorMax: 40,
  textMax: 2000,
  audioMaxSec: 60, // 한 번에 녹음할 수 있는 최대 길이(초)
  audioBitsPerSecond: 24000, // 음성은 낮은 비트레이트로 녹음해 용량을 줄인다(1분 ≈ 180KB)
  audioMaxRawBytes: 450000, // 녹음 원본 최대 용량(base64로 바꾸면 약 600KB)
  imageMaxChars: 330000, // 사진(base64 문자열) 최대 길이
  mediaDocMaxChars: 960000, // 사진+음성을 한 문서에 담을 수 있는 한도(문서 1MiB 제한보다 조금 작게)
};

// 코드는 헷갈리는 글자(0/o, 1/l/i)를 뺀 10글자 - 짧을수록 QR 패턴이 단순해져 스캔이 잘 된다.
const QR_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const QR_ID_LENGTH = 10;

export function newQrBoardId() {
  const bytes = new Uint8Array(QR_ID_LENGTH);
  window.crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += QR_ID_ALPHABET[b % QR_ID_ALPHABET.length];
  return id;
}

// Firestore 문서 id로 그대로 쓰므로, 주소창에 들어온 값은 이 형태일 때만 허용한다(경로 조작 방지).
export function isValidQrBoardId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(id);
}

export function buildQrBoardLink(id) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?qr=${encodeURIComponent(id)}`;
}

// 현재 주소에서 QR 기록판 코드를 읽는다. 없으면 null.
// 호실 QR과 달리 주소를 지우지 않는다 - 새로고침해도 같은 기록판에 머물러야 하기 때문이다.
export function readQrBoardLink() {
  const id = new URLSearchParams(window.location.search).get("qr");
  return id ? id : null;
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
