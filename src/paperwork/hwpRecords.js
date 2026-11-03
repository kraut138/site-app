// 한글 5.0 본문(Section) 스트림은 "레코드"를 이어 붙인 것이다. 레코드 하나 = 4바이트 머리말 + 내용.
//   머리말(32비트, 낮은 자리부터): 종류(tag) 10비트 · 깊이(level) 10비트 · 크기 12비트(0xFFF이면 바로 뒤 4바이트가 진짜 크기)
// 문단은 PARA_HEADER(글자 수·줄 수 등) → PARA_TEXT(글) → PARA_CHAR_SHAPE(글자 모양 위치) → PARA_LINE_SEG(줄 배치) 레코드 묶음이다.
// 여기에는 레코드를 읽고 다시 쓰는 일, UTF-16 글자 변환, 칸 폭에 맞춘 줄 나누기만 둔다.

export const TAG = {
  PARA_HEADER: 66,
  PARA_TEXT: 67,
  PARA_CHAR_SHAPE: 68,
  PARA_LINE_SEG: 69,
  CTRL_HEADER: 71,
  LIST_HEADER: 72,
  TABLE: 77,
};

export function u16(b, o) {
  return b[o] | (b[o + 1] << 8);
}
export function u32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
export function i32(b, o) {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
}
export function put16(b, o, v) {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
}
export function put32(b, o, v) {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
  b[o + 2] = (v >>> 16) & 0xff;
  b[o + 3] = (v >>> 24) & 0xff;
}

export function parseRecords(buf) {
  const recs = [];
  let i = 0;
  while (i < buf.length) {
    if (i + 4 > buf.length) throw new Error("한글 본문이 손상되었습니다(레코드 머리말).");
    const h = u32(buf, i);
    i += 4;
    const tag = h & 0x3ff;
    const level = (h >>> 10) & 0x3ff;
    let size = h >>> 20;
    if (size === 0xfff) {
      if (i + 4 > buf.length) throw new Error("한글 본문이 손상되었습니다(레코드 크기).");
      size = u32(buf, i);
      i += 4;
    }
    if (i + size > buf.length) throw new Error("한글 본문이 손상되었습니다(레코드가 끝을 넘음).");
    recs.push({ tag, level, data: buf.slice(i, i + size) });
    i += size;
  }
  return recs;
}

export function serializeRecords(recs) {
  let total = 0;
  for (const r of recs) total += (r.data.length >= 0xfff ? 8 : 4) + r.data.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const r of recs) {
    const big = r.data.length >= 0xfff;
    put32(out, o, ((big ? 0xfff : r.data.length) << 20) | (r.level << 10) | r.tag);
    o += 4;
    if (big) {
      put32(out, o, r.data.length);
      o += 4;
    }
    out.set(r.data, o);
    o += r.data.length;
  }
  return out;
}

// ---------------------------------------------------------------- 글자(UTF-16LE)

export function utf16Decode(bytes) {
  let s = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  return s;
}

export function utf16Encode(str) {
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i += 1) put16(out, i * 2, str.charCodeAt(i));
  return out;
}

// 본문 칸에 넣을 글에서 한글이 줄 바꿈으로 다루지 못하는 제어 글자를 없애고, 줄 바꿈은 \n 하나로 맞춘다.
export function cleanCellText(value) {
  return String(value == null ? "" : value)
    .replace(/\r\n?|\u2028|\u2029/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/^\s+|\s+$/g, "");
}

// ---------------------------------------------------------------- 칸 폭에 맞춘 줄 나누기

// 10pt 글자 하나의 폭 어림값(한글 한 글자 = 1000). 실제 글꼴보다 조금 넓게 잡아서, 우리가 나눈 줄이 한글에서 더 넘치지 않게 한다.
export function charUnits(ch) {
  const c = ch.charCodeAt(0);
  if (c === 0x20) return 420;
  if (c >= 0x30 && c <= 0x39) return 580;
  if (c < 0x80) {
    if (".,:;'|!`".includes(ch)) return 400;
    if (c >= 0x41 && c <= 0x5a) return 740;
    if ("mwMW@%".includes(ch)) return 860;
    return 620;
  }
  if (c >= 0xff61 && c <= 0xff9f) return 520;
  return 1000;
}

function widthOf(str, size) {
  let w = 0;
  for (const ch of str) w += (charUnits(ch) * size) / 1000;
  return w;
}

// text(\n은 줄 바꿈)를 폭(한글 단위, 10pt=1000) 안에 들어가게 나눈다. 최대 maxLines줄까지만 담고, 넘치면 마지막 줄을 "…"로 끝낸다.
// 반환: { lines: [...], truncated }
export function wrapLines(text, width, maxLines, size = 1000) {
  const limit = width * 0.94;
  const out = [];
  for (const logical of String(text).split("\n")) {
    let rest = logical.replace(/\s+$/g, "");
    if (!rest) {
      out.push("");
      continue;
    }
    while (rest) {
      if (widthOf(rest, size) <= limit) {
        out.push(rest);
        break;
      }
      // 한 줄에 들어가는 만큼 자르되, 가능하면 공백에서 끊는다
      let w = 0;
      let cut = 0;
      const chars = Array.from(rest);
      let lastSpace = -1;
      for (let i = 0; i < chars.length; i += 1) {
        const cw = (charUnits(chars[i]) * size) / 1000;
        if (w + cw > limit) break;
        w += cw;
        cut = i + 1;
        if (chars[i] === " ") lastSpace = i;
      }
      if (cut === 0) cut = 1;
      // 공백에서 끊을 수 있고, 그렇게 해도 줄이 너무 짧아지지 않으면(절반 이상 채움) 공백에서 끊는다
      if (lastSpace > 0 && cut < chars.length && lastSpace >= cut * 0.5) cut = lastSpace + 1;
      out.push(chars.slice(0, cut).join("").replace(/\s+$/g, ""));
      rest = chars.slice(cut).join("").replace(/^\s+/g, "");
    }
  }
  if (out.length <= maxLines) return { lines: out, truncated: false };
  const lines = out.slice(0, maxLines);
  let last = Array.from(lines[maxLines - 1]);
  while (last.length && widthOf(last.join("") + "…", size) > limit) last.pop();
  lines[maxLines - 1] = last.join("").replace(/\s+$/g, "") + "…";
  return { lines, truncated: true };
}
