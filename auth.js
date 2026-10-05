import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase.js";
import { ROLES } from "./data.js";
import { DEFAULT_LANGUAGE } from "./i18n.js";

// 회원가입 시 이 코드를 입력하면 "관리자" 권한으로, 아래 코드를 입력하면 "감리자" 권한으로 가입된다.
// 둘 다 아니면 "하도급사"로 가입된다.
// 주의: 이 코드는 브라우저에 그대로 내려가는 프론트엔드 코드 안에 있으므로, 완벽한 보안 장치는 아니다.
// (개발자 도구로 코드를 알아낼 수 있는 사람을 막지는 못한다) 알고 있는 사람만 계정을 만들도록
// 하는 정도의 가벼운 장치로 생각하고, 필요하면 이 값을 바꿔서 재배포하면 된다.
const DIRECTOR_SIGNUP_CODE = "SOJANG2026";
const INSPECTOR_SIGNUP_CODE = "GAMRI2026";

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/invalid-api-key" || code.startsWith("auth/api-key-not-valid")) {
    return "회원가입·로그인 서비스 연결 설정을 확인해야 합니다. 관리자에게 문의해주세요. (Firebase API 키 오류)";
  }
  if (code === "auth/operation-not-allowed") {
    return "이메일 가입 기능이 아직 활성화되지 않았습니다. 관리자에게 문의해주세요.";
  }
  if (code === "auth/network-request-failed") {
    return "서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.";
  }
  if (code === "auth/too-many-requests") {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code === "auth/email-already-in-use") return "이미 가입된 이메일입니다.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (code === "auth/weak-password") return "비밀번호는 6자 이상이어야 합니다.";
  if (code === "auth/invalid-email") return "이메일 형식이 올바르지 않습니다.";
  return err?.message || "처리 중 오류가 발생했습니다.";
}

// 회원가입: Firebase Auth 계정 생성 + Firestore에 역할·이름을 담은 프로필 문서 생성.
export async function signUp({ email, password, name, directorCode }) {
  try {
    const code = directorCode ? directorCode.trim() : "";
    const role = code === DIRECTOR_SIGNUP_CODE ? ROLES.SUPER : code === INSPECTOR_SIGNUP_CODE ? ROLES.INSPECTOR : ROLES.SUB;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const profile = { email, name: name || "", role, language: DEFAULT_LANGUAGE, createdAt: new Date().toISOString() };
    await setDoc(doc(db, "users", cred.user.uid), profile);
    return { uid: cred.user.uid, ...profile };
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}

export async function logIn({ email, password }) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}

export async function logOut() {
  await signOut(auth);
}

// Firestore에 저장된 사용자 프로필(역할 등)을 읽어온다. 계정은 있지만 프로필 문서가 없는
// 예외적인 경우(예: 수동으로 콘솔에서 계정만 만든 경우)에는 안전하게 하도급사로 취급한다.
export async function fetchUserProfile(uid, fallbackEmail) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) return { language: DEFAULT_LANGUAGE, ...snap.data() };
  return { email: fallbackEmail || "", name: "", role: ROLES.SUB, language: DEFAULT_LANGUAGE };
}

// 계정에 저장된 언어 설정을 바꾼다 - 다음에 이 계정으로 로그인할 때도 그대로 적용된다.
export async function updateUserLanguage(uid, language) {
  await updateDoc(doc(db, "users", uid), { language });
}

// 로그인 상태 변화를 구독한다. 콜백은 로그인 시 Firebase Auth user 객체를, 로그아웃 시 null을 받는다.
export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
