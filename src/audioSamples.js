// 용어 DB의 "음성 샘플로 인식 점검하기"가 쓰는 계산 모음. 화면·저장소와 상관없는 순수한 함수만 들어 있다(브라우저 오디오는 sampleRecognizer.js).
//
// 하는 일
//  - 올린 녹음 파일이 올려도 되는 파일인지 보기(checkSampleFile)
//  - 녹음에서 말한 구간을 쉬는 부분 기준으로 나누기(splitSpeech)
//  - 크롬이 들은 말을 지금 용어 표로 바꿔 보고 "정답"과 같은지 가리기(judgeHeard)
//  - 녹음 파일을 Firestore 문서 한도(1MiB)에 맞게 조각으로 나누고 다시 붙이기(splitIntoChunks / joinChunks)
import { GLOSSARY_LIMITS, applyGlossary, cleanTermText, slangKey } from "./voice.js";

export const SAMPLE_LIMITS = {
  maxFiles: 5, // 올릴 수 있는 녹음 파일 수
  maxBytes: 4 * 1024 * 1024, // 파일 하나의 최대 크기. Storage 없이(무료 Spark 요금제) Firestore 문서에 조각으로 나눠 담기 때문에 작게 잡았다
  chunkBytes: 600 * 1024, // 문서 하나(최대 1MiB)에 담을 조각 크기. base64로 바꾸면 약 800KB가 된다
  maxSeconds: 480, // 녹음 길이 최대 8분
  maxSegments: 120, // 파일 하나에서 나눌 수 있는 말 구간 수
  labelMax: GLOSSARY_LIMITS.standard, // 정답(표준 용어) 최대 글자 수 - 용어 표와 같다
  nameMax: 80, // 파일 이름 최대 글자 수(저장할 때 잘라 둔다)
};

const AUDIO_EXT = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "webm", "flac", "mp4", "3gp", "amr"];
export const SAMPLE_ACCEPT = "audio/*," + AUDIO_EXT.map((e) => "." + e).join(",");

const MIME_BY_EXT = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  mp4: "audio/mp4",
  "3gp": "audio/3gpp",
  amr: "audio/amr",
};

const MB = 1024 * 1024;

// 화면에 보여 줄 안내 문구(관리자 화면은 한국어만 쓴다). checkSampleFile·저장소가 돌려주는 이유 코드와 짝이다.
export const SAMPLE_MESSAGES = {
  full: `녹음 파일은 ${SAMPLE_LIMITS.maxFiles}개까지 올릴 수 있어요. 안 쓰는 파일을 지운 뒤 올려 주세요.`,
  empty: "비어 있는 파일이에요.",
  "too-big": `파일이 너무 커요. ${SAMPLE_LIMITS.maxBytes / MB}MB 이하로 올려 주세요. (m4a·mp3로 저장하면 훨씬 작아져요)`,
  "not-audio": "녹음 파일(mp3·m4a·wav·ogg·webm 등)이 아니에요.",
  "too-long": `녹음이 너무 길어요. ${SAMPLE_LIMITS.maxSeconds / 60}분 이하로 나눠서 올려 주세요.`,
  silent: "말소리를 찾지 못했어요. 소리가 너무 작거나 비어 있는 파일일 수 있어요.",
  "too-many": `말 구간이 ${SAMPLE_LIMITS.maxSegments}개를 넘어요. 녹음을 나눠서 올려 주세요.`,
  undecodable: "이 파일은 열 수 없어요. 다른 형식(mp3·m4a·wav)으로 저장해서 다시 올려 주세요.",
  "no-audio": "이 브라우저에서는 녹음을 열 수 없어요. 최신 크롬에서 열어 주세요.",
  "not-found": "이미 지워진 녹음이에요. 목록을 새로 불러왔어요.",
  "audio-missing": "녹음 파일의 일부를 찾지 못했어요. 이 녹음을 지우고 다시 올려 주세요.",
};

