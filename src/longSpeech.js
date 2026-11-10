// 5분 안팎의 긴 말(작업 전 안전점검회의)을 끊기지 않게 받아 적는 음성 인식 도우미.
// 브라우저의 음성 인식(Web Speech API)은 한 번에 오래 듣지 못하고 조용하면 스스로 끝나기 때문에, 끝날 때마다 바로 다시 시작해 이어 듣는다.
// 화면이나 저장소와 무관한 모듈이라 가짜 인식기를 넣어 Node에서도 시험한다(createLongRecognizer의 SR 인자).
//
// 이 모듈이 하는 일
//   - 이어 듣기: 인식이 끝나면(조용함·시간 제한·잠깐의 오류) 짧게 쉬었다가 새로 시작한다. 다시 시작하는 사이(0.2~0.5초)의 말은 놓칠 수 있다.
//   - 중복 거르기: 같은 글이 되풀이되거나 앞 글에 이어 붙어 "누적"되어 오는 인식기(일부 안드로이드)의 결과를 한 번만 받는다.
//   - 화면 꺼짐 방지(Screen Wake Lock): 회의 내내 화면이 꺼지지 않게 한다. 지원하지 않는 기기에서는 그냥 넘어간다.
//   - 멈출 때: 아직 확정되지 않은 마지막 말(임시 결과)도 글에 넣는다.
//   - 오류: 마이크 권한·마이크 문제·반복 실패는 멈추고 이유를 알린다. 네트워크 오류는 몇 번 다시 시도한다. 조용함(no-speech)은 정상이다.
//   - 안전장치: 최대 20분, 최대 글자 수에서 자동으로 멈춘다.
// 소리를 파일로 따로 녹음하지는 않는다(마이크를 함께 쓰면 인식이 방해받는 기기가 있다).
import { getSpeechRecognition } from "./voice.js";

export const LONG_SPEECH_LIMITS = {
  maxMs: 20 * 60 * 1000, // 최대 듣는 시간
  maxChars: 40000, // 받아 적을 최대 글자 수(요약 규칙이 읽는 한도와 같다)
  restartMs: 150, // 인식이 끝난 뒤 다시 시작하기까지 쉬는 시간
  stopWaitMs: 2500, // 멈춤을 요청한 뒤 마지막 결과를 기다리는 시간
  maxQuickEnds: 8, // 말 없이 곧바로 끝나는 일이 이만큼 이어지면 문제가 있는 것으로 보고 멈춘다
  maxNetworkRetries: 3,
};

// ---------------------------------------------------------------- 글 이어 붙이기

const oneSpace = (s) =>
  String(s == null ? "" : s)
    .replace(/\s+/g, " ")
    .trim();

// 앞 글(base)에 새로 받아 적은 글(added)을 이어 붙인다. 앞 글이 줄 바꿈으로 끝나면 줄 바꿈은 그대로 두고, 아니면 한 칸 띄운다.
export function appendTranscript(base, added) {
  const a = String(added == null ? "" : added).trim();
  const b = String(base == null ? "" : base);
  if (!a) return b;
  if (!b.trim()) return a;
  return /\s$/.test(b) ? `${b}${a}` : `${b} ${a}`;
}

// 확정된 결과들을 모으는 상자. 같은 글이 되풀이되거나 누적되어 와도 한 번만 담는다.
export function createFinalBuffer() {
  const finals = [];
  let chars = 0;
  return {
    // 담았으면(새 글이면) true
    push(raw) {
      const t = oneSpace(raw);
      if (!t) return false;
      const last = finals.length ? finals[finals.length - 1] : "";
      if (last) {
        if (t === last) return false; // 똑같은 글이 다시 옴
        if (t.startsWith(last)) {
          // 앞 글에 이어 붙어 길어진 글(누적)이면 앞 글을 새 글로 바꾼다
          chars += t.length - last.length;
          finals[finals.length - 1] = t;
          return true;
        }
        if (last.startsWith(t) || last.endsWith(t)) return false; // 앞 글의 일부가 다시 옴
      }
      finals.push(t);
      chars += t.length + 1;
      return true;
    },
    text() {
      return finals.join(" ");
    },
    length() {
      return chars;
    },
    count() {
      return finals.length;
    },
    clear() {
      finals.length = 0;
      chars = 0;
    },
  };
}

