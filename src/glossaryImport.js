// 엑셀·CSV 파일로 용어 표를 한꺼번에 올릴 때 쓰는 계산. 화면(GlossaryImport.jsx)과 저장소(api.js)가 같이 쓰며, 파일을 여는 일은 glossaryFile.js가 맡는다.
//
//   파일 → (줄·칸의 표) → parseTermRows: 제목 줄을 찾고 줄마다 검사한다
//        → planGlossaryImport: 지금 표와 견주어 추가·고침·그대로·지움을 센다
//        → applyGlossaryImport: 견준 대로 새 표를 만든다
//
// 은어가 같은 말인지는 표에서 쓰는 기준(slangKey: 띄어쓰기·대소문자 무시)을 그대로 쓴다.
// 줄 하나를 받아들이는 기준도 표에 직접 한 줄 넣을 때(checkTerm)와 같다.
import { GLOSSARY_LIMITS, cleanTermText, slangKey, checkTerm } from "./voice.js";

// maxBytes: 올릴 수 있는 파일 크기, maxRows: 읽는 줄 수의 한도, headerScan: 제목 줄을 찾아볼 맨 위 줄 수
export const IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 5000, headerScan: 10 };

// 칸 하나의 값을 표에 넣을 글자로 정리한다: 눈에 안 보이는 글자(너비 없는 공백 등)는 없애고, 공백은 정리하고, 숫자는 글자로 바꾼다.
function cleanCell(value) {
  if (value == null) return "";
  return cleanTermText(String(value).replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, ""));
}

// ---------------- 제목 줄 찾기 ----------------
// 칸의 글자가 아래 이름과 "똑같을 때만" 제목으로 본다(띄어쓰기·괄호 안 설명은 무시). 표준 용어 칸에 '표준 시방서' 같은 말이 있어도 제목으로 오해하지 않는다.
const SLANG_HEADERS = new Set(["현장은어", "은어", "현장용어", "현장말", "속어", "slang", "변환전", "원어"]);
const STANDARD_HEADERS = new Set(["표준용어", "표준어", "표준", "순화어", "순화용어", "바른말", "정식용어", "standard", "변환후"]);

function headerKind(value) {
  const text = cleanCell(value).replace(/[(（[【][^)）\]】]*[)）\]】]/g, ""); // "(예: 공구리)" 같은 설명은 뺀다
  const key = slangKey(text).replace(/[^\p{L}\p{N}]/gu, "");
  if (!key) return "";
  if (SLANG_HEADERS.has(key)) return "slang";
  if (STANDARD_HEADERS.has(key)) return "standard";
  return "";
}

// 맨 위에서 제목 줄을 찾는다. 제목만 있는 줄(칸이 1개)은 건너뛰며 찾고, 용어가 들어 있는 줄(칸 2개 이상)을 먼저 만나면 제목 줄이 없는 파일로 본다.
// 반환: { index, slangCol, standardCol } 또는 null. 제목이 한쪽만 알아볼 수 있으면 다른 쪽은 남은 첫 두 칸 중 하나로 짐작한다.
function findHeader(table) {
  let seen = 0;
  for (let i = 0; i < table.length && seen < IMPORT_LIMITS.headerScan; i += 1) {
    const cells = Array.isArray(table[i]) ? table[i] : [];
    const filled = cells.filter((c) => cleanCell(c)).length;
    if (filled === 0) continue;
    seen += 1;
    let slangCol = -1;
    let standardCol = -1;
    cells.forEach((c, col) => {
      const kind = headerKind(c);
      if (kind === "slang" && slangCol < 0) slangCol = col;
      if (kind === "standard" && standardCol < 0) standardCol = col;
    });
    if (slangCol < 0 && standardCol < 0) {
      if (filled >= 2) return null;
      continue;
    }
    if (slangCol < 0) slangCol = standardCol === 0 ? 1 : 0;
    if (standardCol < 0) standardCol = slangCol === 0 ? 1 : 0;
    return { index: i, slangCol, standardCol };
  }
  return null;
}

// ---------------- 줄 읽기·검사 ----------------
const SKIP_REASONS = {
  "empty-slang": "현장 은어가 비어 있어요",
  "empty-standard": "표준 용어가 비어 있어요",
  "long-slang": `현장 은어가 ${GLOSSARY_LIMITS.slang}자를 넘어요`,
  "long-standard": `표준 용어가 ${GLOSSARY_LIMITS.standard}자를 넘어요`,
  "no-letter": "글자나 숫자가 없는 은어예요",
  same: "은어와 표준 용어가 같아서 바뀌는 게 없어요",
};

