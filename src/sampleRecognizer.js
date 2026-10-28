// 용어 DB의 "음성 샘플로 인식 점검하기"가 브라우저의 소리·음성 인식 기능을 다루는 곳.
//  - 녹음 파일 열기(decodeAudio), 한 구간 들려주기(playSegment)
//  - 한 구간의 소리를 크롬 음성 인식(Web Speech API)에 마이크 대신 넣어 "크롬이 어떻게 듣는지" 알아보기(startRecognition)
//
// 파일의 소리를 인식기에 넣으려면 SpeechRecognition.start(MediaStreamTrack)을 쓴다. 이 방식은 데스크톱 크롬 135부터 되고
// (Chrome 135 릴리스 노트의 "Add MediaStreamTrack support to the Web Speech API", 안드로이드 크롬은 아직 안 됨),
// 지원하지 않는 브라우저에서 start(트랙)을 부르면 트랙을 무시하고 마이크를 켜 버리므로, 부르기 전에 브라우저를 먼저 가려낸다(trackRecognitionSupported).
// 소리는 화면의 스피커로 나가지 않고 Web Audio의 MediaStreamDestination 트랙으로만 들어간다(소음 없이 조용히 점검된다).
import { cleanTermText } from "./voice.js";

function speechCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function audioCtor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

// 녹음 파일을 열고 재생하는 일은 대부분의 브라우저에서 되지만, 자동 인식은 데스크톱 크롬(135 이상)에서만 쓴다.
// (엣지·오페라는 크롬과 같은 방식이어도 인식 엔진이 달라서 "크롬이 어떻게 듣는지"를 보여 주지 못하므로 쓰지 않는다)
export const MIN_CHROME_FOR_TRACK = 135;

export function audioSupported() {
  return !!audioCtor();
}

export function trackRecognitionSupported() {
  const SR = speechCtor();
  const AC = audioCtor();
  if (!SR || !AC || typeof AC.prototype.createMediaStreamDestination !== "function") return false;
  const ua = String((typeof navigator !== "undefined" && navigator.userAgent) || "");
  const m = ua.match(/Chrome\/(\d+)/);
  if (!m || Number(m[1]) < MIN_CHROME_FOR_TRACK) return false;
  if (/Edg\/|OPR\/|SamsungBrowser|Android|Mobile|CriOS|FxiOS/i.test(ua)) return false;
  return true;
}

export function createAudioContext() {
  const AC = audioCtor();
  if (!AC) throw Object.assign(new Error("이 브라우저에서는 녹음을 열 수 없어요."), { code: "sample/no-audio" });
  try {
    return new AC({ sampleRate: 16000 }); // 말소리는 16kHz면 충분하고, 열린 녹음이 차지하는 메모리도 줄어든다
  } catch {
    return new AC();
  }
}

export function closeAudioContext(ctx) {
  try {
    if (ctx && ctx.state !== "closed") {
      const p = ctx.close();
      if (p && typeof p.catch === "function") p.catch(() => {}); // 이미 닫는 중이면 약속이 실패하는데, 화면에는 영향이 없다
    }
  } catch {
    // 닫지 못해도 화면에는 영향이 없다.
  }
}

// 멈춰 있는 소리 장치를 켠다. 사용자가 화면을 누른 뒤에야 켜지는 브라우저가 있어서 재생·인식 직전에 부른다. 켜지 못해도 던지지 않는다(이어지는 단계가 이유를 알려 준다).
export async function resumeAudioContext(ctx) {
  try {
    if (ctx && ctx.state === "suspended") await ctx.resume();
  } catch {
    // 켜지 못해도 아래 단계에서 알려 준다.
  }
}

function decode(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject); // 오래된 브라우저는 콜백 방식
      if (p && typeof p.then === "function") p.then(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

// 파일 내용(ArrayBuffer 또는 Uint8Array)을 열어 소리 값으로 바꾼다.
// 돌려주는 값: { buffer(재생·인식용 AudioBuffer), samples(한 채널로 합친 Float32Array), sampleRate, duration(초) }. 열 수 없는 파일이면 던진다(code "sample/undecodable").
export async function decodeAudio(ctx, data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); // decodeAudioData가 넘겨 준 버퍼를 비워 버리므로 복사본을 넘긴다
  let buffer;
  try {
    buffer = await decode(ctx, copy);
  } catch {
    throw Object.assign(new Error("이 파일은 열 수 없어요."), { code: "sample/undecodable" });
  }
  const channels = buffer.numberOfChannels;
  let samples;
  if (channels === 1) {
    samples = buffer.getChannelData(0);
  } else {
    samples = new Float32Array(buffer.length);
    for (let c = 0; c < channels; c += 1) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i += 1) samples[i] += d[i] / channels;
    }
  }
  return { buffer, samples, sampleRate: buffer.sampleRate, duration: buffer.duration };
}