// 화면에 보이는 "HH:MM"(이 기기의 시각)
export function clockHM(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- 인식기

const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

// 오류 코드 → 사람에게 보여 줄 글
export function longSpeechErrorText(code) {
  switch (code) {
    case "unsupported":
      return "이 브라우저는 음성 인식을 지원하지 않아요. 아래 칸에 직접 쓰거나, 휴대폰 키보드의 마이크(받아쓰기)로 말해 주세요.";
    case "not-allowed":
    case "service-not-allowed":
      return "마이크를 쓸 수 없어요. 브라우저 주소창의 자물쇠에서 마이크를 허용한 뒤 다시 눌러 주세요.";
    case "audio-capture":
      return "마이크를 찾지 못했거나 다른 앱이 쓰고 있어요. 마이크를 확인한 뒤 다시 눌러 주세요.";
    case "language-not-supported":
      return "이 기기는 한국어 음성 인식을 지원하지 않아요. 아래 칸에 직접 써 주세요.";
    case "network":
      return "인터넷 연결이 불안정해 받아 적기를 멈췄어요. 연결을 확인한 뒤 다시 눌러 주세요. 지금까지 받아 적은 글은 남아 있어요.";
    case "unstable":
      return "음성 인식이 계속 끊겨서 멈췄어요. 마이크를 확인하고 조용한 곳에서 다시 눌러 주세요. 지금까지 받아 적은 글은 남아 있어요.";
    case "start-failed":
      return "음성 인식을 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.";
    default:
      return "";
  }
}

// 멈춘 이유(reason)에 따른 안내
export function longSpeechStopText(reason) {
  if (reason === "max") return "최대 시간(20분)이 되어 자동으로 멈췄어요.";
  if (reason === "full") return "받아 적을 수 있는 분량이 가득 차서 자동으로 멈췄어요.";
  return "";
}

// opts: { SR, lang, maxMs, maxChars, onChange(snapshot), now, timers:{set,clear}, wake, doc }
// 반환: { supported, start(), stop(), dispose(), snapshot() }
// snapshot: { state: "idle"|"listening"|"stopping", text, interim, startedAt, endedAt, wake, gaps, error, reason }
export function createLongRecognizer(opts = {}) {
  const SR = opts.SR !== undefined ? opts.SR : getSpeechRecognition();
  const lang = opts.lang || "ko-KR";
  const lim = { ...LONG_SPEECH_LIMITS, ...(opts.limits || {}) };
  const maxMs = opts.maxMs || lim.maxMs;
  const maxChars = opts.maxChars || lim.maxChars;
  const onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};
  const now = opts.now || (() => Date.now());
  const timers = opts.timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
  const wakeApi = opts.wake !== undefined ? opts.wake : typeof navigator !== "undefined" && navigator && navigator.wakeLock ? navigator.wakeLock : null;
  const doc = opts.doc !== undefined ? opts.doc : typeof document !== "undefined" ? document : null;

  const buf = createFinalBuffer();
  let state = "idle";
  let rec = null;
  let active = false; // 인식기가 지금 듣는 중(start 뒤 end 전)
  let interim = "";
  let startedAt = 0;
  let endedAt = 0;
  let sessionAt = 0; // 이번 인식 시작 시각
  let gotSince = false; // 이번 인식에서 결과가 있었는가
  let quickEnds = 0;
  let netFails = 0;
  let startFails = 0;
  let error = "";
  let reason = "";
  let gaps = 0; // 화면이 가려져 못 들었을 수 있는 횟수
  let hidden = false;
  let wakeLock = null;
  let wakeOn = false;
  let disposed = false;
  let tMax = null;
  let tRestart = null;
  let tStop = null;
  let listening = false; // 화면 가림 감시를 걸어 두었는가

  const snapshot = () => ({ state, text: buf.text(), interim, startedAt, endedAt, wake: wakeOn, gaps, error, reason });
  const emit = () => {
    if (!disposed) onChange(snapshot());
  };
  const clearTimer = (id) => {
    if (id !== null) timers.clear(id);
    return null;
  };

  // ------------ 화면 꺼짐 방지
  function requestWake() {
    if (!wakeApi || typeof wakeApi.request !== "function") return;
    if (wakeLock && !wakeLock.released) return;
    let job;
    try {
      job = Promise.resolve(wakeApi.request("screen"));
    } catch {
      return;
    }
    job
      .then((lock) => {
        if (!lock) return;
        if (disposed || state === "idle") {
          // 그 사이 끝났으면 바로 놓는다
          try {
            lock.release && lock.release();
          } catch {
            // 무시
          }
          return;
        }
        wakeLock = lock;
        wakeOn = true;
        if (typeof lock.addEventListener === "function") {
          lock.addEventListener("release", () => {
            if (wakeLock === lock) {
              wakeLock = null;
              wakeOn = false;
              emit();
            }
          });
        }
        emit();
      })
      .catch(() => {
        wakeOn = false;
      });
  }
  function releaseWake() {
    const lock = wakeLock;
    wakeLock = null;
    wakeOn = false;
    if (lock && typeof lock.release === "function") {
      try {
        const r = lock.release();
        if (r && typeof r.catch === "function") r.catch(() => {});
      } catch {
        // 무시
      }
    }
  }

  // ------------ 화면이 가려졌다 돌아왔을 때
  function onVisibility() {
    if (!doc || state !== "listening") return;
    if (doc.visibilityState === "hidden") {
      hidden = true;
      return;
    }
    if (doc.visibilityState === "visible") {
      if (hidden) {
        hidden = false;
        gaps += 1; // 그 사이 말은 받아 적지 못했을 수 있다
      }
      requestWake();
      if (!active && tRestart === null) {
        // 가려져 있는 동안 인식이 끝났다면 바로 다시 시작한다
        rec = makeRec();
        launch();
      }
      emit();
    }
  }
  function watchVisibility(on) {
    if (!doc || typeof doc.addEventListener !== "function") return;
    if (on && !listening) {
      doc.addEventListener("visibilitychange", onVisibility);
      listening = true;
    } else if (!on && listening) {
      doc.removeEventListener("visibilitychange", onVisibility);
      listening = false;
    }
  }

  // ------------ 인식기 만들기 · 시작
  function makeRec() {
    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    try {
      r.maxAlternatives = 1;
    } catch {
      // 일부 브라우저는 바꿀 수 없다
    }
    r.onresult = (ev) => {
      if (r !== rec || state === "idle") return;
      gotSince = true;
      netFails = 0;
      quickEnds = 0;
      const results = (ev && ev.results) || [];
      let heard = "";
      for (let i = (ev && ev.resultIndex) || 0; i < results.length; i += 1) {
        const res = results[i];
        const alt = res && res[0];
        const tx = alt ? String(alt.transcript || "") : "";
        if (!tx) continue;
        if (res.isFinal) buf.push(tx);
        else heard += tx;
      }
      interim = oneSpace(heard);
      if (buf.length() >= maxChars && state === "listening") {
        stopInternal("full");
        return;
      }
      emit();
    };
    r.onerror = (ev) => {
      if (r !== rec) return;
      const code = String((ev && ev.error) || "");
      if (code === "no-speech" || code === "aborted") return; // 조용했거나 우리가 멈춘 것: 정상
      if (FATAL.has(code)) {
        fatal(code);
        return;
      }
      if (code === "network") {
        netFails += 1;
        if (netFails > lim.maxNetworkRetries) fatal("network");
      }
      // 그 밖의 오류는 곧 이어서 end가 오므로 거기서 다시 시작한다
    };
    r.onend = () => {
      if (r !== rec) return;
      active = false;
      if (state === "stopping") {
        finish();
        return;
      }
      if (state !== "listening") return;
      const lived = now() - sessionAt;
      if (!gotSince && lived < 1500) quickEnds += 1;
      else quickEnds = 0;
      if (quickEnds >= lim.maxQuickEnds) {
        fatal("unstable");
        return;
      }
      if (doc && doc.visibilityState === "hidden") {
        // 화면이 가려진 동안은 다시 시작하지 않는다(브라우저가 막는다). 화면이 돌아오면 onVisibility가 다시 시작한다.
        hidden = true;
        emit();
        return;
      }
      const delay = netFails > 0 ? Math.min(1000 * 2 ** (netFails - 1), 8000) : lim.restartMs;
      tRestart = clearTimer(tRestart);
      tRestart = timers.set(() => {
        tRestart = null;
        if (state !== "listening" || disposed) return;
        rec = makeRec();
        launch();
      }, delay);
    };
    return r;
  }

  function launch() {
    gotSince = false;
    sessionAt = now();
    try {
      rec.start();
      active = true;
      startFails = 0;
    } catch {
      active = false;
      startFails += 1;
      if (startFails > 5) {
        fatal("start-failed");
        return;
      }
      tRestart = clearTimer(tRestart);
      tRestart = timers.set(() => {
        tRestart = null;
        if (state !== "listening" || disposed) return;
        rec = makeRec();
        launch();
      }, 300);
    }
  }

  // ------------ 끝내기
  function cleanup() {
    tMax = clearTimer(tMax);
    tRestart = clearTimer(tRestart);
    tStop = clearTimer(tStop);
    watchVisibility(false);
    releaseWake();
  }

  function finish() {
    if (state === "idle") return;
    // 확정되지 못한 마지막 말도 글에 넣는다
    if (interim) {
      buf.push(interim);
      interim = "";
    }
    const old = rec;
    rec = null;
    active = false;
    if (old) {
      old.onresult = null;
      old.onerror = null;
      old.onend = null;
      try {
        old.abort && old.abort();
      } catch {
        // 무시
      }
    }
    state = "idle";
    endedAt = now();
    cleanup();
    emit();
  }

  function fatal(code) {
    if (state === "idle") return;
    error = code;
    reason = "error";
    finish();
  }

  function stopInternal(why) {
    if (state !== "listening") return false;
    state = "stopping";
    reason = why;
    tMax = clearTimer(tMax);
    tRestart = clearTimer(tRestart);
    emit();
    if (rec && active) {
      try {
        rec.stop();
      } catch {
        finish();
        return true;
      }
      // 마지막 결과가 안 오고 끝나지 않는 기기를 위한 안전장치
      tStop = timers.set(() => {
        tStop = null;
        finish();
      }, lim.stopWaitMs);
    } else {
      finish();
    }
    return true;
  }

  // ------------ 밖에서 쓰는 함수
  function start() {
    if (!SR) {
      error = "unsupported";
      emit();
      return false;
    }
    if (state !== "idle" || disposed) return false;
    buf.clear();
    interim = "";
    error = "";
    reason = "";
    gaps = 0;
    hidden = false;
    quickEnds = 0;
    netFails = 0;
    startFails = 0;
    startedAt = now();
    endedAt = 0;
    state = "listening";
    rec = makeRec();
    watchVisibility(true);
    requestWake();
    tMax = timers.set(() => {
      tMax = null;
      stopInternal("max");
    }, maxMs);
    launch();
    emit();
    return true;
  }

  function stop() {
    return stopInternal("user");
  }

  // 화면을 떠날 때: 더 이상 알리지 않고 모두 정리한다
  function dispose() {
    disposed = true;
    const old = rec;
    rec = null;
    if (old) {
      old.onresult = null;
      old.onerror = null;
      old.onend = null;
      try {
        old.abort && old.abort();
      } catch {
        // 무시
      }
    }
    state = "idle";
    cleanup();
  }

  return { supported: !!SR, start, stop, dispose, snapshot };
}
