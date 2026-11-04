// 한글(.hwp) 파일을 화면에 그려 보여 주는 "미리보기". 내려받을 파일(양식에 글을 채운 결과)을 그대로 읽어서 그리므로,
// 미리보기에 보이는 것 = 내려받아 한글에서 열었을 때의 내용이다. 서류 탭이 채우는 양식(표 한 개짜리 검측요청서)에 필요한 것만 그린다.
//   읽는 것: 쪽 크기·여백(PAGE_DEF), 글꼴 이름·글자 모양(크기·굵게·기울임·밑줄·색·자간), 문단 모양(정렬·여백·줄 간격),
//            테두리·배경(BORDER_FILL), 표(칸 위치·합치기·크기·안 여백·세로 정렬)와 칸 안의 문단
//   그리지 않는 것: 그림·도형·수식·머리말/꼬리말 같은 개체(양식에 없다). 만나면 건너뛴다.
// 읽는 쪽(parseHwpPreview)은 화면 없이 돌아가고(시험하기 쉽다), 그리는 쪽(renderHwpPreview)은 DOM 요소를 만든다(글은 textContent로만 넣어 HTML이 섞일 수 없다).
// 한양신명조·카페24 같은 글꼴은 대부분의 기기에 없어서, 고딕/명조 두 갈래로 나눠 기기에 있는 글꼴로 바꿔 보여 준다(줄 나눔·글자 폭은 한글과 조금 다를 수 있다).
import { inflateSync } from "fflate";
import { readCompound, findNode } from "./hwpContainer.js";
import { TAG, u16, u32, i32, parseRecords } from "./hwpRecords.js";

const T = { ID_MAPPINGS: 17, FACE_NAME: 19, BORDER_FILL: 20, CHAR_SHAPE: 21, PARA_SHAPE: 25, PAGE_DEF: 73 };
const PX = 96 / 7200; // 한글 단위(1/7200 인치) 하나가 화면에서 몇 px인지
const MAX_SECTIONS = 8;
const MAX_ROWS = 300; // 표의 줄·칸 수 상한: 망가진 파일의 터무니없는 값 때문에 화면이 멈추지 않게 한다(양식은 12×4)
const MAX_COLS = 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// 한글이 글자 하나로 저장하는 사설 영역 글자(한컴 전용) 중 양식에 나오는 것. 나머지 사설 글자는 글꼴이 없으면 네모로 보이므로 건너뛴다.
const PUA_TEXT = { 0xf012b: "(인)" };

// ---------------------------------------------------------------- 읽기

const sbyte = (b, o) => (b[o] << 24) >> 24;
const rgbOf = (b, o) => [b[o], b[o + 1], b[o + 2]]; // 한글 색은 R, G, B, 0 순서의 바이트

function parseFace(d) {
  const len = u16(d, 1);
  let name = "";
  for (let i = 0; i < len && 3 + i * 2 + 1 < d.length; i += 1) name += String.fromCharCode(d[3 + i * 2] | (d[4 + i * 2] << 8));
  return name;
}

function parseCharShape(d) {
  const attr = d.length >= 50 ? u32(d, 46) : 0;
  return {
    face: u16(d, 0),
    ratio: d[14] || 100,
    spacing: d.length > 21 ? sbyte(d, 21) : 0,
    rel: d[28] || 100,
    height: d.length >= 46 ? i32(d, 42) : 1000,
    italic: (attr & 1) !== 0,
    bold: (attr & 2) !== 0,
    underline: ((attr >> 2) & 3) === 1,
    strike: ((attr >> 18) & 7) !== 0,
    sup: (attr & 0x8000) !== 0,
    sub: (attr & 0x10000) !== 0,
    color: d.length >= 56 ? rgbOf(d, 52) : [0, 0, 0],
  };
}

function parseParaShape(d) {
  const attr1 = u32(d, 0);
  let lsType = attr1 & 3;
  let ls = i32(d, 24);
  if (d.length >= 54) {
    lsType = u32(d, 46) & 0x1f;
    ls = u32(d, 50);
  }
  return { align: (attr1 >> 2) & 7, left: i32(d, 4), right: i32(d, 8), indent: i32(d, 12), before: i32(d, 16), after: i32(d, 20), lsType, ls };
}

