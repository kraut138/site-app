// 워드(.docx) 파일을 화면에 그려 보여 주는 "미리보기". 내려받을 파일(양식에 글을 채운 결과)을 그대로 읽어서 그리므로,
// 미리보기에 보이는 것 = 내려받아 워드에서 열었을 때의 내용이다. 서류 탭이 채우는 양식(작업일보·TBM 일지)에 나오는 것을 그린다.
//   그리는 것: 쪽 크기·여백, 문단(정렬·들여쓰기·간격·줄 간격·탭·번호/글머리표), 글자(크기·굵게·기울임·밑줄·색·자간·위/아래 첨자·배경),
//             표(칸 합치기·너비·높이·테두리·배경·안 여백·세로 정렬), 꼬리말/머리말, 작은 도형(막대선 정도)
//   그리지 않는 것: 그림 파일·차트·수식·글상자·변경 추적 삭제 내용 같은 것(양식에 없다). 만나면 건너뛴다.
// 글은 textContent로만 넣어 HTML이 섞일 수 없다. 글꼴은 이름이 그대로 있으면 쓰고, 없으면 고딕/명조 두 갈래의 기기 글꼴로 바꾼다(줄 나눔은 워드와 조금 다를 수 있다).
import { unzipSync, strFromU8 } from "fflate";

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

const TW = 96 / 1440; // 트윕(1/20 포인트) 하나가 화면에서 몇 px인지
const HPX = 96 / 144; // 반 포인트 하나가 몇 px인지(글자 크기 sz)
const EMU = 96 / 914400;
const px = (n) => `${Math.round(n * 100) / 100}px`;

const GOTHIC = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","Noto Sans CJK KR","Nanum Gothic",sans-serif';
const SERIF = '"Batang","AppleMyungjo","Noto Serif KR","Noto Serif CJK KR","Nanum Myeongjo",serif';
const isSerifName = (name) => /바탕|명조|궁서|Batang|Myungjo|Myeongjo|Gungsuh|Mincho|Times|Cambria|Georgia|Garamond|Serif/i.test(name || "");

// 한 줄 높이(글자 크기의 몇 배). 워드의 "한 줄 간격"은 글꼴마다 다르지만 한글 문서에서 흔한 값에 맞춘다.
const SINGLE_LINE = 1.3;

// ---------------------------------------------------------------- XML 도우미

const kids = (el, name, ns = NS_W) => (el ? Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.namespaceURI === ns && n.localName === name) : []);
const kid = (el, name, ns = NS_W) => kids(el, name, ns)[0] || null;
const wAttr = (el, name) => (el ? el.getAttributeNS(NS_W, name) : null);
const val = (el) => wAttr(el, "val");
const num = (s) => {
  if (s === null || s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));
const MAX_COLS = 200; // 표 한 줄의 칸 수 상한(망가진 값 때문에 끝없이 칸을 만들지 않게)
// <w:b/> = 켬, <w:b w:val="0"/> = 끔, 없으면 정해지지 않음
function onOff(el) {
  if (!el) return undefined;
  const v = (val(el) || "").toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
}
const hexColor = (v) => (v && /^[0-9a-fA-F]{6}$/.test(v) ? `#${v}` : null);

function parseXml(bytes, what) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
  } catch (e) {
    throw new Error(`${what}을(를) 읽을 수 없습니다.`); // 브라우저는 깨진 XML에도 던지지 않고 parsererror를 돌려주지만, 던지는 환경에서도 같은 안내가 나가게 한다
  }
  if (doc.getElementsByTagName("parsererror").length > 0 || !doc.documentElement) throw new Error(`${what}을(를) 읽을 수 없습니다.`);
  return doc;
}

// ---------------------------------------------------------------- 글자·문단 속성 읽기

function readRPr(rPr) {
  const o = {};
  if (!rPr) return o;
  for (const c of Array.from(rPr.childNodes)) {
    if (c.nodeType !== 1 || c.namespaceURI !== NS_W) continue;
    switch (c.localName) {
      case "b":
        o.b = onOff(c);
        break;
      case "i":
        o.i = onOff(c);
        break;
      case "strike":
      case "dstrike":
        o.strike = onOff(c);
        break;
      case "caps":
        o.caps = onOff(c);
        break;
      case "smallCaps":
        o.smallCaps = onOff(c);
        break;
      case "vanish":
        o.vanish = onOff(c);
        break;
      case "u": {
        const v = val(c);
        o.u = v && v !== "none" ? v : false;
        break;
      }
      case "color":
        o.color = val(c) || undefined;
        break;
      case "sz":
        o.sz = num(val(c));
        break;
      case "spacing":
        o.spacing = num(val(c));
        break;
      case "position":
        o.position = num(val(c));
        break;
      case "shd":
        o.shd = wAttr(c, "fill") || undefined;
        break;
      case "highlight":
        o.highlight = val(c) || undefined;
        break;
      case "vertAlign":
        o.vertAlign = val(c) || undefined;
        break;
      case "rStyle":
        o.rStyle = val(c) || undefined;
        break;
      case "rFonts":
        o.fonts = {
          ascii: wAttr(c, "ascii") || undefined,
          hAnsi: wAttr(c, "hAnsi") || undefined,
          eastAsia: wAttr(c, "eastAsia") || undefined,
          asciiTheme: wAttr(c, "asciiTheme") || undefined,
          hAnsiTheme: wAttr(c, "hAnsiTheme") || undefined,
          eastAsiaTheme: wAttr(c, "eastAsiaTheme") || undefined,
        };
        break;
      default:
        break;
    }
  }
  return o;
}

