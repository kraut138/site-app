// 검측요청서(.hwp) 양식의 빈 칸에 글을 채워 넣는다. 양식 파일(원본)은 그대로 두고, 본문 스트림(BodyText/Section0) 안에서
// 비어 있는 칸의 문단 몇 개만 고쳐 다시 묶는다. 한글을 새로 만드는 것이 아니라 "빈 칸에 글을 쳐 넣은 것과 같은 결과"가 되도록 한다.
//
// 빈 문단에 글을 넣으면 한글은 이렇게 저장한다(한글 호환 편집기로 같은 일을 시켜 비교해 확인했다).
//   PARA_HEADER : 글자 수 = 글 길이 + 1(문단 끝), 줄 나눔 글자(\n)가 있으면 제어 마스크의 10번째 비트, 줄 수
//   PARA_TEXT   : 글(UTF-16) + 문단 끝(0x0D) - 빈 문단에는 이 레코드가 없다
//   PARA_LINE_SEG: 줄마다 한 칸(시작 글자 번호, 세로 위치 = 줄 번호 × 줄 간격 …)
// 칸이 작아서 줄이 더 늘어나면 표 높이가 달라져 한 쪽에 안 들어가므로, 칸의 높이에 들어가는 줄 수까지만 쓰고 넘치면 "…"로 줄인다.
import { inflateSync, deflateSync } from "fflate";
import { readCompound, writeCompound, findNode } from "./hwpContainer.js";
import { TAG, u16, u32, i32, put16, put32, parseRecords, serializeRecords, utf16Decode, utf16Encode, cleanCellText, wrapLines } from "./hwpRecords.js";

// 칸 이름표(왼쪽 칸)의 글에서 공백·제어 글자를 빼고 비교한다
const squash = (s) => String(s).replace(/[\s\u0000-\u001f]/g, "");
const textOf = (rec) => utf16Decode(rec.data);

// 표의 칸(LIST_HEADER)마다 그 칸의 문단 레코드 위치를 모은다.
function scanCells(recs) {
  const cells = [];
  for (let i = 0; i < recs.length; i += 1) {
    const r = recs[i];
    if (r.tag !== TAG.LIST_HEADER || r.data.length < 34) continue;
    const level = r.level;
    const cell = {
      listIdx: i,
      level,
      col: u16(r.data, 8),
      row: u16(r.data, 10),
      colSpan: u16(r.data, 12),
      rowSpan: u16(r.data, 14),
      width: u32(r.data, 16),
      height: u32(r.data, 20),
      marginTop: u16(r.data, 28),
      marginBottom: u16(r.data, 30),
      paras: [],
    };
    let j = i + 1;
    while (j < recs.length && recs[j].level >= level && !(recs[j].tag === TAG.LIST_HEADER && recs[j].level === level)) {
      if (recs[j].tag === TAG.PARA_HEADER && recs[j].level === level) {
        const p = { hdr: j, text: -1, charShape: -1, lineSeg: -1, end: j + 1 };
        let k = j + 1;
        while (k < recs.length && recs[k].level > level) {
          if (recs[k].level === level + 1) {
            if (recs[k].tag === TAG.PARA_TEXT) p.text = k;
            else if (recs[k].tag === TAG.PARA_CHAR_SHAPE) p.charShape = k;
            else if (recs[k].tag === TAG.PARA_LINE_SEG) p.lineSeg = k;
          }
          k += 1;
        }
        p.end = k;
        cell.paras.push(p);
        j = k;
      } else {
        j += 1;
      }
    }
    cell.end = j;
    cells.push(cell);
  }
  for (const c of cells) {
    c.text = c.paras.map((p) => (p.text >= 0 ? textOf(recs[p.text]).replace(/\r$/, "") : "")).join("\n");
  }
  return cells;
}

// 이름표 칸 바로 오른쪽(같은 줄) 칸 = 값을 적는 칸
function valueCellOf(cells, label) {
  const want = squash(label);
  const idx = cells.findIndex((c) => squash(c.text) === want);
  if (idx < 0) throw new Error(`양식에서 '${label}' 칸을 찾지 못했습니다. 양식 파일이 바뀌었는지 확인해 주세요.`);
  const label_ = cells[idx];
  const next = cells[idx + 1];
  if (!next || next.row !== label_.row || next.col !== label_.col + label_.colSpan) throw new Error(`양식에서 '${label}' 옆의 빈 칸을 찾지 못했습니다.`);
  return next;
}

