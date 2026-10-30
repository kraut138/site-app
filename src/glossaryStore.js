// 음성 검측이 쓰는 용어 표(현장 은어 → 표준 용어)를 화면 쪽에서 들고 있는 곳.
// 표 자체는 Firestore(meta/glossary)에 있고(api.js), 여기서는 "지금 쓸 표"를 바로 꺼낼 수 있게 들고 있다가 필요할 때 새로 읽는다.
//  - 처음에는 이 기기에 마지막으로 저장해 둔 표나 기본 용어로 시작해서, 통신이 안 되는 곳(지하 등)에서도 말한 내용을 바꿀 수 있다.
//  - 화면이 열릴 때·녹음을 시작할 때처럼 표가 최신이어야 하는 순간에 refreshGlossary()를 부르면 표 문서 1건만 읽어 와 바꿔 놓는다.
//  - 읽지 못하면(통신 문제) 조용히 지금 들고 있는 표를 그대로 쓴다. 변환 때문에 보고가 막히는 일은 없다.
//  - 표와 함께 변환 방식(onlyDb: 용어 DB에 있는 단어만 남기기, 기본 켜짐)과 비슷한 용어 찾기 단계(fuzzy: 끔·엄격·보통, 기본 보통)도 같은 문서에서 읽어 들고 있는다.
import * as api from "./api.js";
import { DEFAULT_FUZZY, normalizeFuzzy } from "./fuzzyTerms.js";
import { defaultGlossary, sanitizeGlossary } from "./voice.js";

const CACHE_KEY = "voiceGlossaryCache";

// 이 기기에 남겨 두는 복사본: 저장된 표가 있으면 { saved: true, terms, onlyDb, fuzzy },
// 표는 기본 용어인데 변환 방식을 꺼 뒀거나 비슷한 용어 찾기 단계를 바꿔 둔 경우엔 { saved: false, onlyDb, fuzzy }.
// (예전 복사본에는 onlyDb·fuzzy가 없다 - onlyDb는 켜진 것으로, fuzzy는 기본(보통)으로 본다)
function readCache() {
  try {
    const value = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
    if (value && typeof value === "object") {
      const onlyDb = value.onlyDb !== false;
      const fuzzy = normalizeFuzzy(value.fuzzy);
      if (value.saved === true && Array.isArray(value.terms)) return { terms: sanitizeGlossary(value.terms), saved: true, onlyDb, fuzzy };
      if (value.saved === false && (!onlyDb || fuzzy !== DEFAULT_FUZZY)) return { terms: defaultGlossary(), saved: false, onlyDb, fuzzy };
    }
  } catch {
    // 저장해 둔 값을 읽지 못해도 기본 용어로 동작한다.
  }
  return null;
}

function writeCache(next) {
  try {
    const fuzzy = normalizeFuzzy(next.fuzzy);
    if (next.saved) window.localStorage.setItem(CACHE_KEY, JSON.stringify({ saved: true, terms: next.terms, onlyDb: next.onlyDb, fuzzy }));
    else if (next.onlyDb === false || fuzzy !== DEFAULT_FUZZY) window.localStorage.setItem(CACHE_KEY, JSON.stringify({ saved: false, onlyDb: next.onlyDb !== false, fuzzy }));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // 저장해 두지 못해도 지금 화면에서 쓰는 데에는 영향이 없다.
  }
}

// saved: 관리자가 표를 저장한 적이 있는 표인지(false면 기본 용어), onlyDb: 용어 DB에 있는 단어만 남기는 변환 방식인지,
// fuzzy: 비슷한 용어 찾기 단계("off"·"strict"·"normal")
let state = readCache() || { terms: defaultGlossary(), saved: false, onlyDb: true, fuzzy: DEFAULT_FUZZY };
let inflight = null;

// 지금 쓸 표(항상 즉시 돌려준다).
export function getGlossaryTerms() {
  return state.terms;
}

// 지금 쓸 변환 방식: true면 표에 있는 단어만 남기고, false면 은어만 바꾸고 나머지 말은 그대로 둔다.
export function getGlossaryOnlyDb() {
  return state.onlyDb !== false;
}

// 지금 쓸 비슷한 용어 찾기 단계: "off"(끔) | "strict"(엄격) | "normal"(보통). 용어 DB 단어만 남기는 방식(onlyDb)이 꺼져 있으면 쓰이지 않는다.
export function getGlossaryFuzzy() {
  return normalizeFuzzy(state.fuzzy);
}

// 표를 읽어 오는 중이면 그 약속(Promise), 아니면 null. 변환 직전에 "잠깐 기다릴지" 정하는 데 쓴다.
export function getGlossaryPending() {
  return inflight;
}

// 관리자 탭에서 표를 고친 직후 같은 화면의 음성 검측에도 바로 쓰이도록 알려 준다.
export function setGlossaryTerms(terms) {
  state = { terms: sanitizeGlossary(terms), saved: true, onlyDb: state.onlyDb, fuzzy: state.fuzzy };
  writeCache(state);
}

// 관리자 탭에서 변환 방식을 바꾼 직후 같은 화면의 음성 검측에도 바로 쓰이도록 알려 준다.
export function setGlossaryMode(onlyDb) {
  state = { ...state, onlyDb: onlyDb !== false };
  writeCache(state);
}

// 관리자 탭에서 비슷한 용어 찾기 단계를 바꾼 직후 같은 화면의 음성 검측에도 바로 쓰이도록 알려 준다.
export function setGlossaryFuzzy(level) {
  state = { ...state, fuzzy: normalizeFuzzy(level) };
  writeCache(state);
}

// 방금 DB에서 읽어 온 표(api.fetchGlossary의 결과)를 지금 쓸 표로 삼고 이 기기의 복사본도 맞춰 둔다.
// saved가 false(저장된 표가 없음)면 기본 용어로 돌아가고, 복사본은 지운다(변환 방식을 꺼 뒀거나 비슷한 용어 찾기 단계를 바꿔 둔 경우만 그 설정을 남긴다).
export function adoptGlossary(res) {
  state = { terms: res.terms, saved: res.saved, onlyDb: res.onlyDb !== false, fuzzy: normalizeFuzzy(res.fuzzy) };
  writeCache(state);
}

// 최신 표를 읽어 온다. 이미 읽는 중이면 그 요청을 같이 기다린다.
// 항상 성공으로 끝난다(읽지 못하면 지금 들고 있는 표를 돌려준다).
export function refreshGlossary() {
  if (inflight) return inflight;
  const run = api
    .fetchGlossary()
    .then((res) => {
      adoptGlossary(res);
    })
    .catch(() => {
      // 읽지 못하면 지금 가진 표를 그대로 쓴다.
    })
    .then(() => state.terms);
  inflight = run;
  run.then(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}