function readBorder(el) {
  if (!el) return undefined;
  const v = val(el);
  if (!v || v === "nil" || v === "none") return { none: true };
  return { style: v, sz: num(wAttr(el, "sz")) || 4, color: wAttr(el, "color") || "auto" };
}

function readPPr(pPr) {
  const o = {};
  if (!pPr) return o;
  for (const c of Array.from(pPr.childNodes)) {
    if (c.nodeType !== 1 || c.namespaceURI !== NS_W) continue;
    switch (c.localName) {
      case "pStyle":
        o.pStyle = val(c) || undefined;
        break;
      case "jc":
        o.jc = val(c) || undefined;
        break;
      case "ind":
        o.ind = {
          left: num(wAttr(c, "left") ?? wAttr(c, "start")),
          right: num(wAttr(c, "right") ?? wAttr(c, "end")),
          firstLine: num(wAttr(c, "firstLine")),
          hanging: num(wAttr(c, "hanging")),
        };
        break;
      case "spacing":
        o.spacing = { before: num(wAttr(c, "before")), after: num(wAttr(c, "after")), line: num(wAttr(c, "line")), lineRule: wAttr(c, "lineRule") || undefined };
        break;
      case "tabs":
        o.tabs = kids(c, "tab").map((t) => ({ val: val(t) || "left", pos: num(wAttr(t, "pos")) }));
        break;
      case "numPr": {
        const n = num(val(kid(c, "numId")));
        o.numPr = { numId: n, ilvl: num(val(kid(c, "ilvl"))) ?? 0 };
        break;
      }
      case "shd":
        o.shd = wAttr(c, "fill") || undefined;
        break;
      case "pBdr":
        o.pBdr = { top: readBorder(kid(c, "top")), bottom: readBorder(kid(c, "bottom")), left: readBorder(kid(c, "left")), right: readBorder(kid(c, "right")) };
        break;
      case "rPr":
        o.markR = readRPr(c);
        break;
      default:
        break;
    }
  }
  return o;
}

function mergeR(...bags) {
  const out = {};
  for (const b of bags) {
    if (!b) continue;
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue;
      out[k] = k === "fonts" ? { ...(out.fonts || {}), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) } : v;
    }
  }
  return out;
}