function lineSegOf(rec) {
  const d = rec.data;
  return { textpos: i32(d, 0), y: i32(d, 4), height: i32(d, 8), textheight: i32(d, 12), baseline: i32(d, 16), spacing: i32(d, 20), x: i32(d, 24), width: i32(d, 28), flags: u32(d, 32) };
}

// 칸 안에 줄이 몇 개까지 들어가는지: 칸 높이에서 위·아래 여백을 뺀 것을 줄 간격으로 나눈다
function lineCapacity(cell, seg) {
  const room = cell.height - cell.marginTop - cell.marginBottom;
  return Math.max(1, Math.floor(room / Math.max(1, seg.height + seg.spacing)));
}

// 빈 문단 하나를 lines(줄 목록)가 들어간 문단으로 바꾼 레코드 묶음을 만든다.
function paragraphRecords(recs, para, lines) {
  const hdr = recs[para.hdr];
  const d = hdr.data.slice();
  const last = u32(d, 0) & 0x80000000;
  const text = lines.join("\n");
  const units = text.length + 1; // + 문단 끝
  put32(d, 0, (units | last) >>> 0);
  if (lines.length > 1) put32(d, 4, (u32(d, 4) | (1 << 10)) >>> 0); // 줄 나눔(10번) 글자가 있음
  put16(d, 16, lines.length);
  const out = [{ tag: TAG.PARA_HEADER, level: hdr.level, data: d }];
  const body = new Uint8Array((text.length + 1) * 2);
  body.set(utf16Encode(text), 0);
  put16(body, text.length * 2, 0x0d);
  out.push({ tag: TAG.PARA_TEXT, level: hdr.level + 1, data: body });
  if (para.charShape >= 0) out.push(recs[para.charShape]);
  const seg = lineSegOf(recs[para.lineSeg]);
  const segs = new Uint8Array(36 * lines.length);
  let pos = 0;
  lines.forEach((line, k) => {
    const o = k * 36;
    put32(segs, o, pos);
    put32(segs, o + 4, seg.y + k * (seg.height + seg.spacing));
    put32(segs, o + 8, seg.height);
    put32(segs, o + 12, seg.textheight);
    put32(segs, o + 16, seg.baseline);
    put32(segs, o + 20, seg.spacing);
    put32(segs, o + 24, seg.x);
    put32(segs, o + 28, seg.width);
    put32(segs, o + 32, seg.flags);
    pos += line.length + 1; // 줄 나눔 글자 하나 포함
  });
  out.push({ tag: TAG.PARA_LINE_SEG, level: hdr.level + 1, data: segs });
  return out;
}

// 칸 하나에 값을 넣을 계획을 세운다(글자 수·줄 나누기). 칸이 비어 있지 않거나 모양이 예상과 다르면 오류.
function planCell(recs, cell, value) {
  const clean = cleanCellText(value);
  if (!clean) return null;
  if (cell.paras.length !== 1) throw new Error("양식의 칸 구조가 예상과 다릅니다(문단이 여러 개).");
  const para = cell.paras[0];
  const hdr = recs[para.hdr];
  if (para.text >= 0 || (u32(hdr.data, 0) & 0x7fffffff) !== 1 || u32(hdr.data, 4) !== 0) throw new Error("양식의 칸이 비어 있지 않습니다.");
  if (para.lineSeg < 0) throw new Error("양식의 칸 구조가 예상과 다릅니다(줄 정보 없음).");
  const seg = lineSegOf(recs[para.lineSeg]);
  const wrapped = wrapLines(clean, seg.width, lineCapacity(cell, seg), seg.textheight || 1000);
  return { para, wrapped };
}