function parseBorderFill(d) {
  const sides = {};
  ["left", "right", "top", "bottom"].forEach((side, i) => {
    const o = 2 + i * 6;
    sides[side] = { type: d[o], width: d[o + 1], color: rgbOf(d, o + 2) };
  });
  let fill = null;
  if (d.length >= 40 && (u32(d, 32) & 1) !== 0) {
    const face = d.slice(36, 40);
    if (!(face[0] === 0xff && face[1] === 0xff && face[2] === 0xff && face[3] === 0xff)) fill = [face[0], face[1], face[2]];
  }
  return { ...sides, fill };
}

function parseDocInfo(recs) {
  const info = { faces: [], borderFills: [], charShapes: [], paraShapes: [] };
  let counts = [];
  const allFaces = [];
  for (const r of recs) {
    if (r.tag === T.ID_MAPPINGS) {
      counts = [];
      for (let o = 0; o + 3 < r.data.length; o += 4) counts.push(i32(r.data, o));
    } else if (r.tag === T.FACE_NAME) allFaces.push(parseFace(r.data));
    else if (r.tag === T.BORDER_FILL) info.borderFills.push(parseBorderFill(r.data));
    else if (r.tag === T.CHAR_SHAPE) info.charShapes.push(parseCharShape(r.data));
    else if (r.tag === T.PARA_SHAPE) info.paraShapes.push(parseParaShape(r.data));
  }
  // 글꼴 목록은 한글 · 영어 · 한자 … 순서로 이어 붙어 있다. 한글 글꼴(맨 앞 묶음)만 쓴다.
  const hangul = counts[1] > 0 ? counts[1] : allFaces.length;
  info.faces = allFaces.slice(0, hangul);
  return info;
}

// PARA_TEXT를 글자 단위로 푼다. 반환: [{ pos, ch }, { pos, tab }, { pos, ctrl: 몇 번째 컨트롤 }]
// pos는 문단 글자 번호(UTF-16 글자 수, 컨트롤은 8글자 차지) - PARA_CHAR_SHAPE의 위치와 같은 기준이다.
const EXTENDED = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);
const INLINE = new Set([4, 5, 6, 7, 8, 19, 20]);

function decodeText(data) {
  const units = data.length >> 1;
  const out = [];
  let ctrlNo = 0;
  let i = 0;
  while (i < units) {
    const c = data[i * 2] | (data[i * 2 + 1] << 8);
    if (c < 32) {
      if (c === 13) break; // 문단 끝
      if (c === 10) out.push({ pos: i, ch: "\n" });
      else if (c === 24) out.push({ pos: i, ch: "-" });
      else if (c === 30) out.push({ pos: i, ch: " " });
      else if (c === 31) out.push({ pos: i, ch: " " });
      else if (c === 9) {
        out.push({ pos: i, ch: "\t" });
        i += 7;
      } else if (EXTENDED.has(c)) {
        out.push({ pos: i, ctrl: ctrlNo });
        ctrlNo += 1;
        i += 7;
      } else if (INLINE.has(c)) i += 7;
      i += 1;
      continue;
    }
    let ch = String.fromCharCode(c);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < units) {
      const lo = data[i * 2 + 2] | (data[i * 2 + 3] << 8);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        const cp = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
        ch = cp >= 0xf0000 ? PUA_TEXT[cp] || "" : String.fromCodePoint(cp);
        out.push({ pos: i, ch });
        i += 2;
        continue;
      }
    }
    if (c >= 0xe000 && c <= 0xf8ff) ch = ""; // 사설 영역(글꼴이 없으면 네모로 보인다)
    else if (c >= 0xd800 && c <= 0xdfff) ch = ""; // 짝이 없는 서로게이트
    out.push({ pos: i, ch });
    i += 1;
  }
  return out;
}

function ctrlIdOf(d) {
  return String.fromCharCode(d[3], d[2], d[1], d[0]);
}

function endOfSubtree(recs, from, level, limit) {
  let m = from + 1;
  while (m < limit && recs[m].level > level) m += 1;
  return m;
}