function mergeP(...bags) {
  const out = {};
  for (const b of bags) {
    if (!b) continue;
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue;
      if (k === "ind" || k === "spacing" || k === "pBdr") out[k] = { ...(out[k] || {}), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) };
      else if (k === "tabs") {
        const have = new Map((out.tabs || []).map((t) => [t.pos, t]));
        for (const t of v) have.set(t.pos, t);
        out.tabs = Array.from(have.values()).filter((t) => t.val !== "clear");
      } else if (k === "markR") out.markR = mergeR(out.markR, v);
      else out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------- 표 속성 읽기

function readCellMar(el) {
  if (!el) return undefined;
  const m = {};
  for (const side of ["top", "left", "bottom", "right", "start", "end"]) {
    const n = num(wAttr(kid(el, side), "w"));
    if (n !== undefined) m[side === "start" ? "left" : side === "end" ? "right" : side] = n;
  }
  return m;
}

function readTblBorders(el) {
  if (!el) return undefined;
  const o = {};
  for (const side of ["top", "left", "bottom", "right", "insideH", "insideV"]) {
    const b = readBorder(kid(el, side));
    if (b) o[side] = b;
  }
  return o;
}

function readTblPr(tblPr) {
  const o = {};
  if (!tblPr) return o;
  o.style = val(kid(tblPr, "tblStyle")) || undefined;
  o.borders = readTblBorders(kid(tblPr, "tblBorders"));
  o.cellMar = readCellMar(kid(tblPr, "tblCellMar"));
  o.jc = val(kid(tblPr, "jc")) || undefined;
  o.ind = num(wAttr(kid(tblPr, "tblInd"), "w"));
  const w = kid(tblPr, "tblW");
  if (w && (wAttr(w, "type") || "dxa") === "dxa") o.width = num(wAttr(w, "w"));
  return o;
}

// ---------------------------------------------------------------- 스타일 · 번호 · 글꼴(테마)

function buildStyles(doc) {
  const byId = new Map();
  const out = { byId, defaults: { r: {}, p: {} }, defPara: null, defTable: null, cache: new Map() };
  if (!doc) return out;
  const root = doc.documentElement;
  const dd = kid(root, "docDefaults");
  if (dd) {
    out.defaults.r = readRPr(kid(kid(dd, "rPrDefault"), "rPr"));
    out.defaults.p = readPPr(kid(kid(dd, "pPrDefault"), "pPr"));
  }
  for (const st of kids(root, "style")) {
    const id = wAttr(st, "styleId");
    if (!id) continue;
    const type = wAttr(st, "type");
    const tblPr = readTblPr(kid(st, "tblPr"));
    const tcShd = wAttr(kid(kid(st, "tcPr"), "shd"), "fill") || undefined;
    byId.set(id, { id, type, basedOn: val(kid(st, "basedOn")) || null, p: readPPr(kid(st, "pPr")), r: readRPr(kid(st, "rPr")), tbl: tblPr, tcShd });
    const isDefault = wAttr(st, "default");
    if (isDefault === "1" || isDefault === "true") {
      if (type === "paragraph") out.defPara = id;
      if (type === "table") out.defTable = id;
    }
  }
  return out;
}

// 스타일 한 개를 바탕 스타일부터 차례로 합친 결과 { p, r, tbl, tcShd }
function resolveStyle(styles, id) {
  if (!id || !styles.byId.has(id)) return { p: {}, r: {}, tbl: {}, tcShd: undefined };
  if (styles.cache.has(id)) return styles.cache.get(id);
  const chain = [];
  const seen = new Set();
  for (let cur = id; cur && styles.byId.has(cur) && !seen.has(cur); cur = styles.byId.get(cur).basedOn) {
    seen.add(cur);
    chain.unshift(styles.byId.get(cur));
  }
  const out = { p: mergeP(...chain.map((s) => s.p)), r: mergeR(...chain.map((s) => s.r)), tbl: {}, tcShd: undefined };
  for (const s of chain) {
    const t = s.tbl || {};
    out.tbl = {
      ...out.tbl,
      ...Object.fromEntries(Object.entries(t).filter(([k, v]) => v !== undefined && k !== "borders" && k !== "cellMar")),
      borders: { ...(out.tbl.borders || {}), ...(t.borders || {}) },
      cellMar: { ...(out.tbl.cellMar || {}), ...(t.cellMar || {}) },
    };
    if (s.tcShd) out.tcShd = s.tcShd;
  }
  styles.cache.set(id, out);
  return out;
}

function buildNumbering(doc) {
  const out = { abstracts: new Map(), nums: new Map(), counters: new Map() };
  if (!doc) return out;
  const root = doc.documentElement;
  for (const an of kids(root, "abstractNum")) {
    const levels = new Map();
    for (const lvl of kids(an, "lvl")) {
      const ilvl = num(wAttr(lvl, "ilvl")) ?? 0;
      levels.set(ilvl, {
        fmt: val(kid(lvl, "numFmt")) || "decimal",
        text: val(kid(lvl, "lvlText")) ?? "",
        start: num(val(kid(lvl, "start"))) ?? 1,
        p: readPPr(kid(lvl, "pPr")),
        r: readRPr(kid(lvl, "rPr")),
        suff: val(kid(lvl, "suff")) || "tab",
      });
    }
    out.abstracts.set(wAttr(an, "abstractNumId"), levels);
  }
  for (const n of kids(root, "num")) {
    const overrides = new Map();
    for (const o of kids(n, "lvlOverride")) {
      const start = num(val(kid(o, "startOverride")));
      if (start !== undefined) overrides.set(num(wAttr(o, "ilvl")) ?? 0, start);
    }
    out.nums.set(num(wAttr(n, "numId")), { abstract: val(kid(n, "abstractNumId")), overrides });
  }
  return out;
}

function numberLabel(numbering, numId, ilvl) {
  const n = numbering.nums.get(numId);
  const levels = n && numbering.abstracts.get(n.abstract);
  const lvl = levels && levels.get(ilvl);
  if (!lvl) return null;
  let counters = numbering.counters.get(numId);
  if (!counters) {
    counters = [];
    numbering.counters.set(numId, counters);
  }
  const startOf = (k) => (n.overrides.has(k) ? n.overrides.get(k) : (levels.get(k) || {}).start ?? 1);
  counters[ilvl] = counters[ilvl] === undefined ? startOf(ilvl) : counters[ilvl] + 1;
  counters.length = ilvl + 1; // 아래 단계는 다시 시작
  if (lvl.fmt === "bullet") {
    const ch = lvl.text || "•";
    const code = ch.codePointAt(0);
    return { lvl, text: code >= 0xf000 && code <= 0xf0ff ? "•" : ch };
  }
  const text = lvl.text.replace(/%(\d)/g, (m, d) => {
    const k = Number(d) - 1;
    const v = counters[k] === undefined ? startOf(k) : counters[k];
    return formatNumber((levels.get(k) || lvl).fmt, v);
  });
  return { lvl, text };
}

const GANADA = "가나다라마바사아자차카타파하";
const CHOSUNG = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ";
function roman(n) {
  if (!(n >= 1 && n <= 3999)) return String(n);
  const map = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let s = "";
  let r = n;
  for (const [v, t] of map) while (r >= v) { s += t; r -= v; }
  return s;
}
function letters(n) {
  let s = "";
  let r = n;
  while (r > 0) {
    s = String.fromCharCode(65 + ((r - 1) % 26)) + s;
    r = Math.floor((r - 1) / 26);
  }
  return s;
}
function formatNumber(fmt, n) {
  switch (fmt) {
    case "decimalZero":
      return String(n).padStart(2, "0");
    case "upperLetter":
      return letters(n);
    case "lowerLetter":
      return letters(n).toLowerCase();
    case "upperRoman":
      return roman(n);
    case "lowerRoman":
      return roman(n).toLowerCase();
    case "ganada":
      return GANADA[(n - 1) % GANADA.length];
    case "chosung":
      return CHOSUNG[(n - 1) % CHOSUNG.length];
    case "decimalEnclosedCircle":
      return n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : String(n);
    default:
      return String(n);
  }
}

function readTheme(bytes) {
  const out = { minor: {}, major: {} };
  if (!bytes) return out;
  try {
    const doc = parseXml(bytes, "테마");
    const scheme = doc.getElementsByTagNameNS(NS_A, "fontScheme")[0];
    for (const which of ["major", "minor"]) {
      const f = scheme && kid(scheme, `${which}Font`, NS_A);
      if (!f) continue;
      out[which].latin = (kid(f, "latin", NS_A) || { getAttribute: () => "" }).getAttribute("typeface") || "";
      out[which].ea = (kid(f, "ea", NS_A) || { getAttribute: () => "" }).getAttribute("typeface") || "";
      const hang = kids(f, "font", NS_A).find((x) => x.getAttribute("script") === "Hang");
      if (!out[which].ea && hang) out[which].ea = hang.getAttribute("typeface") || "";
    }
  } catch (e) {
    // 테마를 못 읽어도 그리는 데는 지장이 없다
  }
  return out;
}

const quote = (name) => `"${String(name).replace(/["\\]/g, "")}"`;
function fontFamily(fonts, theme) {
  if (!fonts) return "";
  const themed = (t, kind) => {
    if (!t) return "";
    const which = /^major/.test(t) ? theme.major : theme.minor;
    return (kind === "ea" ? which.ea : which.latin) || "";
  };
  const latin = fonts.ascii || themed(fonts.asciiTheme, "latin") || fonts.hAnsi || themed(fonts.hAnsiTheme, "latin") || "";
  const ea = fonts.eastAsia || themed(fonts.eastAsiaTheme, "ea") || "";
  const names = [];
  for (const n of [latin, ea]) if (n && !names.includes(n)) names.push(n);
  if (!names.length) return "";
  return `${names.map(quote).join(",")},${isSerifName(ea || latin) ? SERIF : GOTHIC}`;
}

// ---------------------------------------------------------------- CSS로 바꾸기

const HIGHLIGHT = { yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", blue: "#0000ff", red: "#ff0000", darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000", darkYellow: "#808000", darkGray: "#808080", lightGray: "#c0c0c0", black: "#000000" };

function runCss(r, theme) {
  const parts = [];
  if (r.sz) parts.push(`font-size:${px(r.sz * HPX)}`);
  const ff = fontFamily(r.fonts, theme);
  if (ff) parts.push(`font-family:${ff}`);
  if (r.b) parts.push("font-weight:700");
  if (r.i) parts.push("font-style:italic");
  const deco = [];
  if (r.u) deco.push("underline");
  if (r.strike) deco.push("line-through");
  if (deco.length) parts.push(`text-decoration:${deco.join(" ")}`);
  if (r.u === "double") parts.push("text-decoration-style:double");
  const color = hexColor(r.color);
  if (color) parts.push(`color:${color}`);
  const bg = hexColor(r.shd) || (r.highlight && HIGHLIGHT[r.highlight]);
  if (bg) parts.push(`background-color:${bg}`);
  if (r.spacing) parts.push(`letter-spacing:${px(r.spacing * TW)}`);
  if (r.caps) parts.push("text-transform:uppercase");
  if (r.smallCaps) parts.push("font-variant:small-caps");
  if (r.vertAlign === "superscript") parts.push("vertical-align:super;font-size:0.65em");
  else if (r.vertAlign === "subscript") parts.push("vertical-align:sub;font-size:0.65em");
  else if (r.position) parts.push(`vertical-align:${px(r.position * HPX)}`);
  return parts.join(";");
}

const BORDER_STYLE = { single: "solid", thick: "solid", double: "double", dotted: "dotted", dashed: "dashed", dashSmallGap: "dashed", dotDash: "dashed", dotDotDash: "dashed", wave: "solid" };
function borderCss(b) {
  if (!b || b.none) return "none";
  const pt = (b.sz || 4) / 8;
  let w = Math.max(1, Math.round(pt * (96 / 72)));
  const style = BORDER_STYLE[b.style] || "solid";
  if (style === "double") w = Math.max(3, w);
  return `${w}px ${style} ${hexColor(b.color) || "#000"}`;
}

function paraCss(p, markR) {
  const parts = ["margin:0", "white-space:pre-wrap", "overflow-wrap:anywhere", "box-sizing:border-box", "position:relative"];
  const jc = p.jc;
  if (jc === "center") parts.push("text-align:center");
  else if (jc === "right" || jc === "end") parts.push("text-align:right");
  else if (jc === "both" || jc === "distribute" || jc === "thaiDistribute") {
    parts.push("text-align:justify");
    if (jc === "distribute") parts.push("text-align-last:justify");
  } else parts.push("text-align:left");
  const ind = p.ind || {};
  if (ind.left) parts.push(`margin-left:${px(ind.left * TW)}`);
  if (ind.right) parts.push(`margin-right:${px(ind.right * TW)}`);
  if (ind.hanging) parts.push(`text-indent:${px(-ind.hanging * TW)}`);
  else if (ind.firstLine) parts.push(`text-indent:${px(ind.firstLine * TW)}`);
  const sp = p.spacing || {};
  if (sp.before) parts.push(`padding-top:${px(sp.before * TW)}`);
  if (sp.after) parts.push(`padding-bottom:${px(sp.after * TW)}`);
  if (sp.line) {
    if (sp.lineRule === "exact") parts.push(`line-height:${px(sp.line * TW)}`);
    else if (sp.lineRule === "atLeast") parts.push(`line-height:${px(sp.line * TW)}`);
    else parts.push(`line-height:${Math.round(SINGLE_LINE * (sp.line / 240) * 1000) / 1000}`);
  } else parts.push(`line-height:${SINGLE_LINE}`);
  const bg = hexColor(p.shd);
  if (bg) parts.push(`background-color:${bg}`);
  if (p.pBdr) for (const side of ["top", "bottom", "left", "right"]) if (p.pBdr[side]) parts.push(`border-${side}:${borderCss(p.pBdr[side])}`);
  return parts.join(";") + (markR ? ";" + markR : "");
}

// ---------------------------------------------------------------- 그리기

function el(doc, tag, style, text) {
  const e = doc.createElement(tag);
  if (style) e.style.cssText = style;
  if (text !== undefined) e.textContent = text;
  return e;
}

// 도형(막대선 같은 작은 것): 크기와 채움색만 그린다
function drawingEl(drawing, ctx) {
  const inline = kid(drawing, "inline", NS_WP);
  if (!inline) return null; // 떠 있는 도형(anchor)은 그리지 않는다
  const ext = kid(inline, "extent", NS_WP);
  const cx = num(ext && ext.getAttribute("cx")) || 0;
  const cy = num(ext && ext.getAttribute("cy")) || 0;
  if (!cx && !cy) return null;
  const hasPic = inline.getElementsByTagName("pic:pic").length > 0 || inline.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/picture", "pic").length > 0;
  const fill = inline.getElementsByTagNameNS(NS_A, "srgbClr")[0];
  const color = fill ? hexColor(fill.getAttribute("val")) : null;
  if (hasPic || !color) return el(ctx.doc, "span", `display:inline-block;width:${px(cx * EMU)};height:${px(cy * EMU)}`);
  return el(ctx.doc, "span", `display:inline-block;width:${px(Math.max(1, cx * EMU))};height:${px(Math.max(1, cy * EMU))};background:${color}`);
}

// 글 조각(run)의 자식(글·탭·줄바꿈·도형)을 span 안에 채운다. 내용이 있으면 true
function fillRun(node, ctx, span) {
  let any = false;
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType !== 1) continue;
    if (c.namespaceURI === NS_MC && c.localName === "AlternateContent") {
      const choice = kid(c, "Choice", NS_MC);
      if (choice && fillRun(choice, ctx, span)) any = true;
      continue;
    }
    if (c.namespaceURI !== NS_W) continue;
    switch (c.localName) {
      case "t":
        if (c.textContent) {
          span.appendChild(ctx.doc.createTextNode(c.textContent));
          any = true;
        }
        break;
      case "tab":
      case "ptab": {
        const t = el(ctx.doc, "span", "display:inline-block;width:0;white-space:pre");
        t.className = "pwv-tab";
        span.appendChild(t);
        ctx.tabs.push(t);
        any = true;
        break;
      }
      case "br":
        if (!wAttr(c, "type") || wAttr(c, "type") === "textWrapping") {
          span.appendChild(ctx.doc.createElement("br"));
          any = true;
        }
        break;
      case "noBreakHyphen":
        span.appendChild(ctx.doc.createTextNode("\u2011"));
        any = true;
        break;
      case "drawing": {
        const d = drawingEl(c, ctx);
        if (d) {
          span.appendChild(d);
          any = true;
        }
        break;
      }
      default:
        break;
    }
  }
  return any;
}

