// 워드(.docx) 양식(작업일보·TBM 일지)의 빈 칸에 글을 채워 넣는다. 양식 파일(원본)은 그대로 두고 본문(word/document.xml)의 칸만 고쳐 다시 묶는다.
// 칸은 번호가 아니라 이름표 글("작성일", "작업 장소" …)로 찾는다. 그래서 양식의 줄이 늘거나 순서가 조금 바뀌어도 맞는 칸에 들어가고,
// 이름표를 못 찾으면 엉뚱한 칸에 쓰지 않고 오류를 낸다. 값이 없는 칸은 손대지 않아 양식의 빈 칸 그대로 남는다.
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { charUnits } from "./hwpRecords.js";

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_W14 = "http://schemas.microsoft.com/office/word/2010/wordml";
const NS_XML = "http://www.w3.org/XML/1998/namespace";
const DOC_PART = "word/document.xml";
const DEFAULT_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

// 글자 크기(반 포인트 단위): 작업일보 칸은 양식 글자가 작아(6.5pt) 한 단계 키워 7pt.
// TBM 칸은 양식의 글자(9.5pt)와 같게 쓰되, 한 줄에 안 들어가면 8.5·8·7.5pt까지 줄여서 줄 수를 늘리지 않는다
// (TBM 양식은 한 쪽에 꽉 차 있어서, 칸이 한 줄이라도 늘어나면 아래 안내 글이 다음 쪽으로 넘어간다).
const WORKLOG_SIZE = 14;
const TBM_SIZES = [19, 17, 16, 15];

// 작업 내용 표가 한 쪽을 넘어도 모든 기록이 서류에 들어가게 줄을 늘리되, 이 줄 수를 넘으면 마지막 줄에 "외 N건"으로 줄인다
export const MAX_WORK_ROWS = 40;

// ---------------------------------------------------------------- 묶음 파일 읽고 쓰기

function openDocx(bytes) {
  let files;
  try {
    files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch (e) {
    throw new Error("워드(.docx) 양식 파일을 열 수 없습니다.");
  }
  const raw = files[DOC_PART];
  if (!raw) throw new Error("양식에 본문(word/document.xml)이 없습니다.");
  const xml = strFromU8(raw);
  const decl = /^﻿?(<\?xml[^>]*\?>\s*)/.exec(xml);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0 || !doc.documentElement) throw new Error("양식 본문을 읽을 수 없습니다.");
  return { files, doc, declaration: decl ? decl[1] : DEFAULT_DECLARATION };
}

function saveDocx({ files, doc, declaration }) {
  const xml = declaration + new XMLSerializer().serializeToString(doc.documentElement);
  // 원래 순서를 그대로 두고 본문 하나만 바꾼다
  const next = {};
  for (const name of Object.keys(files)) next[name] = name === DOC_PART ? strToU8(xml) : files[name];
  return zipSync(next, { level: 6 });
}

// ---------------------------------------------------------------- 칸 찾기

const squash = (s) => String(s == null ? "" : s).replace(/\s+/g, "");

function kids(el, name) {
  return Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.namespaceURI === NS_W && n.localName === name);
}
const kid = (el, name) => kids(el, name)[0] || null;

function cellText(tc) {
  return Array.from(tc.getElementsByTagNameNS(NS_W, "t"))
    .map((t) => t.textContent)
    .join("");
}

function bodyTables(doc) {
  const body = kid(doc.documentElement, "body");
  if (!body) throw new Error("양식 본문 구조가 예상과 다릅니다.");
  return kids(body, "tbl");
}

function rowCells(tr) {
  return kids(tr, "tc");
}

function firstRowTexts(tbl) {
  const tr = kid(tbl, "tr");
  return tr ? rowCells(tr).map((tc) => squash(cellText(tc))) : [];
}

// 이름표 칸의 바로 오른쪽 칸(같은 줄)
function valueCellOf(tbl, label) {
  const want = squash(label);
  for (const tr of kids(tbl, "tr")) {
    const cells = rowCells(tr);
    for (let i = 0; i < cells.length; i += 1) {
      if (squash(cellText(cells[i])) === want) {
        if (!cells[i + 1]) throw new Error(`양식에서 '${label}' 옆의 칸을 찾지 못했습니다.`);
        return cells[i + 1];
      }
    }
  }
  throw new Error(`양식에서 '${label}' 칸을 찾지 못했습니다. 양식 파일이 바뀌었는지 확인해 주세요.`);
}