function parseParagraph(recs, i, limit, ctx) {
  const hdr = recs[i];
  const L = hdr.level;
  const end = endOfSubtree(recs, i, L, limit);
  let textRec = null;
  let csRec = null;
  const ctrls = [];
  for (let k = i + 1; k < end; ) {
    const r = recs[k];
    if (r.level === L + 1) {
      if (r.tag === TAG.PARA_TEXT) textRec = r;
      else if (r.tag === TAG.PARA_CHAR_SHAPE) csRec = r;
      else if (r.tag === TAG.CTRL_HEADER) {
        const m = endOfSubtree(recs, k, L + 1, end);
        ctrls.push(parseControl(recs, k, m, ctx));
        k = m;
        continue;
      }
    }
    k += 1;
  }
  // 글자 모양이 바뀌는 자리 [{pos, id}]
  const shapes = [];
  if (csRec) for (let o = 0; o + 7 < csRec.data.length; o += 8) shapes.push({ pos: u32(csRec.data, o), id: u32(csRec.data, o + 4) });
  shapes.sort((a, b) => a.pos - b.pos);
  const shapeAt = (pos) => {
    let id = shapes.length ? shapes[0].id : 0;
    for (const s of shapes) {
      if (s.pos <= pos) id = s.id;
      else break;
    }
    return id;
  };
  const segs = [];
  const tokens = textRec ? decodeText(textRec.data) : [];
  for (const t of tokens) {
    if (t.ctrl !== undefined) {
      const c = ctrls[t.ctrl];
      if (c && c.kind === "tbl") segs.push({ type: "tbl", table: c });
      continue;
    }
    const cs = shapeAt(t.pos);
    const last = segs[segs.length - 1];
    if (last && last.type === "text" && last.cs === cs) last.text += t.ch;
    else segs.push({ type: "text", cs, text: t.ch });
  }
  // 표 컨트롤이 글자 자리 없이 붙어 있는 경우(드물다)도 빠뜨리지 않는다
  const used = new Set(tokens.filter((t) => t.ctrl !== undefined).map((t) => t.ctrl));
  ctrls.forEach((c, n) => {
    if (c.kind === "tbl" && !used.has(n) && !segs.some((s) => s.type === "tbl" && s.table === c)) segs.push({ type: "tbl", table: c });
  });
  const firstCs = shapes.length ? shapes[0].id : 0;
  return { next: end, para: { ps: u16(hdr.data, 8), lines: u16(hdr.data, 16), firstCs, segs } };
}