function renderRun(r, ctx, base, parent) {
  const direct = readRPr(kid(r, "rPr"));
  const props = mergeR(base, direct.rStyle ? resolveStyle(ctx.styles, direct.rStyle).r : null, direct);
  if (props.vanish) return false;
  const span = el(ctx.doc, "span", runCss(props, ctx.theme));
  const any = fillRun(r, ctx, span);
  if (any) parent.appendChild(span);
  return any;
}

// 문단 안쪽(글·탭·줄바꿈…)을 parent에 채운다. 내용이 있으면 true
function renderInline(node, ctx, base, parent) {
  let any = false;
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType !== 1) continue;
    if (c.namespaceURI === NS_W) {
      switch (c.localName) {
        case "r":
          if (renderRun(c, ctx, base, parent)) any = true;
          break;
        case "hyperlink":
        case "ins":
        case "smartTag":
        case "fldSimple":
        case "customXml":
        case "sdtContent":
          if (renderInline(c, ctx, base, parent)) any = true;
          break;
        case "sdt":
          if (renderInline(kid(c, "sdtContent") || c, ctx, base, parent)) any = true;
          break;
        default:
          break; // del, proofErr, bookmark … 는 건너뛴다
      }
    } else if (c.namespaceURI === NS_MC && c.localName === "AlternateContent") {
      const choice = kid(c, "Choice", NS_MC);
      if (choice && renderInline(choice, ctx, base, parent)) any = true;
    }
  }
  return any;
}

