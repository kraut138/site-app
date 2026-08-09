# 현장검측 · 공종 체크 / 검측 승인 / NCR 관리 어플

아파트 건설현장용 공종별 체크리스트 · 검측 요청/승인 워크플로우 · NCR(부적합) 관리 · 대시보드 웹앱입니다.
React(Vite) + Netlify Functions + Netlify Blobs로 구성되어 있으며, 별도 DB 설정 없이 배포만으로 동작합니다.

## 이미 준비된 것

- Netlify 사이트가 생성되어 있습니다: **apt-construction-qc** (site id: `4884f9b6-e7f1-4d15-8679-1ef4caaee97a`)
- 배포 후 기본 접속 주소: `https://apt-construction-qc.netlify.app`

## 배포 방법 (택 1)

### 방법 A. Netlify CLI로 배포 (가장 빠름, 5분)

터미널에서 이 폴더 안으로 이동한 뒤:

```bash
npm install -g netlify-cli   # 이미 설치되어 있다면 생략
netlify login                 # 브라우저가 열리며 Netlify 계정 로그인
netlify link --id 4884f9b6-e7f1-4d15-8679-1ef4caaee97a
netlify deploy --prod
```

`netlify deploy --prod`가 `npm install` → `npm run build`(Vite 빌드) → Functions 배포까지 전부 자동으로 처리합니다.
완료되면 터미널에 실제 배포 URL이 출력됩니다.

### 방법 B. GitHub 연동 (GUI로, CLI 없이)

1. 이 폴더 내용을 새 GitHub 저장소에 푸시합니다.
2. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → 방금 만든 저장소 선택
3. 빌드 설정은 `netlify.toml`에 이미 다 들어있어서 그대로 **Deploy** 누르면 됩니다.
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

## 로컬에서 미리 확인하고 싶다면

```bash
npm install
netlify dev
```

`netlify dev`는 Vite 프론트엔드 + Netlify Functions + Blobs를 로컬에서 함께 실행해줍니다 (일반 `vite` 단독 실행은 `/api/*` 백엔드가 동작하지 않으니 `netlify dev`를 권장합니다).

## 구조

```
src/                    React 프론트엔드
  components/
    Dashboard.jsx        대시보드 (동별 승인율, NCR 통계, 지적사항 위치)
    Checklist.jsx         공종별 표준 체크리스트 열람
    Inspections.jsx        검측 요청 작성 / 목록 / 승인·반려
    NCR.jsx                 NCR 보드 (발생→조치중→재검측요청→완료)
    Buildings.jsx           동/층/세대 관리
    DrawingPin.jsx           도면 위치 핀 찍기 (공통 컴포넌트)
netlify/functions/api.mts   백엔드 API (Netlify Blobs에 데이터 저장)
```

데이터는 Netlify Blobs에 저장되어 하도급사/감리단 등 모든 사용자가 같은 데이터를 실시간으로 공유합니다.
현재는 별도 로그인 없이 사이드바에서 "하도급사 / 감리단·소장" 역할을 전환하는 방식입니다 — 실사용 전환 시 사용자 인증(Netlify Identity 등) 추가를 권장합니다.
도면은 예시 평면도(SVG)이며, 실제 현장 도면 이미지로 교체하려면 `src/components/DrawingPin.jsx`의 `ROOMS` 배열을 교체하거나 이미지 기반으로 바꾸면 됩니다.