function parseControl(recs, a, b, ctx) {
  const id = ctrlIdOf(recs[a].data);
  if (id === "secd") {
    for (let k = a + 1; k < b; k += 1) {
      if (recs[k].tag === T.PAGE_DEF && recs[k].data.length >= 36) {
        const d = recs[k].data;
        const pg = { w: u32(d, 0), h: u32(d, 4), left: u32(d, 8), right: u32(d, 12), top: u32(d, 16), bottom: u32(d, 20), header: u32(d, 24), footer: u32(d, 28), gutter: u32(d, 32), landscape: d.length >= 40 ? (u32(d, 36) & 1) === 1 : false };
        // 쪽 크기가 말이 안 되면(0·터무니없이 큼) 읽은 값을 버리고 A4로 그린다. 여백은 쪽 크기의 1/3까지만 인정한다.
        if (pg.w >= 10000 && pg.w <= 400000 && pg.h >= 10000 && pg.h <= 400000) {
          const lim = Math.floor(Math.min(pg.w, pg.h) / 3);
          for (const k of ["left", "right", "top", "bottom", "header", "footer", "gutter"]) pg[k] = Math.min(pg[k], lim);
          ctx.page = pg;
        }
        break;
      }
    }
    return { kind: "secd" };
  }
  if (id !== "tbl ") return { kind: id };
  const L = recs[a].level;
  const table = { kind: "tbl", rows: 0, cols: 0, borderFill: 0, cells: [] };
  let seenTable = false;
  for (let k = a + 1; k < b; ) {
    const r = recs[k];
    if (r.level !== L + 1) {
      k += 1;
      continue;
    }
    if (r.tag === TAG.TABLE && !seenTable) {
      seenTable = true;
      table.rows = Math.min(u16(r.data, 4), MAX_ROWS);
      table.cols = Math.min(u16(r.data, 6), MAX_COLS);
      const at = 18 + 2 * table.rows;
      table.borderFill = at + 1 < r.data.length ? u16(r.data, at) : 0;
      k += 1;
    } else if (r.tag === TAG.LIST_HEADER && seenTable && r.data.length >= 34) {
      const d = r.data;
      const cell = {
        col: u16(d, 8),
        row: u16(d, 10),
        colSpan: clamp(u16(d, 12), 1, MAX_COLS),
        rowSpan: clamp(u16(d, 14), 1, MAX_ROWS),
        width: u32(d, 16),
        height: u32(d, 20),
        padL: u16(d, 24),
        padR: u16(d, 26),
        padT: u16(d, 28),
        padB: u16(d, 30),
        borderFill: u16(d, 32),
        valign: (u32(d, 4) >> 5) & 3,
        paras: [],
      };
      let m = k + 1;
      while (m < b && !(recs[m].tag === TAG.LIST_HEADER && recs[m].level === L + 1)) {
        if (recs[m].tag === TAG.PARA_HEADER && recs[m].level === L + 1) {
          const got = parseParagraph(recs, m, b, ctx);
          cell.paras.push(got.para);
          m = got.next;
        } else m += 1;
      }
      table.cells.push(cell);
      k = m;
    } else {
      k += 1;
    }
  }
  if (!table.rows) table.rows = Math.min(table.cells.reduce((n, c) => Math.max(n, c.row + c.rowSpan), 0), MAX_ROWS);
  if (!table.cols) table.cols = Math.min(table.cells.reduce((n, c) => Math.max(n, c.col + c.colSpan), 0), MAX_COLS);
  return table;
}

function openStream(root, path, compressed) {
  const node = findNode(root, path);
  if (!node || !node.data) return null;
  try {
    return parseRecords(compressed ? inflateSync(node.data) : node.data);
  } catch (e) {
    throw new Error("한글 본문을 읽을 수 없습니다(손상된 파일).");
  }
}

// 한글 파일 → 그리기 위한 모델: { page, info, paras: [문단...] }
export function parseHwpPreview(bytes) {
  const root = readCompound(bytes);
  const fh = findNode(root, "FileHeader");
  let sig = "";
  if (fh && fh.data) for (let i = 0; i < 17 && i < fh.data.length; i += 1) sig += String.fromCharCode(fh.data[i]);
  if (!fh || fh.data.length < 40 || !sig.startsWith("HWP Document File")) throw new Error("한글(.hwp) 파일이 아닙니다.");
  const flags = u32(fh.data, 36);
  if (flags & 0x2) throw new Error("암호가 걸린 문서는 미리 볼 수 없습니다.");
  if (flags & 0x4) throw new Error("배포용 문서는 미리 볼 수 없습니다.");
  const compressed = (flags & 0x1) !== 0;
  const docInfo = openStream(root, "DocInfo", compressed);
  if (!docInfo) throw new Error("한글 문서 정보(DocInfo)가 없습니다.");
  const info = parseDocInfo(docInfo);
  const ctx = { page: null };
  const paras = [];
  for (let s = 0; s < MAX_SECTIONS; s += 1) {
    const recs = openStream(root, `BodyText/Section${s}`, compressed);
    if (!recs) break;
    for (let i = 0; i < recs.length; ) {
      if (recs[i].tag === TAG.PARA_HEADER && recs[i].level === 0) {
        const got = parseParagraph(recs, i, recs.length, ctx);
        paras.push(got.para);
        i = got.next;
      } else i += 1;
    }
  }
  if (!paras.length) throw new Error("한글 본문에서 내용을 찾지 못했습니다.");
  const page = ctx.page || { w: 59528, h: 84188, left: 8504, right: 8504, top: 5668, bottom: 4252, header: 4252, footer: 4252, gutter: 0, landscape: false };
  if (page.landscape && page.w < page.h) [page.w, page.h] = [page.h, page.w];
  return { page, info, paras };
}