function renderParagraph(p, ctx, tableStyle) {
  const direct = readPPr(kid(p, "pPr"));
  const paraStyleId = direct.pStyle || ctx.styles.defPara;
  const style = resolveStyle(ctx.styles, paraStyleId);
  const tblP = tableStyle ? tableStyle.p : {};
  const tblR = tableStyle ? tableStyle.r : {};
  let merged = mergeP(ctx.styles.defaults.p, tblP, style.p, direct);
  let label = null;
  if (merged.numPr && merged.numPr.numId) {
    label = numberLabel(ctx.numbering, merged.numPr.numId, merged.numPr.ilvl || 0);
    if (label) merged = mergeP(ctx.styles.defaults.p, tblP, style.p, label.lvl.p, direct);
  }
  const base = mergeR(ctx.styles.defaults.r, tblR, style.r);
  const markR = mergeR(base, direct.markR);
  const box = el(ctx.doc, "div", paraCss(merged, runCss({ ...markR, vertAlign: undefined, position: undefined, u: false, shd: undefined, highlight: undefined }, ctx.theme)));
  if (merged.jc === "distribute") box.style.textAlignLast = "justify";
  if (label) {
    const labelR = mergeR(base, label.lvl.r);
    const hang = ((merged.ind && merged.ind.hanging) || 0) * TW;
    const spaced = label.lvl.suff === "space";
    const tag = el(ctx.doc, "span", `${runCss(labelR, ctx.theme)};display:inline-block;min-width:${spaced ? "0" : px(hang)};text-indent:0;white-space:pre`, spaced ? `${label.text} ` : label.text);
    box.appendChild(tag);
  }
  const hasTabsBefore = ctx.tabs.length;
  const any = renderInline(p, ctx, base, box);
  if (!any && !label) box.appendChild(el(ctx.doc, "span", "", "\u200b")); // 빈 문단도 줄 높이를 유지한다
  if (ctx.tabs.length > hasTabsBefore) {
    ctx.tabParas.push({ box, tabs: ctx.tabs.slice(hasTabsBefore), stops: (merged.tabs || []).map((t) => t.pos).filter((n) => n !== undefined).sort((a, b) => a - b), left: ((merged.ind && merged.ind.left) || 0) * TW });
  }
  return box;
}

