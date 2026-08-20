import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages는 프로젝트 저장소 이름을 하위 경로로 사용합니다(예: https://아이디.github.io/저장소이름/).
// GitHub Actions 워크플로우가 빌드 시 VITE_BASE_PATH를 저장소 이름으로 자동 설정해주므로
// 저장소 이름을 몰라도, 이름을 바꿔도 항상 올바르게 동작합니다.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    outDir: "dist",
  },
});
