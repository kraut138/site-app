// QR 코드 링크 유틸리티.
//
// 1) 공종별 QR (지금 쓰는 QR): ?trade=<공종>. "1. 공종별 QR 생성소"에서 골조·마감·설비/전기 한 장씩 만든다.
//    스캔하면 로그인 없이 그 공종의 음성 보고 화면이 열리고, 위치는 말한 내용("101동 502호 도배 완료")에서 읽는다.
// 2) 호실 QR (예전 QR): ?b=<동 id>&f=<층>&u=<호>[&t=<공종>]. 더 이상 만들지 않지만, 이미 인쇄해 붙인 QR이 계속 열리도록 읽는 기능은 남겨 둔다.
//    이 앱이 로드되자마자 App.jsx가 파라미터를 읽어 그 호실의 화면으로 바로 이동시킨다.
//    파라미터 이름은 짧게(b/f/u/t) 두었다 - QR에 담기는 주소가 짧을수록 코드 패턴이 단순해져 스캔이 더 잘 된다.
//    t(공종)는 스캔했을 때 음성 검측의 공종이 미리 골라지게 한다(frame·finish·mep). 없거나 알 수 없는 값이면 고르지 않은 상태로 열린다.
export const QR_TRADE_IDS = ["frame", "finish", "mep"];

// 공종별 QR에 담는 주소. 현재 페이지 주소(사이트 첫 주소)에 ?trade=<공종>만 붙인다. 모르는 공종이면 빈 글자.
export function buildTradeLink(trade) {
  if (!QR_TRADE_IDS.includes(trade)) return "";
  return `${window.location.origin}${window.location.pathname}?trade=${trade}`;
}

// 현재 주소에서 공종별 QR의 공종(frame·finish·mep)을 읽는다. 없거나 알 수 없는 값이면 null.
// 주소를 지우지 않는다 - 새로고침하거나 홈 화면에 추가해 두어도 같은 공종 화면이 열리도록.
export function readTradeLink() {
  const t = new URLSearchParams(window.location.search).get("trade");
  return QR_TRADE_IDS.includes(t) ? t : null;
}

// 현재 페이지 URL에서 예전 호실 QR의 딥링크 파라미터를 읽는다. 없으면 null. 공종(t)이 올바르게 들어 있을 때만 trade가 붙는다.
export function readUnitDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const b = params.get("b");
  const f = params.get("f");
  const u = params.get("u");
  if (!b || !f || !u) return null;
  const t = params.get("t");
  const link = { buildingId: b, floor: Number(f), unit: u };
  if (QR_TRADE_IDS.includes(t)) link.trade = t;
  return link;
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
// 호실 QR(b/f/u)·공종별 QR(trade)과는 파라미터 이름이 달라 서로 영향을 주지 않는다.

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