// 모델 안의 모든 칸 글을 모아 돌려준다(시험·점검용). [{ row, col, text }] - 표가 여러 개면 차례대로
export function previewCellTexts(model) {
  const out = [];
  const walk = (paras) => {
    for (const p of paras) {
      for (const s of p.segs) {
        if (s.type !== "tbl") continue;
        for (const c of s.table.cells) {
          out.push({ row: c.row, col: c.col, text: c.paras.map(paraText).join("\n") });
          walk(c.paras);
        }
      }
    }
  };
  walk(model.paras);
  return out;
}

export function paraText(p) {
  return p.segs
    .filter((s) => s.type === "text")
    .map((s) => s.text)
    .join("");
}

// ---------------------------------------------------------------- 그리기

const px = (units) => `${Math.round(units * PX * 100) / 100}px`;
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

const GOTHIC = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","Noto Sans CJK KR","Nanum Gothic","Segoe UI",sans-serif';
const SERIF = '"Batang","AppleMyungjo","Noto Serif KR","Noto Serif CJK KR","Nanum Myeongjo",serif';
const isSerifFace = (name) => /명조|바탕|궁서|Batang|Myungjo|Myeongjo|Gungsuh|Serif|Times|Mincho/i.test(name || "");

// 한글 선 굵기 번호 → mm
const BORDER_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
function borderCss(b) {
  if (!b || !b.type) return "none";
  const mm = BORDER_MM[b.width] || 0.12;
  let w = Math.max(1, Math.round(mm * 3.7795 * 10) / 10);
  let style = "solid";
  if ([2, 4, 5, 6].includes(b.type)) style = "dashed";
  else if ([3, 7].includes(b.type)) style = "dotted";
  else if ([8, 9, 10, 11].includes(b.type)) {
    style = "double";
    w = Math.max(3, w);
  }
  return `${w}px ${style} ${rgb(b.color)}`;
}

function el(doc, tag, style, text) {
  const e = doc.createElement(tag);
  if (style) e.style.cssText = style;
  if (text !== undefined) e.textContent = text;
  return e;
}

// 글자 크기(1/7200 인치 단위): 망가진 값(0·터무니없이 큼)은 쓸 만한 범위로 잡는다
const sizeOf = (cs) => (clamp(cs.height, 100, 20000) * clamp(cs.rel || 100, 10, 250)) / 100;

// 글자 모양 하나를 CSS로
function runStyle(cs, info) {
  if (!cs) return "";
  const size = sizeOf(cs);
  const face = info.faces[cs.face] || "";
  const parts = [`font-size:${px(size)}`, `font-family:${isSerifFace(face) ? SERIF : GOTHIC}`, `color:${rgb(cs.color)}`];
  if (cs.bold) parts.push("font-weight:700");
  if (cs.italic) parts.push("font-style:italic");
  const deco = [cs.underline ? "underline" : "", cs.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) parts.push(`text-decoration:${deco}`);
  if (cs.spacing) parts.push(`letter-spacing:${Math.round(cs.spacing * 10) / 1000}em`);
  if (cs.sup) parts.push("vertical-align:super;font-size:" + px(size * 0.7));
  if (cs.sub) parts.push("vertical-align:sub;font-size:" + px(size * 0.7));
  return parts.join(";");
}

const ALIGN = ["justify", "left", "right", "center", "justify", "justify"];

