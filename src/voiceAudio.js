// 음성 검측 기록에 곁들이는 "실제 녹음 소리" 도우미.
//   - startVoiceCapture(): 말하는 동안 마이크로 소리를 함께 녹음한다(MediaRecorder). 글로 바꾸는 음성 인식(Web Speech)은 소리를 남기지 않기 때문에 따로 녹음한다.
//   - 소리는 "곁들이는" 것이다: 녹음이 안 되거나 비어 있어도 글 기록은 그대로 저장된다. 그래서 이 함수들은 어떤 경우에도 던지지 않고, 결과로 이유를 알려 준다.
//   - 일부 휴대폰(특히 안드로이드)은 음성 인식과 녹음이 마이크를 함께 쓰지 못해, 소리가 비거나 인식이 안 될 수 있다. 소리가 비어 있으면(디코딩해서 확인) 저장하지 않는다.
//   - canShareMicWithRecognition(): PC의 Chrome·Edge(135 이상)는 음성 인식에 마이크 소리(트랙)를 넘겨줄 수 있어서, 마이크를 한 번만 열어 인식과 녹음이 같은 소리를 나눠 쓴다(서로 방해하지 않는다).
//     startVoiceCapture({ onMic })가 그 소리를 넘겨준다. 휴대폰 브라우저는 아직 이 기능이 없어 예전처럼 마이크를 따로 연다.
//   - loadVoiceAudio(): 저장해 둔 소리를 한 번만 읽어 와 보관한다(목록 문서에는 소리를 싣지 않아 목록이 가볍다).
// 저장 방식은 QR 기록판의 음성과 같다: Storage 없이 base64 문자열로 Firestore 문서(voiceAudio/{보고 id})에 담는다(api.js saveVoiceAudio).
import { canRecordAudio, pickAudioMime, blobToDataUrl } from "./qrMedia.js";
import { QR_LIMITS } from "./qr.js";
import { fetchVoiceAudio } from "./api.js";

export { canRecordAudio };

export const VOICE_AUDIO = {
  maxSec: QR_LIMITS.audioMaxSec, // 한 번에 녹음할 수 있는 최대 길이(초)
  bitsPerSecond: QR_LIMITS.audioBitsPerSecond, // 낮은 비트레이트로 녹음해 용량을 줄인다(20초 ≈ 60KB)
  maxRawBytes: QR_LIMITS.audioMaxRawBytes, // 녹음 원본 최대 용량
  silentPeak: 0.004, // 디코딩한 소리의 가장 큰 값(0~1)이 이보다 작으면 '빈 소리'로 본다
  finishWaitMs: 6000, // 말이 끝난 뒤 소리를 마무리하기까지 기다려 주는 최대 시간
};

// 녹음 결과의 이유 → 안내 문구 키. 빈 글이면 안내할 것이 없다(우리가 일부러 취소한 경우).
export function audioNoteKey(reason) {
  switch (reason) {
    case "denied":
      return "voice.audio.note.denied";
    case "busy":
      return "voice.audio.note.busy";
    case "silent":
      return "voice.audio.note.silent";
    case "toobig":
      return "voice.audio.note.tooBig";
    case "cancelled":
      return "";
    default:
      return "voice.audio.note.failed";
  }
}

// getUserMedia가 거절된 이유 → 우리 쪽 이유 이름
function reasonOfError(err) {
  const name = err && err.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  // 마이크를 다른 곳(음성 인식 등)이 쓰고 있어 열지 못한 경우
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "unsupported";
}

// 음성 인식과 녹음이 마이크 소리 하나를 나눠 쓸 수 있는 브라우저인지.
// 음성 인식(SpeechRecognition.start)이 마이크 트랙을 넘겨받을 수 있으면, 마이크를 한 번만 열고 그 소리를 인식과 녹음이 함께 쓴다 -
// 마이크를 두 번 여는 것이 아니라서 서로 방해하지 않는다. 이 기능은 PC(데스크톱)의 Chrome·Edge 135부터 있고, 안드로이드 크롬·삼성 인터넷·웹뷰·사파리·아이폰에는 아직 없다(MDN 호환표).
// 쓸 수 있는지 미리 물어볼 공식 방법이 없어서(마이크를 여는 시험은 휴대폰에서 소리·권한 창을 띄운다) 브라우저 종류와 버전으로 판단한다.
// 알 수 없거나 애매하면 false - 그러면 예전처럼 마이크를 따로 연다.
export const SHARED_MIC_MIN_CHROMIUM = 135;

