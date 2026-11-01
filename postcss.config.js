// 화면 꾸밈(Tailwind)을 빌드할 때 거치는 설정입니다.
// 설정 파일 위치를 주소로 지정해 두어서, 어느 폴더에서 빌드를 시작해도 같은 결과가 나옵니다.
import { fileURLToPath } from "node:url";

export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL("./tailwind.config.js", import.meta.url)) },
    autoprefixer: {},
  },
};