function extOf(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

// 올려도 되는 파일인지 본다. count는 지금 저장돼 있는 녹음 수. 돌려주는 값: { code: "ok" } 또는 { code: 이유 }
export function checkSampleFile(file, count) {
  if (Number(count) >= SAMPLE_LIMITS.maxFiles) return { code: "full" };
  if (!file || !file.size) return { code: "empty" };
  if (file.size > SAMPLE_LIMITS.maxBytes) return { code: "too-big" };
  const type = String(file.type || "").toLowerCase();
  const typeOk = type.startsWith("audio/") || type === "video/mp4" || type === "video/webm" || type === "application/ogg";
  if (!typeOk && !AUDIO_EXT.includes(extOf(file.name))) return { code: "not-audio" };
  return { code: "ok" };
}

// 저장해 둘 파일 형식(MIME). 브라우저가 알려 준 형식이 오디오면 그대로, 아니면 확장자로 짐작한다.
export function sampleMime(file) {
  const type = String((file && file.type) || "").toLowerCase();
  if (type.startsWith("audio/")) return type;
  return MIME_BY_EXT[extOf(file && file.name)] || "audio/mpeg";
}

export function cleanSampleName(name) {
  return cleanTermText(name).slice(0, SAMPLE_LIMITS.nameMax) || "녹음";
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v >= MB) return `${(v / MB).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(v / 1024))}KB`;
}

// 녹음 하나의 번호. 시각 + 이 화면에서 만든 차례 + 무작위 글자 (조각 문서 이름이 "<번호>_<조각 번호>"라서 밑줄(_)은 쓰지 않는다)
let idSeq = 0;
export function newSampleId() {
  idSeq = (idSeq + 1) % 1296;
  return `v${Date.now().toString(36)}${idSeq.toString(36).padStart(2, "0")}${Math.random().toString(36).slice(2, 6)}`;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// ---------------- 말 구간 나누기 ----------------
// samples: 한 채널(mono) 소리 값(Float32Array, -1~1), sampleRate: 초당 값 개수.
// 20ms 칸마다 소리 크기(RMS)를 재서 "조용한 바닥"보다 충분히 큰 칸을 말로 보고, 쉬는 길이(minSilence) 이상 조용한 곳에서 구간을 나눈다.
// 돌려주는 값: [{ start, end }](초). 앞뒤로 pad초씩 여유를 붙여 말머리·끝이 잘리지 않게 한다. 말소리가 없으면 [].
//   opts: minSilence(구간을 가르는 쉬는 길이, 기본 0.7초), pad(0.2초), minSpeech(이보다 짧은 소리는 잡음으로 버림, 0.12초), maxSegment(구간 최대 길이, 10초)
export function splitSpeech(samples, sampleRate, opts = {}) {
  const minSilence = opts.minSilence > 0 ? opts.minSilence : 0.7;
  const pad = opts.pad >= 0 ? opts.pad : 0.2;
  const minSpeech = opts.minSpeech > 0 ? opts.minSpeech : 0.12;
  const maxSegment = opts.maxSegment > 0 ? opts.maxSegment : 10;
  const frame = Math.max(1, Math.round(sampleRate * 0.02));
  const n = Math.floor(samples.length / frame);
  if (n < 2) return [];
  const step = frame / sampleRate;
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    const from = i * frame;
    for (let j = 0; j < frame; j += 1) {
      const v = samples[from + j];
      sum += v * v;
    }
    rms[i] = Math.sqrt(sum / frame);
  }
  const sorted = Float32Array.from(rms).sort();
  const at = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  const peak = at(0.98); // 큰 소리
  if (peak < 0.004) return [];
  // 조용한 바닥(배경 소음). 쉬는 칸이 거의 없는 녹음에서는 아래쪽 10%도 말소리라서 바닥이 말소리만큼 높게 잡힐 수 있으므로, 큰 소리의 1/4을 넘지 않게 눌러 둔다.
  const floor = Math.min(at(0.1), peak * 0.25);
  const threshold = Math.max(floor * 2.5, peak * 0.12, 0.003);

  const runs = [];
  let i = 0;
  while (i < n) {
    if (rms[i] <= threshold) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && rms[j] > threshold) j += 1;
    runs.push([i, j]);
    i = j;
  }
  // 짧은 쉼(말 사이의 숨·받침 사이)은 한 덩어리로 이어 붙인다
  const gapFrames = Math.max(1, Math.round(minSilence / step));
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < gapFrames) last[1] = r[1];
    else merged.push([r[0], r[1]]);
  }

  const need = Math.max(1, Math.round(minSpeech / step));
  const maxFrames = Math.max(2, Math.round(maxSegment / step));
  const total = samples.length / sampleRate;
  const pieces = [];
  for (const [a, b] of merged) {
    if (b - a < need) continue;
    let from = a;
    // 너무 긴 덩어리는 가장 조용한 곳에서 잘라 나눈다
    while (b - from > maxFrames) {
      const lo = from + Math.round(maxFrames * 0.4);
      const hi = from + maxFrames;
      let cut = lo;
      for (let k = lo; k <= hi && k < n; k += 1) if (rms[k] < rms[cut]) cut = k;
      pieces.push([from, cut]);
      from = cut + 1;
    }
    pieces.push([from, b]);
  }
  return pieces.map(([a, b]) => ({ start: round2(Math.max(0, a * step - pad)), end: round2(Math.min(total, b * step + pad)) }));
}

