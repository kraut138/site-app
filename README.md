# 현장통 (SiteTong)

음성인식과 QR로 아파트 건설현장의 공종별 검측 · 부적합(NCR) · 호실 진행도를 한 곳에서 관리하는 웹 앱입니다.
화면은 React + Vite로 만들고, 데이터와 로그인은 Firebase에, 사이트는 GitHub Pages에 올라갑니다.

## 화면은 하나뿐입니다

- 사이트 주소(`https://아이디.github.io/저장소이름/`)가 이 앱의 전부입니다. 시공사 관리자 포털, 하도급 반장 모바일 모드, QR로 들어오는 호실 화면이 모두 이 안에 있습니다.
- 앞으로의 수정은 **이 저장소 한 곳에만** 합니다. 따로 고치는 시안 파일이나 복사본은 없습니다.
- `…/app/` 로 시작하는 옛 주소는 `public/app/index.html`이 사이트 첫 주소로 넘겨 줍니다. 이미 인쇄해 붙인 QR이 계속 열리도록 남겨 둔 안내 파일이라 고칠 필요가 없습니다.

## 파일은 이렇게 놓여 있습니다

```
index.html                 사이트의 시작 파일 (고치지 않아도 됩니다)
src/                       앱 코드는 전부 여기에만 둡니다
  main.jsx                   앱 시작점
  App.jsx                    로그인 확인 · 데이터 불러오기 · 어떤 탭을 보여줄지 결정
  platform/                  현장통 화면의 뼈대: 상단바, 탭 목록(tabs.js), 대시보드, 공종별 QR 생성소
  components/                각 탭의 안쪽 화면: 동.호수, 호실 정보, 골구도, 용어 DB, 음성 검측, 서류 작성, 검측·NCR …
  paperwork/                 서류 작성 탭의 계산: 하루치 음성 기록을 모아 정리하고, 양식 파일(워드·한글)의 빈 칸에 채웁니다
  api.js                     Firestore에 읽고 쓰는 곳 (데이터 저장은 모두 여기를 지납니다)
  auth.js · firebase.js      로그인 · Firebase 설정값
  data.js                    역할 · 공종 · 화면별 권한 같은 기본 정보
  i18n.js                    하도급사 화면의 번역 문구
  styles.css                 디자인(색, 카드, 버튼)
public/                    손대지 않고 그대로 복사되는 파일
  logo-kwangwoon.png · site-background.svg
  app/index.html             옛 QR 주소 안내 (고칠 필요 없음)
  templates/                 서류 작성 탭이 채우는 양식 3개: work-log.docx(작업일보) · tbm-log.docx(TBM 일지) · inspection-request.hwp(검측요청서)
                               양식을 바꿀 때는 같은 이름으로 교체합니다. 칸은 '작성일'·'작업 장소' 같은 이름표 글자로 찾으니 이름표는 지우지 마세요.
  sitesystem.html.html       따로 보관 중인 정적 시안 페이지 (앱과 관계없음)
.github/workflows/deploy.yml  main에 올리면 자동으로 구조를 확인하고 배포합니다
firestore.rules            Firebase 콘솔의 Firestore 규칙에 붙여 넣는 규칙 파일
package.json · vite.config.js · tailwind.config.js · postcss.config.js   빌드 설정
```

## 업데이트하는 방법 (GitHub Desktop)

1. GitHub Desktop에서 **Fetch origin → Pull origin**으로 먼저 최신 상태로 맞춥니다. (팀원이 올린 내용을 덮어쓰지 않기 위해서입니다.)
2. 바꾼 파일을 **받은 위치 그대로** 프로젝트 폴더에 덮어씁니다. (`src/App.jsx`는 `src` 폴더 안의 `App.jsx` 자리에)
3. 변경 내용을 확인하고 **Commit → Push** 합니다.
4. GitHub의 **Actions** 탭에서 `Deploy to GitHub Pages`가 초록색 체크가 될 때까지 기다립니다. (보통 1~3분)
5. 사이트에서 **Ctrl + Shift + R**로 새로고침합니다.

### 이런 것은 하지 마세요

- 압축을 푼 **폴더째**(`site-app-main` 같은 폴더) 저장소 안에 넣지 마세요. 폴더 안의 **내용물만** 넣습니다.
- `.jsx` · `.js` 파일을 저장소 맨 위에 두지 마세요. 코드 파일은 `src` 안에만 있어야 반영됩니다.
- `index.html`을 예전 시안(정적 화면)으로 덮어쓰지 마세요. 배포가 자동으로 멈추고 사이트는 이전 상태 그대로 남습니다.
- 같은 이름의 파일을 두 곳에 두지 마세요. 어느 쪽이 적용되는지 헷갈립니다.
- 업데이트용 압축 파일(`.zip`)이나 안내 메모(`.txt`)를 저장소에 올리지 마세요.

### 배포가 빨간색(실패)이거나 노란 경고가 뜨면

Actions 실행 화면 맨 위의 **Annotations**에 원인이 한국어로 적혀 있습니다.

- 빨간색 `index.html이 통합 플랫폼 파일이 아니에요` → 맨 위의 `index.html`이 예전 시안으로 바뀐 것입니다. 이전 버전으로 되돌려 주세요. (사이트는 그동안 이전 상태로 정상 동작합니다.)
- 빨간색 `src 폴더가 비어 있거나 없어요` → 정리하다가 `src` 폴더가 지워졌는지 확인해 주세요.
- 노란색 `저장소 맨 위에 낯선 파일이 있어요` → 사이트에 반영되지 않는 파일입니다. 지우거나 `src` 안으로 옮겨 주세요. (배포는 계속됩니다.)
- 노란색 `src 안에 같은 이름의 파일이 두 곳에 있어요` → 한 곳만 남기고 지워 주세요.

## 처음부터 다시 설정해야 할 때 (한 번만)

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만들고, **Firestore Database**(서울 `asia-northeast3`)와 **Authentication → 이메일/비밀번호**를 켭니다. 사진 저장용 Storage는 쓰지 않습니다.
2. 프로젝트 설정 → 내 앱 → 웹 앱을 등록해 나온 설정값을 `src/firebase.js`에 넣습니다.
3. GitHub 저장소의 **Settings → Pages → Source**를 **GitHub Actions**로 바꿉니다.
4. `main`에 Push하면 `.github/workflows/deploy.yml`이 자동으로 빌드해서 올립니다. 접속 주소는 **Settings → Pages** 위쪽에 표시됩니다.

## 내 컴퓨터에서 미리 보기

```bash
npm install
npm run dev
```