// 한 구간을 스피커로 들려준다. 돌려주는 값의 stop()으로 멈춘다. 끝까지 재생되면 onEnd를 부른다.
export function playSegment(ctx, buffer, start, end, onEnd) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  let done = false;
  src.onended = () => {
    if (done) return;
    done = true;
    if (onEnd) onEnd();
  };
  src.start(0, Math.max(0, start), Math.max(0.05, end - start));
  return {
    stop() {
      done = true;
      src.onended = null;
      try {
        src.stop();
      } catch {
        // 이미 끝난 소리를 또 멈추려 해도 괜찮다.
      }
    },
  };
}

// 인식 오류 중 "다음 구간도 똑같이 실패할" 것들 - 만나면 점검을 멈추고 이유를 알려 준다.
const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "network", "language-not-supported", "audio-capture"]);

export function isFatalRecognitionError(code) {
  return FATAL_ERRORS.has(code);
}

export const RECOGNITION_ERROR_TEXT = {
  "not-allowed": "이 브라우저에서 음성 인식이 허용되지 않았어요. 주소창의 사이트 설정에서 마이크·음성 권한을 확인해 주세요.",
  "service-not-allowed": "이 브라우저에서 음성 인식 서비스를 쓸 수 없어요. 크롬의 설정을 확인해 주세요.",
  network: "음성 인식 서버에 연결하지 못했어요. 크롬 음성 인식은 인터넷이 필요해요. 연결을 확인해 주세요.",
  "language-not-supported": "이 브라우저는 한국어 음성 인식을 지원하지 않아요.",
  "audio-capture": "소리를 인식기에 넘기지 못했어요. 다시 시도해 주세요.",
  "start-failed": "음성 인식을 시작하지 못했어요. 이 크롬 버전에서는 녹음 파일 인식을 지원하지 않을 수 있어요.",
  timeout: "인식 결과가 오지 않아 넘어갔어요.",
};

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const a of list) {
    const text = cleanTermText(a && a.text);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ text, confidence: typeof a.confidence === "number" ? a.confidence : null });
  }
  return out;
}

// 한 구간의 소리를 크롬 음성 인식에 넣고 들은 말 후보들을 받아 온다.
// 돌려주는 값: { promise, cancel }. promise는 항상 끝난다 → { alternatives: [{ text, confidence }], error: ""(없음) | 오류 코드, cancelled?: true }
//   opts: lang(기본 ko-KR), alternatives(받을 후보 수, 기본 5)
export function startRecognition(ctx, buffer, start, end, opts = {}) {
  const SR = speechCtor();
  const lang = opts.lang || "ko-KR";
  const maxAlt = opts.alternatives || 5;
  let cancel = () => {};
  const promise = new Promise((resolve) => {
    const timers = [];
    let rec = null;
    let src = null;
    let finished = false;
    let alts = [];
    let error = "";
    const later = (fn, ms) => {
      timers.push(setTimeout(fn, ms));
    };
    const finish = (extra = {}) => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      if (src) {
        try {
          src.onended = null;
          src.stop();
        } catch {
          // 이미 끝난 소리는 멈출 필요가 없다.
        }
        try {
          src.disconnect();
        } catch {
          // 연결이 이미 풀렸어도 괜찮다.
        }
      }
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.onaudiostart = null;
        try {
          rec.abort();
        } catch {
          // 이미 끝난 인식기를 또 멈추려 해도 괜찮다.
        }
      }
      const list = dedupe(alts);
      resolve({ alternatives: list, error: list.length ? "" : error, ...extra });
    };
    cancel = () => finish({ cancelled: true });

    try {
      if (!SR) throw new Error("no-speech-api");
      const dest = ctx.createMediaStreamDestination();
      const track = dest.stream.getAudioTracks()[0];
      rec = new SR();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = maxAlt;
      rec.onresult = (ev) => {
        const first = ev && ev.results && ev.results[0];
        if (!first) return;
        for (let i = 0; i < first.length; i += 1) alts.push({ text: first[i].transcript, confidence: first[i].confidence });
      };
      rec.onerror = (ev) => {
        error = (ev && ev.error) || "error";
      };
      rec.onend = () => finish();

      let fed = false;
      const feed = () => {
        if (fed || finished) return;
        fed = true;
        src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(dest);
        src.onended = () => {
          // 소리를 다 넣었다. 인식기가 끝을 알아채길 잠깐 기다리고, 안 끝나면 멈추게 한다.
          later(() => {
            try {
              rec.stop();
            } catch {
              // 이미 끝난 인식기
            }
            later(() => finish({ error: alts.length ? "" : error || "timeout" }), 2500);
          }, 1800);
        };
        src.start(0, Math.max(0, start), Math.max(0.05, end - start));
      };
      rec.onaudiostart = () => later(feed, 250); // 인식기가 소리를 받을 준비가 된 뒤에 소리를 넣는다(말머리가 잘리지 않게)
      later(feed, 1500); // audiostart 신호가 오지 않아도 시작한다
      later(() => finish({ error: alts.length ? "" : error || "timeout" }), (end - start) * 1000 + 15000);
      rec.start(track);
    } catch {
      finish({ error: "start-failed" });
    }
  });
  return { promise, cancel: () => cancel() };
}