// 줄·칸의 표(rows: 줄마다 칸 값의 배열)에서 용어 줄을 읽는다. rowOffset: 첫 줄이 파일에서 몇 번째 줄이었는지(0이면 1행부터).
// 반환:
//   header   : 제목 줄을 찾았으면 { row, slang, standard }(줄 번호와 제목 글자), 없으면 null
//   columns  : { slang, standard } 읽은 칸의 순서(0부터)
//   entries  : 받아들인 줄 [{ row, slang, standard }] - 같은 은어가 여러 번 나오면 먼저 나온 줄만
//   skipped  : 건너뛴 줄 [{ row, slang, standard, reason }]
//   read     : 읽은 줄 수(받아들인 줄 + 건너뛴 줄. 완전히 빈 줄은 세지 않는다)
export function parseTermRows(rows, rowOffset = 0) {
  const table = Array.isArray(rows) ? rows : [];
  const found = findHeader(table);
  const slangCol = found ? found.slangCol : 0;
  const standardCol = found ? found.standardCol : 1;
  const entries = [];
  const skipped = [];
  const firstRow = new Map(); // 은어 키 → 그 은어가 처음 나온 줄 번호
  for (let i = found ? found.index + 1 : 0; i < table.length; i += 1) {
    const cells = Array.isArray(table[i]) ? table[i] : [];
    const slang = cleanCell(cells[slangCol]);
    const standard = cleanCell(cells[standardCol]);
    if (!slang && !standard) continue; // 빈 줄(또는 다른 칸에만 글자가 있는 줄)
    const row = rowOffset + i + 1;
    const res = checkTerm({ slang, standard }, []);
    if (res.code !== "ok") {
      skipped.push({ row, slang, standard, reason: SKIP_REASONS[res.code] || "표에 넣을 수 없는 줄이에요" });
      continue;
    }
    const key = slangKey(res.slang);
    if (firstRow.has(key)) {
      skipped.push({ row, slang, standard, reason: `같은 은어가 ${firstRow.get(key)}행에 이미 있어요` });
      continue;
    }
    firstRow.set(key, row);
    entries.push({ row, slang: res.slang, standard: res.standard });
  }
  return {
    header: found
      ? { row: rowOffset + found.index + 1, slang: cleanCell(table[found.index][found.slangCol]), standard: cleanCell(table[found.index][found.standardCol]) }
      : null,
    columns: { slang: slangCol, standard: standardCol },
    entries,
    skipped,
    read: entries.length + skipped.length,
  };
}

// 저장하기 직전에 한 번 더 거른다(화면이 넘겨 준 값을 그대로 믿지 않는다): 표에 넣을 수 없는 줄은 빼고, 같은 은어는 먼저 나온 줄만 남긴다.
export function cleanImportEntries(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((item, i) => {
    const res = checkTerm({ slang: item && item.slang, standard: item && item.standard }, []);
    if (res.code !== "ok") return;
    const key = slangKey(res.slang);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ row: item && Number(item.row) > 0 ? Number(item.row) : i + 1, slang: res.slang, standard: res.standard });
  });
  return out;
}

// ---------------- 지금 표와 견주기 ----------------
// mode "merge": 지금 표에 더한다 - 같은 은어는 파일의 표준 용어로 고치고, 파일에 없는 기존 용어는 그대로 둔다.
// mode "replace": 표 전체를 파일 내용으로 바꾼다 - 파일에 없는 기존 용어는 지운다.
// 반환: { mode, add, update, same, remove, total(반영한 뒤 표의 줄 수), blocked(""이면 반영할 수 있음 | "full" | "no-rows"), changes(표가 실제로 바뀌는 줄 수) }
//   add    [{ row, slang, standard }]            새로 들어가는 용어
//   update [{ row, id, slang, from, to }]        같은 은어의 표준 용어가 바뀜(은어 글자는 지금 표의 것을 그대로 둔다)
//   same   [{ row, id, slang, standard }]        이미 표에 똑같이 들어 있음
//   remove [{ id, slang, standard }]             (replace) 파일에 없어 지워짐
export function planGlossaryImport(entries, existing, mode = "merge") {
  const list = Array.isArray(existing) ? existing : [];
  const way = mode === "replace" ? "replace" : "merge";
  const byKey = new Map(list.map((t) => [slangKey(t.slang), t]));
  const add = [];
  const update = [];
  const same = [];
  const seen = new Set();
  (Array.isArray(entries) ? entries : []).forEach((e) => {
    const key = slangKey(e.slang);
    if (seen.has(key)) return;
    seen.add(key);
    const cur = byKey.get(key);
    if (!cur) add.push({ row: e.row, slang: e.slang, standard: e.standard });
    else if (cur.standard === e.standard) same.push({ row: e.row, id: cur.id, slang: cur.slang, standard: cur.standard });
    else update.push({ row: e.row, id: cur.id, slang: cur.slang, from: cur.standard, to: e.standard });
  });
  const remove = way === "replace" ? list.filter((t) => !seen.has(slangKey(t.slang))).map((t) => ({ id: t.id, slang: t.slang, standard: t.standard })) : [];
  const total = way === "replace" ? add.length + update.length + same.length : list.length + add.length;
  let blocked = "";
  if (way === "replace" && seen.size === 0) blocked = "no-rows"; // 올릴 줄이 하나도 없는데 표를 바꾸면 표가 통째로 비어 버린다
  else if (total > GLOSSARY_LIMITS.max) blocked = "full";
  return { mode: way, add, update, same, remove, total, blocked, changes: add.length + update.length + remove.length };
}