function paraStyle(ps, cs, info) {
  // word-spacing: 한글 문서의 띄어쓰기는 기기 글꼴의 공백보다 넓어서(글자 폭의 절반쯤) 조금 넓혀 준다
  const parts = ["margin:0", "white-space:pre-wrap", "word-break:keep-all", "overflow-wrap:anywhere", "tab-size:4", "word-spacing:0.25em"];
  const size = cs ? sizeOf(cs) : 1000;
  parts.push(`font-size:${px(size)}`);
  if (cs) parts.push(`font-family:${isSerifFace(info.faces[cs.face]) ? SERIF : GOTHIC}`, `color:${rgb(cs.color)}`);
  if (ps) {
    parts.push(`text-align:${ALIGN[ps.align] || "left"}`);
    if (ps.align === 4 || ps.align === 5) parts.push("text-align-last:justify");
    // 여백·간격도 쓸 만한 범위로 잡는다(터무니없이 큰 값이 오면 글이 한 글자씩 줄바꿈되어 종이가 끝없이 길어진다)
    if (ps.left) parts.push(`margin-left:${px(clamp(ps.left, -30000, 30000))}`);
    if (ps.right) parts.push(`margin-right:${px(clamp(ps.right, -30000, 30000))}`);
    if (ps.indent) parts.push(`text-indent:${px(clamp(ps.indent, -30000, 30000))}`);
    if (ps.before) parts.push(`padding-top:${px(clamp(ps.before, 0, 20000))}`);
    if (ps.after) parts.push(`padding-bottom:${px(clamp(ps.after, 0, 20000))}`);
    if (ps.lsType === 0) parts.push(`line-height:${clamp(ps.ls / 100, 0.8, 5)}`);
    else if (ps.lsType === 1) parts.push(`line-height:${px(clamp(ps.ls, 0, 20000))}`);
    else if (ps.lsType === 2) parts.push(`line-height:calc(1em + ${px(clamp(ps.ls, 0, 20000))})`);
    else parts.push(`line-height:${clamp(ps.ls / 100 || 1.6, 1, 5)}`);
  }
  return parts.join(";");
}

// 줄 맞춤용 긴 공백("번  호 :      2026. 11. 3.")은 글꼴이 달라지면 줄이 넘칠 수 있어서, 한 줄짜리 문단에서는 늘어나는 빈칸으로 바꿔 오른쪽 끝을 맞춘다.
const GAP = / {8,}/;

function renderParagraph(p, model, doc) {
  const info = model.info;
  const ps = info.paraShapes[p.ps];
  const hasText = p.segs.some((s) => s.type === "text" && s.text !== "");
  const out = [];
  const firstCs = info.charShapes[p.firstCs];
  if (hasText || !p.segs.some((s) => s.type === "tbl")) {
    const box = el(doc, "div", paraStyle(ps, firstCs, info));
    const oneLine = p.lines <= 1 && !p.segs.some((s) => s.type === "text" && s.text.includes("\n"));
    // 오른쪽·가운데 맞춤 문단은 공백까지 한 덩어리로 맞춰져 있으니 그대로 두고, 양쪽·왼쪽 맞춤 문단의 긴 공백만 늘어나는 빈칸으로 바꾼다
    const useGap = oneLine && (!ps || ps.align <= 1) && p.segs.some((s) => s.type === "text" && GAP.test(s.text));
    if (useGap) box.style.cssText += ";display:flex;white-space:pre";
    for (const s of p.segs) {
      if (s.type !== "text") continue;
      const style = runStyle(info.charShapes[s.cs], info);
      const pieces = useGap ? s.text.split(/( {8,})/) : [s.text];
      for (const piece of pieces) {
        if (useGap && GAP.test(piece) && /^ +$/.test(piece)) {
          box.appendChild(el(doc, "span", "flex:1 1 0;min-width:4px", ""));
        } else if (piece !== "") {
          box.appendChild(el(doc, "span", style + (useGap ? ";flex:none" : ""), piece));
        }
      }
    }
    if (!box.firstChild) box.appendChild(el(doc, "span", "", "​")); // 빈 줄도 줄 높이를 유지한다
    out.push(box);
  }
  for (const s of p.segs) if (s.type === "tbl") out.push(renderTable(s.table, model, doc));
  return out;
}

