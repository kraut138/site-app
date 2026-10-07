// QR 기록판에서 쓰는 브라우저 미디어 도우미: 사진 용량 줄이기, 마이크 녹음 지원 확인, 음성 변환, 불러온 사진·음성 캐시.
import { compressImage, fetchQrMedia } from "./api.js";
import { QR_LIMITS } from "./qr.js";

// ---------------- 사진 ----------------

// 사진 원본(full)은 Firestore 문서 한도 안에 들어올 때까지 점점 더 줄이고, 목록에 쓸 작은 미리보기(thumb)를 따로 만든다.
const IMAGE_STEPS = [
  [1000, 0.65],
  [900, 0.55],
  [800, 0.5],
  [640, 0.45],
  [480, 0.4],
];

export async function imageToBudget(file) {
  let full = null;
  for (const [size, quality] of IMAGE_STEPS) {
    full = await compressImage(file, size, quality);
    if (full.length <= QR_LIMITS.imageMaxChars) break;
  }
  if (!full || full.length > QR_LIMITS.imageMaxChars) throw new Error("image too large");
  const thumb = await compressImage(file, 240, 0.55);
  return { full, thumb };
}

// ---------------- 음성 ----------------

// 마이크 녹음(MediaRecorder)을 쓸 수 있는 브라우저인지. 카카오톡·네이버 같은 앱 안의 브라우저는 지원하지 않는 경우가 있다.
export function canRecordAudio() {
  return (
    typeof window !== "undefined" &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
    typeof window.MediaRecorder !== "undefined"
  );
}

// 다른 기기(특히 아이폰)에서도 재생되도록 mp4(AAC)를 먼저 고르고, 안 되면 webm/ogg를 쓴다.
const AUDIO_MIME_CANDIDATES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export function pickAudioMime() {
  const MR = typeof window !== "undefined" ? window.MediaRecorder : undefined;
  if (!MR || typeof MR.isTypeSupported !== "function") return "";
  return AUDIO_MIME_CANDIDATES.find((m) => MR.isTypeSupported(m)) || "";
}

// data:audio/webm;codecs=opus;base64,... -> data:audio/webm;base64,...  (재생 호환성을 위해 codecs 같은 부가 정보는 뺀다)
export function normalizeDataUrl(url) {
  return url.replace(/^data:([^;,]+)(?:;[^;,]*)*?;base64,/, "data:$1;base64,");
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => resolve(normalizeDataUrl(String(reader.result)));
    reader.readAsDataURL(blob);
  });
}

const AUDIO_EXT_MIME = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  webm: "audio/webm",
  amr: "audio/amr",
  "3gp": "audio/3gpp",
};

function probeDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = new Audio();
    let finished = false;
    const done = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(0), 3000);
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : 0);
    el.onerror = () => done(0);
    el.src = url;
  });
}

// 마이크로 바로 녹음할 수 없을 때를 위한 대안: 이미 녹음해 둔 음성 파일을 골라 올린다(용량 한도 안에서만).
export async function audioFileToData(file) {
  if (file.size > QR_LIMITS.audioMaxRawBytes) {
    const err = new Error("audio too large");
    err.code = "qr/audio-too-big";
    throw err;
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const type = AUDIO_EXT_MIME[ext] || (file.type && file.type.startsWith("audio/") ? file.type : "audio/mpeg");
  const blob = new Blob([file], { type });
  const data = await blobToDataUrl(blob);
  const sec = await probeDuration(blob);
  return { data, sec };
}

// ---------------- 사진 원본·음성 불러오기(캐시) ----------------
// 목록에는 미리보기만 있으므로, 사진을 크게 보거나 음성을 재생할 때 이 함수로 원본을 한 번만 읽어온다.
const mediaCache = new Map();

export function loadQrMedia(entryId) {
  if (!mediaCache.has(entryId)) {
    const promise = fetchQrMedia(entryId).catch((err) => {
      mediaCache.delete(entryId); // 실패한 결과는 캐시하지 않아 다시 시도할 수 있게 한다
      throw err;
    });
    mediaCache.set(entryId, promise);
  }
  return mediaCache.get(entryId);
}

export function forgetQrMedia(entryId) {
  mediaCache.delete(entryId);
}
