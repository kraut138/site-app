// 용어 표를 엑셀·CSV 파일로 주고받는 곳: 파일 읽기(올리기)와 양식·현재 표 내려받기.
// 읽은 줄을 용어로 해석하는 일은 glossaryImport.js가 맡는다. 엑셀 파일은 골구도 내려받기에 쓰는 xlsx 라이브러리로 다룬다.
import * as XLSX from "xlsx";
import { IMPORT_LIMITS, decodeTextFile, looksBinary, looksLikeHtmlTable, parseDelimitedText } from "./glossaryImport.js";
import { defaultGlossary } from "./voice.js";

export const FILE_ERRORS = {
  none: "파일을 고르지 않았어요.",
  "too-big": `파일이 너무 커요. ${Math.round(IMPORT_LIMITS.maxBytes / 1024 / 1024)}MB 이하 파일을 올려 주세요.`,
  empty: "파일에서 읽을 내용을 찾지 못했어요. 첫 번째 시트에 현장 은어와 표준 용어가 적혀 있는지 확인해 주세요.",
  unreadable: "파일을 읽지 못했어요. 엑셀(.xlsx)이나 CSV 파일이 맞는지, 암호가 걸려 있지 않은지 확인해 주세요.",
};

function fileError(code) {
  return Object.assign(new Error(FILE_ERRORS[code]), { code: `import/${code}` });
}

function hasText(rows) {
  return rows.some((r) => Array.isArray(r) && r.some((c) => String(c == null ? "" : c).trim() !== ""));
}

// 엑셀 통합 문서에서 글자가 들어 있는 첫 시트를 줄·칸의 표로 꺼낸다.
function sheetTable(wb) {
  const names = wb.SheetNames || [];
  for (const name of names) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true });
    if (!hasText(rows)) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const full = ws["!fullref"] ? XLSX.utils.decode_range(ws["!fullref"]) : null;
    return {
      rows,
      rowOffset: range.s.r, // 시트의 위쪽이 비어 있으면 첫 줄이 1행이 아니다 - 줄 번호를 파일의 행 번호와 맞춘다
      sheetName: name,
      sheetCount: names.length,
      truncated: !!(full && full.e.r > range.e.r),
    };
  }
  return null;
}

// 파일 하나를 읽어 { kind: "sheet"|"text", rows, rowOffset, sheetName, sheetCount, encoding, truncated }로 돌려준다.
// 못 읽으면 code가 "import/…"인 오류를 던진다(none · too-big · empty · unreadable).
export async function readTermFile(file) {
  if (!file) throw fileError("none");
  if (file.size > IMPORT_LIMITS.maxBytes) throw fileError("too-big");
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw fileError("unreadable");
  }
  if (bytes.length === 0) throw fileError("empty");

  const cap = IMPORT_LIMITS.maxRows + 20; // 제목·빈 줄 몫을 조금 더 읽는다
  const zip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; // 엑셀(.xlsx) = zip
  const ole = bytes.length > 7 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0; // 예전 엑셀(.xls)
  const readOptions = { sheetRows: cap, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false };

  if (zip || ole) {
    let table = null;
    try {
      table = sheetTable(XLSX.read(bytes, { type: "array", ...readOptions }));
    } catch {
      throw fileError("unreadable");
    }
    if (!table) throw fileError("empty");
    return { kind: "sheet", encoding: "", ...table };
  }

  const utf16 = bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
  if (!utf16 && looksBinary(bytes)) throw fileError("unreadable"); // PDF·그림 같은 파일
  const { text, encoding } = decodeTextFile(bytes);
  if (looksLikeHtmlTable(text)) {
    // 엑셀이 아니라 HTML 표를 .xls로 저장해 주는 곳이 있다.
    let table = null;
    try {
      table = sheetTable(XLSX.read(text, { type: "string", ...readOptions }));
    } catch {
      throw fileError("unreadable");
    }
    if (!table) throw fileError("empty");
    return { kind: "sheet", encoding: "", ...table };
  }
  const all = parseDelimitedText(text);
  if (!hasText(all)) throw fileError("empty");
  return { kind: "text", rows: all.slice(0, cap), rowOffset: 0, sheetName: "", sheetCount: 0, encoding, truncated: all.length > cap };
}

// ---------------- 내려받기 ----------------
const HEADER = ["현장 은어", "표준 용어"];

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function saveSheet(rows, fileName) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 22 }, { wch: 44 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "용어표");
  XLSX.writeFile(wb, fileName);
}

// 올릴 때 어떤 모양으로 적으면 되는지 보여 주는 양식(제목 줄 + 예시 3줄).
export function downloadTemplate() {
  saveSheet([HEADER, ...defaultGlossary().slice(0, 3).map((t) => [t.slang, t.standard])], "용어DB_양식.xlsx");
}

// 지금 표 전체를 같은 모양의 엑셀로 받는다(고쳐서 다시 올리거나 백업해 두는 용도). 화면의 표와 같은 가나다순.
export function downloadTerms(terms) {
  const rows = [...(Array.isArray(terms) ? terms : [])].sort((a, b) => a.slang.localeCompare(b.slang, "ko")).map((t) => [t.slang, t.standard]);
  saveSheet([HEADER, ...rows], `용어DB_${stamp()}.xlsx`);
}
