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