// 칸 크기에서 열 너비·행 높이를 구한다. 합치지 않은 칸의 값을 먼저 쓰고, 합친 칸에서 나머지를 뺀다.
function solveSizes(cells, count, startOf, spanOf, sizeOf) {
  const sizes = new Array(count).fill(null);
  for (const c of cells) if (spanOf(c) === 1 && startOf(c) < count && sizes[startOf(c)] === null && sizeOf(c) > 0) sizes[startOf(c)] = sizeOf(c);
  for (let pass = 0; pass < count + 2; pass += 1) {
    let progress = false;
    for (const c of cells) {
      const a = startOf(c);
      const n = spanOf(c);
      if (n < 2 || a + n > count) continue;
      const unknown = [];
      let known = 0;
      for (let k = a; k < a + n; k += 1) {
        if (sizes[k] === null) unknown.push(k);
        else known += sizes[k];
      }
      if (unknown.length === 1 && sizeOf(c) - known > 0) {
        sizes[unknown[0]] = sizeOf(c) - known;
        progress = true;
      }
    }
    if (!progress) break;
  }
  // 끝까지 모르는 칸(양식이 비정상일 때)은 아는 칸의 평균으로 채운다
  const rest = sizes.filter((s) => s === null).length;
  if (rest) {
    const filled = sizes.reduce((s, v) => s + (v || 0), 0);
    const avg = filled > 0 ? filled / Math.max(1, count - rest) : 1000;
    for (let k = 0; k < count; k += 1) if (sizes[k] === null) sizes[k] = avg;
  }
  return sizes;
}

function renderTable(tbl, model, doc) {
  const info = model.info;
  // 칸 너비·높이는 쪽 크기의 두 배까지만 인정한다(망가진 값 때문에 종이가 끝없이 길어지지 않게)
  const maxW = model.page.w * 2;
  const maxH = model.page.h;
  const colW = solveSizes(tbl.cells, tbl.cols, (c) => c.col, (c) => c.colSpan, (c) => c.width).map((v) => clamp(v, 0, maxW));
  const rowH = solveSizes(tbl.cells, tbl.rows, (c) => c.row, (c) => c.rowSpan, (c) => c.height).map((v) => clamp(v, 0, maxH));
  const total = colW.reduce((s, v) => s + v, 0);
  const table = el(doc, "table", `border-collapse:collapse;table-layout:fixed;width:${px(total)};margin:0;border:0;background:transparent`);
  const group = el(doc, "colgroup");
  for (const w of colW) group.appendChild(el(doc, "col", `width:${px(w)}`));
  table.appendChild(group);
  const body = el(doc, "tbody");
  table.appendChild(body);
  for (let r = 0; r < tbl.rows; r += 1) {
    const tr = el(doc, "tr", `height:${px(rowH[r])}`);
    const cells = tbl.cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col);
    for (const c of cells) {
      const bf = info.borderFills[c.borderFill - 1] || null; // 테두리/배경 번호는 1부터
      const parts = [`box-sizing:border-box`, `height:${px(clamp(c.height, 0, maxH))}`, `padding:${px(c.padT)} ${px(c.padR)} ${px(c.padB)} ${px(c.padL)}`, `vertical-align:${["top", "middle", "bottom"][c.valign] || "top"}`, "overflow:visible", "position:relative"];
      if (bf) {
        for (const side of ["left", "right", "top", "bottom"]) parts.push(`border-${side}:${borderCss(bf[side])}`);
        if (bf.fill) parts.push(`background:${rgb(bf.fill)}`);
      }
      const td = el(doc, "td", parts.join(";"));
      if (c.colSpan > 1) td.colSpan = c.colSpan;
      if (c.rowSpan > 1) td.rowSpan = c.rowSpan;
      td.setAttribute("data-r", String(c.row));
      td.setAttribute("data-c", String(c.col));
      for (const p of c.paras) for (const node of renderParagraph(p, model, doc)) td.appendChild(node);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  return table;
}

// 모델 → 종이 한 장 모양의 요소. 반환: { node, width, height } (width·height는 100% 크기의 px)
export function buildHwpDom(model, doc = document) {
  const pg = model.page;
  const width = pg.w * PX;
  const height = pg.h * PX;
  const paper = el(doc, "div", `box-sizing:border-box;position:relative;width:${px(pg.w)};min-height:${px(pg.h)};padding:${px(pg.top + pg.header)} ${px(pg.right)} ${px(pg.bottom + pg.footer)} ${px(pg.left + pg.gutter)};background:#fff;color:#000;text-align:left`);
  paper.className = "pwv-paper pwv-hwp";
  for (const p of model.paras) for (const node of renderParagraph(p, model, doc)) paper.appendChild(node);
  return { node: paper, width, height, kind: "hwp" };
}

export function renderHwpPreview(bytes, doc = document) {
  return buildHwpDom(parseHwpPreview(bytes), doc);
}
