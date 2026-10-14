import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// ── 사이트 화면 구성 ─────────────────────────────────────────────────────────
//  · 첫 화면 (https://아이디.github.io/저장소이름/)      → 저장소 맨 위의 index.html
//  · 실제 앱 (https://아이디.github.io/저장소이름/app/)  → app/index.html (React 앱)
// 첫 화면에 보여줄 HTML을 바꾸려면, 새 HTML 파일의 이름을 index.html로 해서
// 저장소 맨 위(루트)의 index.html 자리에 덮어쓰면 됩니다. 이 파일은 건드릴 필요가 없습니다.
// ────────────────────────────────────────────────────────────────────────────
const page = (file) => fileURLToPath(new URL(file, import.meta.url));

// 예전에 만들어 둔 호실/기록판 QR 링크(…/저장소이름/?b=동&f=층&u=호, …/?qr=코드)는 첫 화면 주소를 가리킨다.
// 그런 링크로 들어오면 실제 앱(app/)으로 그대로 넘겨주도록, 첫 화면 맨 앞에 아래 코드를 빌드할 때 자동으로 끼워 넣는다.
// (빌드 때 넣기 때문에 index.html을 새 파일로 바꿔도 사라지지 않는다.)
const QR_FORWARD =
  'try{var q=new URLSearchParams(location.search);' +
  'if((q.get("b")&&q.get("f")&&q.get("u"))||q.get("qr"))' +
  'location.replace("app/"+location.search+location.hash)}catch(e){}';

function forwardQrLinks() {
  return {
    name: "forward-qr-links",
    transformIndexHtml(html, ctx) {
      if (ctx.path !== "/index.html") return undefined; // 첫 화면에만 적용 (app/index.html은 제외)
      return [{ tag: "script", children: QR_FORWARD, injectTo: "head-prepend" }];
    },
  };
}

// GitHub Pages는 프로젝트 저장소 이름을 하위 경로로 사용합니다(예: https://아이디.github.io/저장소이름/).
// GitHub Actions 워크플로우가 빌드 시 VITE_BASE_PATH를 저장소 이름으로 자동 설정해주므로
// 저장소 이름을 몰라도, 이름을 바꿔도 항상 올바르게 동작합니다.
export default defineConfig({
  plugins: [react(), forwardQrLinks()],
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    outDir: "dist",
    rollupOptions: {
      // 화면(HTML) 두 개를 함께 빌드한다: 첫 화면(index.html) + 실제 앱(app/index.html)
      input: { main: page("./index.html"), app: page("./app/index.html") },
    },
  },
});
