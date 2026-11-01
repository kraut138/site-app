import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ── 화면은 하나뿐입니다 ──────────────────────────────────────────────────────
//  · 사이트 주소(https://아이디.github.io/저장소이름/) = 저장소 맨 위의 index.html → src/main.jsx  (현장통 통합 플랫폼)
//  · 예전 QR 링크(…/저장소이름/app/?b=동&f=층&u=호 등)는 public/app/index.html 안내 파일이 첫 주소로 넘겨 줍니다(고칠 필요 없음).
// 앞으로의 수정은 src 폴더 안의 파일만 고치면 됩니다.
// ────────────────────────────────────────────────────────────────────────────

// GitHub Pages는 프로젝트 저장소 이름을 하위 경로로 사용합니다(예: https://아이디.github.io/저장소이름/).
// GitHub Actions 워크플로우가 빌드 시 VITE_BASE_PATH를 저장소 이름으로 자동 설정해주므로
// 저장소 이름을 몰라도, 이름을 바꿔도 항상 올바르게 동작합니다.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  build: { outDir: "dist" },
});