function missingTable(what) {
  return new Error(`양식에서 ${what} 표를 찾지 못했습니다. 양식 파일이 바뀌었는지 확인해 주세요.`);
}

// ---------------------------------------------------------------- 칸에 글 쓰기

function make(doc, name) {
  return doc.createElementNS(NS_W, `w:${name}`);
}

// 글자 모양(rPr)의 크기를 정한다. rPr의 자식 순서는 규격이 정해 둔 것이라 sz는 그 자리(뒤쪽 낱말보다 앞)에 넣는다.
const AFTER_SZ = ["szCs", "highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath"];
function setSize(rPr, size) {
  let sz = kid(rPr, "sz");
  if (!sz) {
    sz = make(rPr.ownerDocument, "sz");
    const anchor = Array.from(rPr.childNodes).find((n) => n.nodeType === 1 && n.namespaceURI === NS_W && AFTER_SZ.includes(n.localName));
    rPr.insertBefore(sz, anchor || null);
  }
  sz.setAttributeNS(NS_W, "w:val", String(size));
}

// 칸의 첫 문단에 lines(한 줄씩)를 쓴다. 문단 모양은 그대로 두고, 글자 모양은 칸의 기존 글(없으면 문단 끝 표시)의 것을 따른다.
// 양식에 있던 배경색 글자 효과(shd)와 영문 전용 글꼴(rFonts)은 빼서, 칸 안의 글이 이름표와 같은 글꼴로 보이게 한다.
function setCellLines(cell, lines, size) {
  const doc = cell.ownerDocument;
  const p = kid(cell, "p");
  if (!p) throw new Error("양식의 칸 구조가 예상과 다릅니다(문단 없음).");
  const pPr = kid(p, "pPr");
  const firstRun = kid(p, "r");
  const base = (firstRun && kid(firstRun, "rPr")) || (pPr && kid(pPr, "rPr")) || null;
  for (const n of Array.from(p.childNodes)) if (n !== pPr) p.removeChild(n);
  const rPr = base ? base.cloneNode(true) : make(doc, "rPr");
  for (const drop of ["shd", "rFonts"]) {
    const el = kid(rPr, drop);
    if (el) rPr.removeChild(el);
  }
  setSize(rPr, size);
  const run = make(doc, "r");
  run.appendChild(rPr);
  lines.forEach((line, i) => {
    if (i > 0) run.appendChild(make(doc, "br"));
    const t = make(doc, "t");
    t.setAttributeNS(NS_XML, "xml:space", "preserve");
    t.textContent = line;
    run.appendChild(t);
  });
  p.appendChild(run);
}

// XML 1.0이 허용하지 않는 글자(제어 글자, 짝이 없는 서로게이트)가 한 글자라도 들어가면 워드가 파일을 못 열기 때문에 공백으로 바꾼다.
// (정규식의 lookbehind는 오래된 아이폰 브라우저가 못 읽어서 글자를 하나씩 본다)
function xmlSafe(text) {
  const str = String(text);
  let out = "";
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += str[i] + str[i + 1];
        i += 1;
      } else {
        out += " ";
      }
    } else if ((c >= 0xdc00 && c <= 0xdfff) || c === 0xfffe || c === 0xffff || (c < 0x20 && c !== 0x09 && c !== 0x0a)) {
      out += " ";
    } else {
      out += str[i];
    }
  }
  return out;
}

