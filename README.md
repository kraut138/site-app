# 현장검측 · 공종 체크 / 검측 승인 / NCR 관리 어플

아파트 건설현장용 공종별 체크리스트 · 검측 요청/승인 워크플로우 · NCR(부적합) 관리 · 인력 등록 · 대시보드 웹앱입니다.

**이 버전은 Netlify를 쓰지 않습니다.** 프론트엔드는 GitHub Pages에서, 데이터 저장은 Google의 Firebase(Firestore + Storage)에서 처리합니다.

## 처음 설정 (한 번만 하면 됨)

### 1. Firebase 프로젝트 만들기

1. [console.firebase.google.com](https://console.firebase.google.com) 접속 → Google 계정으로 로그인 → **"프로젝트 추가"**
2. 프로젝트 이름 입력(예: `apt-construction-qc`) → Google 애널리틱스는 꺼도 무방 → 프로젝트 생성

### 2. Firestore(데이터베이스) 만들기

1. 왼쪽 메뉴 **빌드 → Firestore Database** → **데이터베이스 만들기**
2. 위치는 `asia-northeast3(서울)` 선택 → **프로덕션 모드**로 시작
3. 만들어지면 상단 **"규칙"** 탭 클릭 → 이 프로젝트의 `firestore.rules` 파일 내용을 그대로 붙여넣고 **게시**

### 3. 웹 앱 등록하고 설정값 가져오기

1. 프로젝트 개요 옆 **⚙️(설정) → 프로젝트 설정**
2. 아래로 스크롤 → **"내 앱"** → 웹 아이콘(`</>`) 클릭 → 앱 닉네임 아무거나 입력 → 앱 등록
3. 화면에 나오는 `firebaseConfig` 값(apiKey, authDomain 등)을 그대로 복사
4. `src/firebase.js` 파일을 열어서 `REPLACE_WITH_...` 부분을 방금 복사한 값으로 교체 → 저장

> Storage(사진 저장소)는 설정하지 않습니다 — Firebase가 2026년 2월부터 Storage에 유료 요금제(Blaze) 가입을 요구하도록 바꿔서, 이 앱은 검측 사진도 압축해서 Firestore 안에 함께 저장하는 방식으로 만들었습니다. 완전히 무료로 쓸 수 있습니다.

### 4. GitHub Pages 켜기

1. GitHub 저장소 페이지 → **Settings → Pages**
2. **Source**를 **"GitHub Actions"**로 선택

### 5. 커밋 + 푸시

GitHub Desktop에서 변경된 파일 전부 커밋 → Push. `.github/workflows/deploy.yml`이 자동으로 빌드해서 GitHub Pages에 올려줍니다. 완료되면 **Settings → Pages** 상단에 실제 접속 주소(`https://아이디.github.io/저장소이름/`)가 표시됩니다.

## 이후 업데이트하는 방법

GitHub Desktop에서 파일 수정 → 커밋 → Push. 그게 전부입니다. Netlify 때와 동일하게, push 한 번이면 몇 분 안에 자동으로 반영됩니다.

## 데이터는 안전한가요?

Firestore와 Storage 규칙을 위 예시대로 설정하면 **로그인 없이 누구나 읽고 쓸 수 있습니다** — 지금 앱에 별도 로그인 기능이 없는 것과 동일한 수준입니다. Netlify Blobs를 쓸 때와 보안 수준은 같고, 다만 데이터가 저장되는 곳이 Netlify에서 Firebase로 바뀐 것뿐입니다.

## 참고: 기존 Netlify에 있던 데이터

이 마이그레이션은 코드 구조를 바꾸는 것이라, **기존 Netlify 사이트에 저장돼 있던 데이터(등록해둔 동, 커스터마이징한 체크리스트 등)는 자동으로 옮겨오지 않습니다.** 처음 접속하면 기본 동 2개, 기본 체크리스트가 다시 시드되어 시작합니다. 기존 Netlify 사이트는 그대로 두면 계속 별개로 작동하니, 필요하면 당분간 두 곳을 비교하면서 확인하셔도 됩니다.

## 구조

```
src/                      React 프론트엔드 (컴포넌트는 이전과 동일)
  firebase.js              Firebase 초기화 (여기에 설정값 입력)
  api.js                   데이터 계층 - Firestore/Storage 호출
.github/workflows/deploy.yml   GitHub Actions로 GitHub Pages 자동 배포
firestore.rules            Firestore 보안 규칙 (Firebase 콘솔에 붙여넣기용)
```

## 로컬에서 미리 확인하고 싶다면

```bash
npm install
npm run dev
```

`src/firebase.js`에 실제 설정값을 넣어둔 상태라면 로컬에서도 바로 실제 데이터베이스에 연결됩니다.
