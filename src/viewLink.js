// 화면 바로가기 링크: 주소 끝에 화면 이름을 붙여서(…/app/#glossary) 열면, 앱이 열리고 로그인한 뒤 그 화면을 먼저 보여준다.
// 첫 화면(시안)의 "실제 앱 용어 DB 열기" 버튼이 이 주소를 쓴다. 로그인 전에는 로그인 화면이 먼저 나오고, 로그인하면 그 화면으로 간다.
//
// - 여기에 적어 둔 화면 이름만 받는다(엉뚱한 글자가 들어와도 빈 화면이 되지 않는다).
// - 그 화면을 볼 권한이 없는 역할로 로그인하면 App.jsx가 알아서 기본 화면(공사현황)으로 돌려보낸다.
// - 호실 QR(?b=&f=&u=)·QR 기록판(?qr=) 주소와는 따로 동작한다.
export const LINKABLE_VIEWS = ["glossary"];

// 주소 끝(#)의 화면 이름을 읽는다. 허용하는 이름이 아니면 null.
export function readViewLink() {
  try {
    const raw = String((typeof window !== "undefined" && window.location && window.location.hash) || "");
    const name = decodeURIComponent(raw.replace(/^#/, "")).trim();
    return LINKABLE_VIEWS.includes(name) ? name : null;
  } catch {
    return null;
  }
}

// 한 번 읽은 뒤에는 주소 끝을 지운다. 지우지 않으면 다른 화면을 보다가 새로고침했을 때 계속 그 화면으로 돌아가 버린다.
export function clearViewLinkFromUrl() {
  try {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  } catch {
    // 주소를 못 지워도 앱 동작에는 영향이 없다
  }
}