// 나눈 구간에 번호표(id)와 빈 정답을 붙여 저장·화면에서 쓰는 모양으로 만든다.
export function toSegments(ranges) {
  return ranges.map((r, i) => ({ id: `g${i + 1}`, start: r.start, end: r.end, label: "" }));
}

// 저장소에서 읽은 구간 목록을 그대로 믿지 않고 걸러 낸다. (시간이 거꾸로이거나 글자가 아닌 값은 버린다)
export function sanitizeSegments(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  list.forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    const start = Number(s.start);
    const end = Number(s.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return;
    let id = typeof s.id === "string" && s.id ? s.id : `g${i + 1}`;
    while (seen.has(id)) id += "_";
    seen.add(id);
    out.push({ id, start: round2(start), end: round2(end), label: cleanTermText(s.label).slice(0, SAMPLE_LIMITS.labelMax) });
  });
  return out.slice(0, SAMPLE_LIMITS.maxSegments);
}

// 저장소에서 읽은 녹음 목록을 걸러 낸다.
export function sanitizeSamples(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== "object" || typeof s.id !== "string" || !s.id || seen.has(s.id)) continue;
    const chunks = Math.floor(Number(s.chunks));
    if (!Number.isFinite(chunks) || chunks < 1) continue;
    seen.add(s.id);
    out.push({
      id: s.id,
      name: cleanSampleName(s.name),
      mime: typeof s.mime === "string" && s.mime ? s.mime : "audio/mpeg",
      size: Math.max(0, Math.floor(Number(s.size)) || 0),
      duration: Math.max(0, Number(s.duration) || 0),
      chunks,
      segments: sanitizeSegments(s.segments),
      by: cleanTermText(s.by).slice(0, 60),
      at: typeof s.at === "string" ? s.at : "",
    });
  }
  return out.slice(0, SAMPLE_LIMITS.maxFiles);
}