export function canShareMicWithRecognition() {
  try {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) return false;
    const data = navigator.userAgentData;
    if (data && Array.isArray(data.brands)) {
      if (data.mobile) return false;
      return data.brands.some((b) => /^(Chromium|Google Chrome|Microsoft Edge)$/.test(String(b.brand)) && Number(b.version) >= SHARED_MIC_MIN_CHROMIUM);
    }
    const ua = String(navigator.userAgent || "");
    if (/Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS|EdgiOS|SamsungBrowser/i.test(ua)) return false;
    const m = ua.match(/\b(?:Chrome|Edg)\/(\d+)/);
    return !!m && Number(m[1]) >= SHARED_MIC_MIN_CHROMIUM;
  } catch {
    return false;
  }
}

// 녹음한 소리를 디코딩해 가장 큰 값(peak)과 길이를 구한다. OfflineAudioContext는 소리를 내보내지 않아 기기의 오디오 설정을 건드리지 않는다.
// 디코딩할 수 없는 형식이면 null(= 판단하지 않고 그대로 저장한다).
async function measureLevel(blob) {
  try {
    const Offline = typeof window !== "undefined" ? window.OfflineAudioContext || window.webkitOfflineAudioContext : undefined;
    if (!Offline || typeof blob.arrayBuffer !== "function") return null;
    let ctx;
    try {
      ctx = new Offline(1, 1, 16000);
    } catch {
      ctx = new Offline(1, 1, 44100);
    }
    const buffer = await blob.arrayBuffer();
    const audio = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(buffer, resolve, reject);
      if (p && typeof p.then === "function") p.then(resolve, reject);
    });
    const data = audio.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    return { peak, duration: audio.duration };
  } catch {
    return null;
  }
}

