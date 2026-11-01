import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// ── 사이트 화면 구성 ─────────────────────────────────────────────────────────
//  · 통합 플랫폼 (https://아이디.github.io/저장소이름/)  → 저장소 맨 위의 index.html (현장통 화면 + 실제 기능, React 앱)
//  · 예전 주소 (…/저장소이름/app/)                    → app/index.html (통합 플랫폼으로 넘겨 주는 안내 화면)
// 예전에 인쇄해 붙인 QR 링크(…/app/?b=동&f=층&u=호, …/app/?qr=코드)와 화면 바로가기(…/app/#glossary)도
// app/index.html이 주소 뒤쪽 값을 그대로 붙여 첫 주소로 보내 주기 때문에 계속 열린다.
// ────────────────────────────────────────────────────────────────────────────
const page = (file) => fileURLToPath(new URL(file, import.meta.url));

// GitHub Pages는 프로젝트 저장소 이름을 하위 경로로 사용합니다(예: https://아이디.github.io/저장소이름/).
// GitHub Actions 워크플로우가 빌드 시 VITE_BASE_PATH를 저장소 이름으로 자동 설정해주므로
// 저장소 이름을 몰라도, 이름을 바꿔도 항상 올바르게 동작합니다.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    outDir: "dist",
    rollupOptions: {
      // 화면(HTML) 두 개를 함께 빌드한다: 통합 플랫폼(index.html) + 예전 주소 안내(app/index.html)
      input: { main: page("./index.html"), app: page("./app/index.html") },
    },
  },
});
