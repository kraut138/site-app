// 현장통 화면 디자인(Tailwind) 설정 - 첫 화면 시안(index.html)에서 쓰던 색·글꼴을 그대로 가져왔다.
/** @type {import('tailwindcss').Config} */
export default {
  // relative: true → 이 설정 파일이 있는 폴더를 기준으로 파일을 찾는다(어느 폴더에서 빌드해도 같은 결과)
  content: { relative: true, files: ["./index.html", "./src/**/*.{js,jsx}"] },
  // 기존 화면 스타일(styles.css)에도 같은 이름의 클래스가 있어서, 겹치는 짧은 이름(grow, inline)은 Tailwind가 만들지 않게 막는다.
  blocklist: ["grow", "inline"],
  theme: {
    extend: {
      colors: {
        site: {
          blue: "#1d4ed8",
          orange: "#ea580c",
          slate: "#475569",
          emerald: "#059669",
          amber: "#d97706",
          purple: "#9333ea",
          dark: "#0f172a",
        },
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', "Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "Roboto", '"Malgun Gothic"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