// planGlossaryImport가 견준 대로 새 표를 만든다. 새 줄의 id는 makeId()로 만들고, 겹치면 다시 만든다.
export function applyGlossaryImport(plan, existing, makeId) {
  const list = Array.isArray(existing) ? existing : [];
  const standards = new Map(plan.update.map((u) => [u.id, u.to]));
  const gone = new Set(plan.remove.map((t) => t.id));
  const used = new Set(list.map((t) => t.id));
  const next = list.filter((t) => !gone.has(t.id)).map((t) => (standards.has(t.id) ? { id: t.id, slang: t.slang, standard: standards.get(t.id) } : t));
  plan.add.forEach((a) => {
    let id = makeId();
    while (used.has(id)) id = makeId();
    used.add(id);
    next.push({ id, slang: a.slang, standard: a.standard });
  });
  return next;
}

// 글자가 한 개뿐인 은어가 몇 개인지(문장 속 같은 글자가 모두 바뀌어 놀랄 수 있어 미리 알려 준다).
export function countShortSlang(items) {
  return (Array.isArray(items) ? items : []).filter((t) => Array.from(slangKey(t.slang)).length === 1).length;
}

// ---------------- 글자 파일(CSV·탭으로 나눈 글) 읽기 ----------------
// 한국어 엑셀의 "CSV(쉼표로 분리)"는 UTF-8이 아니라 예전 한글 인코딩(CP949/EUC-KR)으로 저장되고, "유니코드 텍스트"는 UTF-16이다 - 셋 다 읽는다.
export function decodeTextFile(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16" };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" }; // 맨 앞의 BOM은 디코더가 지운다
  } catch {
    try {
      return { text: new TextDecoder("euc-kr").decode(bytes), encoding: "euc-kr" };
    } catch {
      return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8" };
    }
  }
}

// 엑셀도 글자 파일도 아닌 파일(PDF·그림 등)을 알아본다: 맨 앞이 %PDF이거나, 앞부분에 글자 파일에는 나올 수 없는 0 바이트가 있다.
// (UTF-16 글자 파일은 0 바이트가 들어 있어 앞에서 따로 가려내야 한다.)
export function looksBinary(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true;
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i += 1) if (bytes[i] === 0) return true;
  return false;
}

// 엑셀이 아닌데 .xls로 저장해 주는 곳(HTML 표)을 알아본다.
export function looksLikeHtmlTable(text) {
  const head = String(text || "").slice(0, 2000);
  return /^\s*<(?:!doctype|html|table|meta|\?xml)/i.test(head) && /<table[\s>]/i.test(String(text).slice(0, 200000));
}

// 줄 끝은 \r\n·\n·\r 모두, 칸 나누개는 쉼표·탭·세미콜론 중 첫 줄들에 가장 많이 나온 것. 큰따옴표로 감싼 칸 안의 쉼표·줄바꿈·큰따옴표("")를 지킨다.
// 반환: 줄마다 칸(글자)의 배열. 완전히 빈 줄도 한 줄([""])로 들어가서 줄 번호가 파일과 맞는다.
export function parseDelimitedText(input) {
  let text = String(input == null ? "" : input);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let delimiter = "";
  const sep = /^sep=(.)\r?\n/i.exec(text); // 엑셀이 가끔 맨 위에 넣는 "sep=;" 줄(엑셀에서는 보이지 않는다)
  if (sep) {
    delimiter = sep[1];
    text = text.slice(sep[0].length);
  }
  if (!delimiter) delimiter = guessDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let fieldStart = true;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && fieldStart) {
      quoted = true;
      fieldStart = false;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
      fieldStart = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      fieldStart = true;
    } else {
      cell += ch;
      fieldStart = false;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// 첫 몇 줄에서 따옴표 밖의 쉼표·탭·세미콜론을 세어 가장 많은 것을 나누개로 본다(같으면 쉼표 > 탭 > 세미콜론, 하나도 없으면 쉼표).
function guessDelimiter(text) {
  const counts = { ",": 0, "\t": 0, ";": 0 };
  let quoted = false;
  let lines = 0;
  for (let i = 0; i < text.length && lines < 5; i += 1) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      lines += 1;
    } else if (!quoted && ch in counts) counts[ch] += 1;
  }
  let best = ",";
  [",", "\t", ";"].forEach((d) => {
    if (counts[d] > counts[best]) best = d;
  });
  return best;
}