// 말하는 동안 소리를 녹음한다. 곧바로 { finish(), cancel() }을 돌려주고(마이크는 뒤에서 열린다), 어떤 경우에도 던지지 않는다.
//   finish(): 말이 끝났을 때 부른다. 약속(Promise)을 돌려주고, 결과는
//             { ok: true, clip: { dataUrl, sec, bytes, peak, auto } } 또는 { ok: false, reason }
//             reason: denied(마이크 허용 안 함) · busy(마이크를 다른 곳이 씀) · unsupported · silent(빈 소리) · toobig · empty · late · timeout · error · cancelled
//   cancel(): 녹음을 버리고 마이크를 놓는다.
// options.onMic(track): 마이크가 열려 녹음이 시작되면 그 소리 트랙으로, 마이크를 열지 못했으면 null로 딱 한 번 부른다(부르는 즉시가 아니라 한 박자 뒤에).
//   음성 인식이 이 트랙을 넘겨받게 하려는 쪽(canShareMicWithRecognition)이 쓴다. cancel()한 뒤나 마이크가 열리기 전에 finish()한 뒤에는 부르지 않는다.
export function startVoiceCapture(options = {}) {
  const st = { phase: "starting", wantStop: false, cancelled: false };
  let micReported = false;
  const reportMic = (track) => {
    if (micReported || typeof options.onMic !== "function") return;
    micReported = true;
    Promise.resolve().then(() => {
      if (st.cancelled) return; // 그 사이 취소됐으면 알릴 필요가 없다
      try {
        options.onMic(track);
      } catch {
        // 부른 쪽의 오류가 녹음을 깨뜨리지 않게 한다
      }
    });
  };
  const chunks = [];
  let bytes = 0;
  let stream = null;
  let recorder = null;
  let mime = "";
  let startedAt = 0;
  let timer = null;
  let auto = false;
  let done = false;
  let resolveOutcome;
  const outcome = new Promise((resolve) => {
    resolveOutcome = resolve;
  });
  const settle = (value) => {
    if (done) return;
    done = true;
    resolveOutcome(value);
  };
  const release = () => {
    clearInterval(timer);
    if (stream) {
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // 이미 멈춘 마이크면 무시
      }
      stream = null;
    }
  };
  const stopRecorder = () => {
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      release();
      settle({ ok: false, reason: "error" });
    }
  };

  // 녹음이 멈춘 뒤: 조각을 합치고, 비어 있는지 확인하고, 저장할 글자(data URL)로 바꾼다.
  const finalize = async () => {
    st.phase = "done";
    release();
    if (st.cancelled) {
      settle({ ok: false, reason: "cancelled" });
      return;
    }
    const type = (recorder && recorder.mimeType) || mime || "audio/webm";
    const blob = new Blob(chunks, { type });
    if (blob.size === 0) {
      settle({ ok: false, reason: "empty" });
      return;
    }
    if (blob.size > VOICE_AUDIO.maxRawBytes * 1.1) {
      settle({ ok: false, reason: "toobig" });
      return;
    }
    const level = await measureLevel(blob);
    if (level && level.peak < VOICE_AUDIO.silentPeak) {
      settle({ ok: false, reason: "silent", peak: level.peak });
      return;
    }
    const elapsed = (Date.now() - startedAt) / 1000;
    const length = level && Number.isFinite(level.duration) && level.duration > 0 ? level.duration : elapsed;
    const sec = Math.min(VOICE_AUDIO.maxSec, Math.max(1, Math.round(length)));
    try {
      const dataUrl = await blobToDataUrl(blob);
      settle({ ok: true, clip: { dataUrl, sec, bytes: blob.size, peak: level ? level.peak : null, auto } });
    } catch {
      settle({ ok: false, reason: "error" });
    }
  };

  (async () => {
    if (!canRecordAudio()) {
      settle({ ok: false, reason: "unsupported" });
      reportMic(null);
      return;
    }
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      st.phase = "done";
      settle({ ok: false, reason: reasonOfError(err) });
      reportMic(null);
      return;
    }
    // 마이크가 열리기 전에 말이 끝났거나 취소됐으면 바로 놓는다(녹음할 소리가 없다).
    if (st.cancelled || st.wantStop) {
      st.phase = "done";
      try {
        s.getTracks().forEach((track) => track.stop());
      } catch {
        // 무시
      }
      settle({ ok: false, reason: st.cancelled ? "cancelled" : "late" });
      return;
    }
    stream = s;
    mime = pickAudioMime();
    try {
      recorder = new window.MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: VOICE_AUDIO.bitsPerSecond });
    } catch {
      try {
        recorder = new window.MediaRecorder(s);
      } catch {
        st.phase = "done";
        release();
        settle({ ok: false, reason: "unsupported" });
        reportMic(null);
        return;
      }
    }
    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      chunks.push(e.data);
      bytes += e.data.size;
      // 비트레이트 설정이 무시되는 기기에서도 용량 한도를 넘지 않도록, 한도에 닿으면 자동으로 멈춘다.
      if (bytes >= VOICE_AUDIO.maxRawBytes) {
        auto = true;
        stopRecorder();
      }
    };
    recorder.onerror = () => {
      st.phase = "done";
      release();
      settle({ ok: false, reason: "error" });
    };
    recorder.onstop = () => {
      finalize();
    };
    try {
      startedAt = Date.now();
      recorder.start(1000); // 1초마다 조각을 받아 용량을 확인한다
      st.phase = "recording";
    } catch {
      st.phase = "done";
      release();
      settle({ ok: false, reason: "error" });
      reportMic(null);
      return;
    }
    timer = setInterval(() => {
      if (Date.now() - startedAt >= VOICE_AUDIO.maxSec * 1000) {
        auto = true;
        stopRecorder();
      }
    }, 500);
    // 녹음이 시작됐다 - 음성 인식이 이 마이크 소리를 넘겨받을 수 있게 알린다(트랙이 없으면 null).
    let micTrack = null;
    try {
      micTrack = s.getAudioTracks()[0] || null;
    } catch {
      micTrack = null;
    }
    reportMic(micTrack);
  })();

  return {
    finish() {
      st.wantStop = true;
      if (st.phase === "recording") stopRecorder();
      let wait;
      const limit = new Promise((resolve) => {
        wait = setTimeout(() => resolve({ ok: false, reason: "timeout" }), VOICE_AUDIO.finishWaitMs);
      });
      return Promise.race([outcome, limit]).finally(() => clearTimeout(wait));
    },
    cancel() {
      st.cancelled = true;
      st.wantStop = true;
      clearInterval(timer);
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          // 이미 멈춘 상태면 무시
        }
      }
      release();
      settle({ ok: false, reason: "cancelled" });
    },
  };
}

// ---------------- 저장한 소리 불러오기(보관) ----------------
// 목록에는 소리가 없고(hasAudio·audioSec만 있다), 듣기를 누를 때 이 함수로 한 번만 읽어 온다. 방금 저장한 소리는 primeVoiceAudio로 미리 넣어 두어 다시 읽지 않는다.
const audioCache = new Map();

export function loadVoiceAudio(reportId) {
  if (!audioCache.has(reportId)) {
    const promise = fetchVoiceAudio(reportId).catch((err) => {
      audioCache.delete(reportId); // 실패한 결과는 보관하지 않아 다시 시도할 수 있게 한다
      throw err;
    });
    audioCache.set(reportId, promise);
  }
  return audioCache.get(reportId);
}

export function primeVoiceAudio(reportId, clip) {
  audioCache.set(reportId, Promise.resolve({ audio: clip.dataUrl, sec: clip.sec }));
}

export function forgetVoiceAudio(reportId) {
  audioCache.delete(reportId);
}