// ---------------- 정답 목록 채우기 ----------------
// 관리자가 "녹음한 순서대로 한 줄에 하나씩" 적은 표준 용어 목록을 줄 단위로 나눈다. 빈 줄은 그 구간을 건너뛴다는 뜻이라 자리를 지킨다.
export function parseLabelList(text) {
  const lines = String(text == null ? "" : text)
    .split(/\r?\n|\t/)
    .map((s) => cleanTermText(s).slice(0, SAMPLE_LIMITS.labelMax));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

// 구간 순서대로 정답을 채운다. 빈 줄이거나 목록이 모자란 자리는 지금 적힌 정답을 그대로 둔다.
// 돌려주는 값: { segments(새 목록), filled(채운 수), extra(남는 줄 수), missing(정답이 없는 구간 수) }
export function fillLabels(segments, text) {
  const list = parseLabelList(text);
  let filled = 0;
  const next = segments.map((s, i) => {
    if (i < list.length && list[i]) {
      filled += 1;
      return { ...s, label: list[i] };
    }
    return s;
  });
  return {
    segments: next,
    filled,
    extra: Math.max(0, list.length - segments.length),
    missing: next.filter((s) => !s.label).length,
  };
}

// ---------------- 들은 말 가리기 ----------------
// 정답과 견줄 때는 띄어쓰기·대소문자·문장부호를 무시한다.
export function compareKey(value) {
  return slangKey(value).replace(/[.,!?。、…~·]/g, "");
}

// 크롬이 들은 말 후보들(alts: 글자 또는 { text })을 지금 용어 표(terms)로 바꿔 보고 정답(label)과 견준다.
// status: "pass"(첫째 후보를 바꾼 결과에 정답이 들어 있다) | "near"(첫째는 아니지만 다른 후보를 바꾸면 정답이 된다) | "fail" | "nolabel"(정답을 아직 안 적었다) | "none"(들은 말이 없다)
// converted: 첫째 후보를 표대로 바꾼 문장, altIndex: "near"일 때 정답이 되는 후보 번호
export function judgeHeard(alts, label, terms) {
  const heard = (Array.isArray(alts) ? alts : []).map((a) => (typeof a === "string" ? a : a && a.text)).map((t) => cleanTermText(t)).filter(Boolean);
  if (heard.length === 0) return { status: "none", converted: "" };
  const converted = heard.map((h) => applyGlossary(h, terms).text);
  const want = compareKey(label);
  if (!want) return { status: "nolabel", converted: converted[0] };
  if (compareKey(converted[0]).includes(want)) return { status: "pass", converted: converted[0] };
  const altIndex = converted.findIndex((c, i) => i > 0 && compareKey(c).includes(want));
  if (altIndex > 0) return { status: "near", converted: converted[0], altIndex };
  return { status: "fail", converted: converted[0] };
}

// 구간들의 점검 결과를 세어 요약한다. results: { [구간 id]: { alternatives } }
export function summarizeResults(segments, results, terms) {
  const out = { total: segments.length, checked: 0, pass: 0, near: 0, fail: 0, nolabel: 0, none: 0 };
  for (const s of segments) {
    const r = results && results[s.id];
    if (!r) continue;
    out.checked += 1;
    out[judgeHeard(r.alternatives, s.label, terms).status] += 1;
  }
  return out;
}

// ---------------- 파일 ↔ 문서 조각 ----------------
export function bytesToBase64(u8) {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) bin += String.fromCharCode.apply(null, u8.subarray(i, i + step));
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// 파일 내용(ArrayBuffer 또는 Uint8Array)을 chunkBytes씩 잘라 base64 글자 조각들로 만든다.
export function splitIntoChunks(data, chunkBytes = SAMPLE_LIMITS.chunkBytes) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const out = [];
  for (let i = 0; i < u8.length; i += chunkBytes) out.push(bytesToBase64(u8.subarray(i, Math.min(u8.length, i + chunkBytes))));
  return out;
}

// 조각들을 이어 붙여 원래 파일 내용(Uint8Array)으로 되돌린다. 크기가 size와 다르면 조각이 빠졌거나 깨진 것이라 null.
export function joinChunks(chunks, size) {
  const parts = chunks.map((c) => base64ToBytes(c));
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  if (total !== size) return null;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