// 칸에 쓸 줄들: 앞뒤의 빈 줄은 버리고, 가운데 빈 줄은 그대로 둔다
function linesOf(value) {
  const lines = (Array.isArray(value) ? value : String(value == null ? "" : value).replace(/\r\n?/g, "\n").split("\n")).map((s) => xmlSafe(s).replace(/\s+$/g, ""));
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// 복사한 줄이 원본과 같은 문단 번호(w14:paraId)를 갖지 않도록 지운다(없어도 워드가 알아서 붙인다)
function stripParaIds(el) {
  const all = [el, ...Array.from(el.getElementsByTagNameNS(NS_W, "*"))];
  for (const n of all) {
    n.removeAttributeNS(NS_W14, "paraId");
    n.removeAttributeNS(NS_W14, "textId");
  }
}

// ---------------------------------------------------------------- 칸 안에 몇 줄이 되는지 어림하기

// 글 한 줄의 폭(pt). 한글 한 글자 = 글자 크기, 숫자·영문은 그보다 좁다(hwpRecords.js의 글자 폭 어림값 그대로).
function widthPt(text, halfPoints) {
  let w = 0;
  for (const ch of String(text)) w += (charUnits(ch) * (halfPoints / 2)) / 1000;
  return w;
}

// 칸의 글이 들어갈 폭(pt): 칸 너비(tcW)에서 양쪽 여백(기본 108)을 뺀다
function innerWidthPt(cell) {
  const tcPr = kid(cell, "tcPr");
  const tcW = tcPr && kid(tcPr, "tcW");
  const dxa = tcW ? Number(tcW.getAttributeNS(NS_W, "w")) : NaN;
  return ((Number.isFinite(dxa) && dxa > 400 ? dxa : 2000) - 216) / 20;
}

function rowsNeeded(lines, inner, halfPoints) {
  return lines.reduce((n, line) => n + Math.max(1, Math.ceil(widthPt(line, halfPoints) / (inner * 0.96))), 0);
}

// 줄 수가 가장 적게 되는 글자 크기 중 가장 큰 것을 고른다. 반환: { size, rows }
function pickSize(cell, lines, sizes) {
  const inner = innerWidthPt(cell);
  let best = null;
  for (const size of sizes) {
    const rows = rowsNeeded(lines, inner, size);
    if (!best || rows < best.rows) best = { size, rows };
  }
  return best;
}

// 칸에 쓰고, 양식의 한 줄보다 늘어나는 줄 수(어림)를 돌려준다
function fillFitted(cell, lines, sizes) {
  const { size, rows } = pickSize(cell, lines, sizes);
  setCellLines(cell, lines, size);
  return Math.max(0, rows - 1);
}

// "작성할 때 자주 걸리는 것" 안내 위에 있는 빈 문단(표와 안내 사이 띄우기)을 6pt 높이로 줄여, 칸이 늘어난 만큼 안내가 다음 쪽으로 밀리지 않게 한다.
// 문단 모양이 이미 있는 문단이면 건드리지 않고 통째로 없앤다.
function shrinkSpacerBeforeNotes(doc) {
  const body = kid(doc.documentElement, "body");
  const nodes = Array.from(body.childNodes).filter((n) => n.nodeType === 1);
  const at = nodes.findIndex((n) => n.localName === "p" && squash(cellText(n)).startsWith("작성할때"));
  const prev = at > 0 ? nodes[at - 1] : null;
  const empty =
    prev && prev.namespaceURI === NS_W && prev.localName === "p" && squash(cellText(prev)) === "" && prev.getElementsByTagNameNS(NS_W, "drawing").length === 0 && prev.getElementsByTagNameNS(NS_W, "sectPr").length === 0;
  if (!empty) return false;
  if (kid(prev, "pPr")) {
    body.removeChild(prev);
    return true;
  }
  const pPr = make(doc, "pPr");
  const spacing = make(doc, "spacing");
  spacing.setAttributeNS(NS_W, "w:before", "0");
  spacing.setAttributeNS(NS_W, "w:after", "0");
  spacing.setAttributeNS(NS_W, "w:line", "120");
  spacing.setAttributeNS(NS_W, "w:lineRule", "exact");
  pPr.appendChild(spacing);
  prev.insertBefore(pPr, prev.firstChild);
  return true;
}

// ---------------------------------------------------------------- 작업일보

// model: { date: "2026. 11. 3. (화)", rows: [{ trade, place, content: ["줄", ...] }] }
// 반환: { bytes, report: { rows, addedRows, omitted } }
export function fillWorkLog(templateBytes, model) {
  const pack = openDocx(templateBytes);
  const tables = bodyTables(pack.doc);
  const head = tables.find((t) => kids(t, "tr").some((tr) => rowCells(tr).some((tc) => squash(cellText(tc)) === "작성일")));
  const work = tables.find((t) => {
    const first = firstRowTexts(t);
    return first[0] === "공종" && (first[1] || "").startsWith("위치") && first[2] === "작업내용";
  });
  if (!head) throw missingTable("작성일이 있는 머리글");
  if (!work) throw missingTable("작업 내용");

  const report = { rows: 0, addedRows: 0, omitted: 0 };
  if (model.date) setCellLines(valueCellOf(head, "작성일"), linesOf(model.date), WORKLOG_SIZE);

  let rows = Array.isArray(model.rows) ? model.rows.slice() : [];
  if (rows.length > MAX_WORK_ROWS) {
    const rest = rows.length - (MAX_WORK_ROWS - 1);
    rows = rows.slice(0, MAX_WORK_ROWS - 1);
    rows.push({ trade: "", place: "", content: [`외 ${rest}건 (음성요청 내역에서 확인)`] });
    report.omitted = rest;
  }
  let trs = kids(work, "tr");
  const sample = trs[trs.length - 1];
  if (!sample || rowCells(sample).length < 3) throw new Error("양식의 작업 내용 표 구조가 예상과 다릅니다.");
  while (trs.length - 1 < rows.length) {
    const copy = sample.cloneNode(true);
    stripParaIds(copy);
    work.insertBefore(copy, sample.nextSibling);
    // 복사본을 계속 마지막 줄로 두고 이어서 복사한다
    trs = kids(work, "tr");
    report.addedRows += 1;
  }
  rows.forEach((row, i) => {
    const cells = rowCells(trs[i + 1]);
    const values = [row.trade, row.place, row.content];
    values.forEach((value, c) => {
      const lines = linesOf(value);
      if (lines.length) setCellLines(cells[c], lines, WORKLOG_SIZE);
    });
  });
  report.rows = rows.length;
  return { bytes: saveDocx(pack), report };
}

// ---------------------------------------------------------------- TBM 일지

// model: { date: { y, m, d }, place: "101동 3층", work: "도배, 바닥마감", hazards: ["101동 3층 · 개구부 난간 미설치", ...] }
// 일시 칸은 양식의 "20  .   .   .  (   :   ~   :   )" 중 날짜 자리만 채우고 시간 자리는 그대로 둔다.
// 반환: { bytes, report: { hazards } }
export function fillTbmLog(templateBytes, model) {
  const pack = openDocx(templateBytes);
  const tables = bodyTables(pack.doc);
  const head = tables.find((t) => kids(t, "tr").some((tr) => rowCells(tr).some((tc) => squash(cellText(tc)) === "일시")));
  const risks = tables.find((t) => {
    const first = firstRowTexts(t);
    return first[0] === "번호" && (first[1] || "").startsWith("위험요인");
  });
  if (!head) throw missingTable("일시가 있는 머리글");
  if (!risks) throw missingTable("위험요인과 대책");

  // 칸이 한 줄보다 늘어나는 줄 수(어림). 같은 줄에 나란히 있는 칸은 더 많이 늘어난 쪽만 센다.
  let growth = 0;
  if (model.date) {
    const cell = valueCellOf(head, "일시");
    const old = cellText(cell);
    const { y, m, d } = model.date;
    const dateText = `${y}.  ${m}.  ${d}.`;
    // "20  .   .   ." 부분만 날짜로 바꾸고 뒤의 "(   :   ~   :   )"는 남긴다
    const rest = /^\s*20\s*\.\s*\.\s*\.\s*(.*)$/s.exec(old);
    setCellLines(cell, [rest ? `${dateText}  ${rest[1]}`.trimEnd() : dateText], TBM_SIZES[0]);
  }
  // 같은 줄의 두 칸(작업 장소 · 작업 내용)은 같은 크기로 쓴다(둘 중 더 작게 줄여야 하는 쪽에 맞춘다)
  const headCells = [];
  if (model.place) headCells.push({ cell: valueCellOf(head, "작업 장소"), lines: linesOf(model.place) });
  if (model.work) headCells.push({ cell: valueCellOf(head, "작업 내용"), lines: linesOf(model.work) });
  if (headCells.length) {
    const picks = headCells.map((h) => pickSize(h.cell, h.lines, TBM_SIZES));
    const size = Math.min(...picks.map((p) => p.size));
    headCells.forEach((h) => setCellLines(h.cell, h.lines, size));
    growth += Math.max(...headCells.map((h) => Math.max(0, rowsNeeded(h.lines, innerWidthPt(h.cell), size) - 1)));
  }

  const trs = kids(risks, "tr").slice(1);
  const hazards = (model.hazards || []).slice(0, trs.length);
  hazards.forEach((text, i) => {
    const cells = rowCells(trs[i]);
    if (cells.length < 3) throw new Error("양식의 위험요인 표 구조가 예상과 다릅니다.");
    const lines = linesOf(text);
    if (lines.length) growth += fillFitted(cells[1], lines, TBM_SIZES);
  });
  const spaced = growth > 0 ? shrinkSpacerBeforeNotes(pack.doc) : false;
  return { bytes: saveDocx(pack), report: { hazards: hazards.length, grownLines: growth, spacerRemoved: spaced } };
}