// 탭 글자의 너비를 정한다. 탭은 "지금 위치 다음의 탭 자리"까지 이어지므로, 앞에서부터 차례로 실제 위치를 재서 정한다.
// 탭 자리는 문단 맨 왼쪽(들여쓰기 전)에서부터 잰 값이고, 정해 둔 자리가 없으면 기본 간격(defaultTab)마다 있다.
function layoutTabs(ctx) {
  for (const info of ctx.tabParas) {
    const { box, tabs, stops, left } = info;
    const boxLeft = box.getBoundingClientRect().left + (parseFloat(getComputedStyle(box).paddingLeft) || 0);
    for (const t of tabs) {
      t.style.width = "0";
      const x = t.getBoundingClientRect().left - boxLeft + left; // 문단 맨 왼쪽 기준 위치(px)
      let target = stops.map((s) => s * TW).find((s) => s > x + 0.5);
      if (target === undefined) {
        const step = ctx.defaultTab * TW;
        target = (Math.floor((x + 0.5) / step) + 1) * step;
      }
      t.style.width = px(Math.max(0, target - x));
    }
  }
}

// ---------------------------------------------------------------- 표

function renderTable(tbl, ctx) {
  const doc = ctx.doc;
  const tblPr = readTblPr(kid(tbl, "tblPr"));
  const styleId = tblPr.style || ctx.styles.defTable;
  const st = resolveStyle(ctx.styles, styleId);
  const sBorders = (st.tbl && st.tbl.borders) || {};
  const borders = { ...sBorders, ...(tblPr.borders || {}) };
  const mar = { top: 0, left: 108, bottom: 0, right: 108, ...((st.tbl && st.tbl.cellMar) || {}), ...(tblPr.cellMar || {}) };
  const tableStyle = { p: st.p, r: st.r };

  let grid = kids(kid(tbl, "tblGrid"), "gridCol").slice(0, MAX_COLS).map((g) => clampInt(num(wAttr(g, "w")) || 0, 0, 60000));
  const trs = kids(tbl, "tr");
  if (!grid.length && trs[0]) grid = kids(trs[0], "tc").map((tc) => num(wAttr(kid(kid(tc, "tcPr"), "tcW"), "w")) || 1000);
  // 줄마다 칸의 시작 열 번호
  const rows = trs.map((tr) => {
    const trPr = kid(tr, "trPr");
    let col = clampInt(num(val(kid(trPr, "gridBefore"))) || 0, 0, MAX_COLS);
    const cells = kids(tr, "tc").map((tc) => {
      const tcPr = kid(tc, "tcPr");
      const span = clampInt(num(val(kid(tcPr, "gridSpan"))) || 1, 1, MAX_COLS);
      const vm = kid(tcPr, "vMerge");
      const cell = { tc, tcPr, col, span, vMerge: vm ? val(vm) || "continue" : null, rowSpan: 1 };
      col += span;
      return cell;
    });
    return { tr, trPr, cells, endCol: col };
  });
  const gridCount = Math.min(rows.reduce((m, r) => Math.max(m, r.endCol), Math.max(grid.length, 1)), MAX_COLS);
  while (grid.length < gridCount) grid.push(grid.length ? grid[grid.length - 1] : 1000);
  // 세로로 합친 칸: restart 칸의 rowSpan을 계산하고 이어지는 칸은 그리지 않는다
  rows.forEach((row, ri) => {
    for (const cell of row.cells) {
      if (cell.vMerge !== "restart") continue;
      for (let k = ri + 1; k < rows.length; k += 1) {
        const next = rows[k].cells.find((c) => c.col === cell.col);
        if (next && next.vMerge === "continue") {
          next.skip = true;
          cell.rowSpan += 1;
        } else break;
      }
    }
  });

  const totalTw = grid.reduce((s, w) => s + w, 0);
  const table = el(doc, "table", `border-collapse:collapse;table-layout:fixed;width:${px(totalTw * TW)};border:0;margin:0;background:transparent;max-width:none`);
  if (tblPr.jc === "center") table.style.margin = "0 auto";
  else if (tblPr.jc === "right" || tblPr.jc === "end") table.style.marginLeft = "auto";
  else if (tblPr.ind) table.style.marginLeft = px(tblPr.ind * TW);
  const group = el(doc, "colgroup");
  for (const w of grid) group.appendChild(el(doc, "col", `width:${px(w * TW)}`));
  table.appendChild(group);
  const body = el(doc, "tbody");
  table.appendChild(body);

  rows.forEach((row, ri) => {
    const trH = kid(row.trPr, "trHeight");
    const hRule = wAttr(trH, "hRule");
    const heightTw = num(wAttr(trH, "val"));
    const trEl = el(doc, "tr", heightTw && hRule !== "auto" ? `height:${px(heightTw * TW)}` : "");
    for (const cell of row.cells) {
      if (cell.skip) continue;
      const tcPr = cell.tcPr;
      const own = readTblBorders(kid(tcPr, "tcBorders")) || {};
      const lastRow = ri + cell.rowSpan >= rows.length;
      const lastCol = cell.col + cell.span >= gridCount;
      const edge = {
        top: own.top || (ri === 0 ? borders.top : borders.insideH),
        bottom: own.bottom || (lastRow ? borders.bottom : borders.insideH),
        left: own.left || (cell.col === 0 ? borders.left : borders.insideV),
        right: own.right || (lastCol ? borders.right : borders.insideV),
      };
      const cmar = { ...mar, ...(readCellMar(kid(tcPr, "tcMar")) || {}) };
      const parts = ["box-sizing:border-box", `padding:${px(cmar.top * TW)} ${px(cmar.right * TW)} ${px(cmar.bottom * TW)} ${px(cmar.left * TW)}`, "overflow:visible", "position:relative"];
      const va = val(kid(tcPr, "vAlign"));
      parts.push(`vertical-align:${va === "center" ? "middle" : va === "bottom" ? "bottom" : "top"}`);
      for (const side of ["top", "right", "bottom", "left"]) parts.push(`border-${side}:${borderCss(edge[side])}`);
      const fill = wAttr(kid(tcPr, "shd"), "fill") || st.tcShd;
      const bg = hexColor(fill);
      if (bg) parts.push(`background:${bg}`);
      const td = el(doc, "td", parts.join(";"));
      if (cell.span > 1) td.colSpan = cell.span;
      if (cell.rowSpan > 1) td.rowSpan = cell.rowSpan;
      for (const c of Array.from(cell.tc.childNodes)) {
        if (c.nodeType !== 1 || c.namespaceURI !== NS_W) continue;
        if (c.localName === "p") td.appendChild(renderParagraph(c, ctx, tableStyle));
        else if (c.localName === "tbl") td.appendChild(renderTable(c, ctx));
      }
      if (!td.firstChild) td.appendChild(el(doc, "div", "", "\u200b"));
      trEl.appendChild(td);
    }
    body.appendChild(trEl);
  });
  return table;
}