// "번  호 :        20    .     .     ." 줄의 날짜 부분에 날짜를 쓴다. 글자 수는 그대로 두고(날짜가 더 짧으니 앞 공백을 늘려) 오른쪽 끝을 맞춘다.
function dateEdit(recs, cells, dateText) {
  const re = /^(번\s*호\s*:\s*)(20(?:\s*\.){3})\r$/;
  for (const c of cells) {
    for (const p of c.paras) {
      if (p.text < 0) continue;
      const m = re.exec(textOf(recs[p.text]));
      if (!m) continue;
      const pairs = recs[p.charShape].data;
      if (pairs.length !== 16 || u32(pairs, 8) !== m[1].length) throw new Error("양식의 날짜 줄 구조가 예상과 다릅니다.");
      if (dateText.length > m[2].length) throw new Error("날짜 글이 너무 깁니다.");
      const pad = m[2].length - dateText.length;
      const prefix = m[1] + " ".repeat(pad);
      const next = recs[p.text].data.slice();
      next.set(utf16Encode(prefix + dateText), 0);
      const shapes = pairs.slice();
      put32(shapes, 8, prefix.length);
      return [
        { index: p.text, rec: { ...recs[p.text], data: next } },
        { index: p.charShape, rec: { ...recs[p.charShape], data: shapes } },
      ];
    }
  }
  throw new Error("양식에서 날짜 줄('번 호 : 20 . . .')을 찾지 못했습니다.");
}

function checkHeader(root) {
  const fh = findNode(root, "FileHeader");
  const sig = fh ? utf16sig(fh.data) : "";
  if (!fh || fh.data.length < 40 || !sig.startsWith("HWP Document File")) throw new Error("한글(.hwp) 양식 파일이 아닙니다.");
  const flags = u32(fh.data, 36);
  if (flags & 0x2) throw new Error("암호가 걸린 양식은 채울 수 없습니다.");
  if (flags & 0x4) throw new Error("배포용 문서 양식은 채울 수 없습니다.");
  if (flags & 0x10) throw new Error("DRM이 걸린 양식은 채울 수 없습니다.");
  return { compressed: (flags & 0x1) !== 0 };
}
function utf16sig(b) {
  let s = "";
  for (let i = 0; i < 17; i += 1) s += String.fromCharCode(b[i]);
  return s;
}

function loadSection(bytes) {
  const root = readCompound(bytes);
  const { compressed } = checkHeader(root);
  const node = findNode(root, "BodyText/Section0");
  if (!node) throw new Error("양식에 본문(BodyText/Section0)이 없습니다.");
  const raw = compressed ? inflateSync(node.data) : node.data;
  return { root, node, compressed, recs: parseRecords(raw) };
}

// 양식 안의 칸 글을 읽는다(시험·점검용). [{ row, col, text }]
export function readHwpCells(bytes) {
  const { recs } = loadSection(bytes);
  return scanCells(recs).map((c) => ({ row: c.row, col: c.col, text: c.text }));
}

// 검측요청서 양식을 채운다.
//   values: { date: "2026.  11.  3.", position: "위치 및 공종", part: "검측 부위", when: "검측요구일시", matters: "검측 사항(\n은 줄 바꿈)" }  - 없거나 빈 값은 칸을 비워 둔다
// 반환: { bytes, report: { date, fields: { position: { lines, truncated }, ... } } }
export function fillInspectionRequest(templateBytes, values) {
  const { root, node, compressed, recs } = loadSection(templateBytes);
  const cells = scanCells(recs);
  const targets = [
    ["position", "위치 및 공종"],
    ["part", "검측 부위"],
    ["when", "검측요구일시"],
    ["matters", "검측 사항"],
  ];
  const report = { date: "", fields: {} };
  const replace = []; // { start, end, recs } 문단 통째로 바꾸기
  const single = []; // { index, rec } 레코드 하나 바꾸기
  for (const [key, label] of targets) {
    const cell = valueCellOf(cells, label);
    const plan = planCell(recs, cell, values[key]);
    if (!plan) continue;
    replace.push({ start: plan.para.hdr, end: plan.para.end, recs: paragraphRecords(recs, plan.para, plan.wrapped.lines) });
    report.fields[key] = { lines: plan.wrapped.lines, truncated: plan.wrapped.truncated };
  }
  const dateText = cleanCellText(values.date);
  if (dateText) {
    single.push(...dateEdit(recs, cells, dateText));
    report.date = dateText;
  }

  const next = recs.slice();
  for (const s of single) next[s.index] = s.rec;
  replace.sort((a, b) => b.start - a.start).forEach((r) => next.splice(r.start, r.end - r.start, ...r.recs));
  const raw = serializeRecords(next);
  node.data = compressed ? deflateSync(raw, { level: 6 }) : raw;
  return { bytes: writeCompound(root), report };
}