function renderBlocks(container, parent, ctx) {
  for (const c of Array.from(container.childNodes)) {
    if (c.nodeType !== 1 || c.namespaceURI !== NS_W) continue;
    if (c.localName === "p") parent.appendChild(renderParagraph(c, ctx, null));
    else if (c.localName === "tbl") parent.appendChild(renderTable(c, ctx));
    else if (c.localName === "sdt") renderBlocks(kid(c, "sdtContent") || c, parent, ctx);
  }
}

// ---------------------------------------------------------------- 파일 읽기

export function openDocxForPreview(bytes) {
  let files;
  try {
    files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch (e) {
    throw new Error("워드(.docx) 파일을 열 수 없습니다.");
  }
  if (!files["word/document.xml"]) throw new Error("워드 파일에 본문(word/document.xml)이 없습니다.");
  const pack = { files, document: parseXml(files["word/document.xml"], "워드 본문") };
  pack.styles = files["word/styles.xml"] ? parseXml(files["word/styles.xml"], "워드 스타일") : null;
  pack.numbering = files["word/numbering.xml"] ? parseXml(files["word/numbering.xml"], "워드 번호 정의") : null;
  pack.rels = new Map();
  if (files["word/_rels/document.xml.rels"]) {
    const rels = parseXml(files["word/_rels/document.xml.rels"], "워드 연결 정보");
    for (const r of Array.from(rels.documentElement.childNodes)) if (r.nodeType === 1) pack.rels.set(r.getAttribute("Id"), r.getAttribute("Target"));
  }
  pack.defaultTab = 720;
  if (files["word/settings.xml"]) {
    try {
      const st = parseXml(files["word/settings.xml"], "워드 설정");
      pack.defaultTab = clampInt(num(val(kid(st.documentElement, "defaultTabStop"))) || 720, 100, 20000);
    } catch (e) {
      // 설정을 못 읽으면 기본값(0.5인치)을 쓴다
    }
  }
  pack.theme = readTheme(files["word/theme/theme1.xml"]);
  return pack;
}

// 문서 본문의 글자만 모아 돌려준다(시험·점검용): 문단마다 한 줄, 표 칸은 " | "로 이어 한 줄
export function docxPreviewText(bytes) {
  const pack = openDocxForPreview(bytes);
  const lines = [];
  const textOf = (node) =>
    Array.from(node.getElementsByTagNameNS(NS_W, "*"))
      .filter((n) => n.localName === "t" || n.localName === "tab" || n.localName === "br")
      .map((n) => (n.localName === "t" ? n.textContent : n.localName === "tab" ? "\t" : "\n"))
      .join("");
  const walk = (parent) => {
    for (const c of Array.from(parent.childNodes)) {
      if (c.nodeType !== 1 || c.namespaceURI !== NS_W) continue;
      if (c.localName === "p") lines.push(textOf(c));
      else if (c.localName === "tbl") for (const tr of kids(c, "tr")) lines.push(kids(tr, "tc").map(textOf).join(" | "));
    }
  };
  walk(kid(pack.document.documentElement, "body"));
  return lines;
}

function sectionOf(body) {
  let sect = kid(body, "sectPr");
  if (!sect) {
    const withSect = Array.from(body.getElementsByTagNameNS(NS_W, "sectPr"));
    sect = withSect[withSect.length - 1] || null;
  }
  const pg = {
    w: 11906,
    h: 16838,
    top: 1440,
    right: 1440,
    bottom: 1440,
    left: 1440,
    header: 720,
    footer: 720,
    footerRef: null,
    headerRef: null,
  };
  if (!sect) return pg;
  const sz = kid(sect, "pgSz");
  if (sz) {
    pg.w = clampInt(num(wAttr(sz, "w")) || pg.w, 2000, 60000);
    pg.h = clampInt(num(wAttr(sz, "h")) || pg.h, 2000, 60000);
    if (wAttr(sz, "orient") === "landscape" && pg.w < pg.h) [pg.w, pg.h] = [pg.h, pg.w];
  }
  const mar = kid(sect, "pgMar");
  if (mar) for (const k of ["top", "right", "bottom", "left", "header", "footer"]) pg[k] = clampInt(num(wAttr(mar, k)) ?? pg[k], 0, 20000);
  const ref = (kind) => {
    const list = kids(sect, `${kind}Reference`);
    const pick = list.find((r) => wAttr(r, "type") === "default") || list[0];
    return pick ? pick.getAttributeNS(NS_R, "id") : null;
  };
  pg.footerRef = ref("footer");
  pg.headerRef = ref("header");
  return pg;
}

// 모델 → 종이 한 장 모양의 요소. 반환: { node, width, height } (width·height는 100% 크기의 px)
export function buildDocxDom(pack, doc = document) {
  const ctx = {
    doc,
    styles: buildStyles(pack.styles),
    numbering: buildNumbering(pack.numbering),
    theme: pack.theme,
    defaultTab: pack.defaultTab,
    tabs: [],
    tabParas: [],
  };
  const body = kid(pack.document.documentElement, "body");
  if (!body) throw new Error("워드 본문 구조가 예상과 다릅니다.");
  const pg = sectionOf(body);
  const paper = el(doc, "div", `box-sizing:border-box;position:relative;display:flex;flex-direction:column;width:${px(pg.w * TW)};min-height:${px(pg.h * TW)};padding:${px(pg.top * TW)} ${px(pg.right * TW)} ${px(pg.bottom * TW)} ${px(pg.left * TW)};background:#fff;color:#000;text-align:left`);
  paper.className = "pwv-paper pwv-docx";
  const partDoc = (ref) => {
    const target = ref && pack.rels.get(ref);
    if (!target) return null;
    const path = target.startsWith("/") ? target.slice(1) : `word/${target}`;
    return pack.files[path] ? parseXml(pack.files[path], "머리말/꼬리말") : null;
  };
  const head = partDoc(pg.headerRef);
  if (head) {
    const h = el(doc, "div", "flex:none");
    renderBlocks(head.documentElement, h, ctx);
    paper.appendChild(h);
  }
  const main = el(doc, "div", "flex:1 1 auto");
  renderBlocks(body, main, ctx);
  paper.appendChild(main);
  const foot = partDoc(pg.footerRef);
  if (foot) {
    // 꼬리말은 종이 아래에서 꼬리말 간격만큼 떨어진 자리에 둔다(본문 아래 여백 안쪽으로 내려 앉힌다)
    const f = el(doc, "div", `flex:none;margin-bottom:${px(-Math.max(0, pg.bottom - pg.footer) * TW)}`);
    renderBlocks(foot.documentElement, f, ctx);
    paper.appendChild(f);
  }
  // 탭 너비는 실제로 그려 본 뒤 재야 해서, 잠깐 화면 밖에 붙였다 뗀다
  if (ctx.tabs.length) {
    const stage = el(doc, "div", `position:absolute;left:-100000px;top:0;visibility:hidden;width:${px(pg.w * TW)}`);
    stage.appendChild(paper);
    doc.body.appendChild(stage);
    try {
      layoutTabs(ctx);
    } finally {
      stage.removeChild(paper);
      doc.body.removeChild(stage);
    }
  }
  return { node: paper, width: pg.w * TW, height: pg.h * TW, kind: "docx" };
}

export function renderDocxPreview(bytes, doc = document) {
  return buildDocxDom(openDocxForPreview(bytes), doc);
}
