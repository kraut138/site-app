// 한글(.hwp) 파일의 바깥 그릇인 OLE 복합 문서(Compound File, MS-CFB)를 읽고 쓰는 작은 도구.
//
// 한글 5.0 파일은 폴더(storage)와 스트림(stream)이 들어 있는 한 덩어리 파일이다(FileHeader · DocInfo · BodyText/Section0 · PrvText …).
// 서류 탭은 양식 파일을 그대로 두고 BodyText/Section0 한 줄기만 바꿔 다시 묶는다. 그러려면
//   · 읽을 때: 파일 안의 모든 폴더·스트림을 이름·시각·분류 번호(CLSID)까지 그대로 꺼내고
//   · 쓸 때: 같은 구성으로 새로 묶되, 다른 도구가 끼워 넣는 표식 스트림 같은 것은 하나도 더하지 않아야 한다.
// 그래서 외부 라이브러리를 쓰지 않고 필요한 만큼만 직접 만들었다(섹터 512바이트 형식 - 한글이 쓰는 3판만 다룬다).
//
// 읽은 결과(트리):  { name, type, clsid, state, ctime, mtime, children: [...] }            (폴더, 맨 위는 type 5 "Root Entry")
//                  { name, type: 2, clsid, state, ctime, mtime, data: Uint8Array }          (스트림)

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;
const NOSTREAM = 0xffffffff;
const SECTOR = 512; // 3판은 항상 512
const MINI_SECTOR = 64;
const MINI_CUTOFF = 4096; // 이보다 작은 스트림은 '작은 조각 묶음(mini stream)' 안에 둔다
const DIR_ENTRY = 128;

export const OBJ_STORAGE = 1;
export const OBJ_STREAM = 2;
export const OBJ_ROOT = 5;

function u16(b, o) {
  return b[o] | (b[o + 1] << 8);
}
function u32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function put16(b, o, v) {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
}
function put32(b, o, v) {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
  b[o + 2] = (v >>> 16) & 0xff;
  b[o + 3] = (v >>> 24) & 0xff;
}

// ---------------------------------------------------------------- 읽기

export function readCompound(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < SECTOR * 2) throw new Error("한글 파일이 아니거나 파일이 손상되었습니다(크기가 너무 작음).");
  for (let i = 0; i < 8; i += 1) if (b[i] !== SIGNATURE[i]) throw new Error("한글 파일이 아니거나 파일이 손상되었습니다(OLE 서명 없음).");
  const major = u16(b, 26);
  if (major !== 3 || u16(b, 30) !== 9 || u16(b, 32) !== 6) throw new Error("지원하지 않는 한글 파일 형식입니다(섹터 크기).");
  const numFat = u32(b, 44);
  const dirStart = u32(b, 48);
  const cutoff = u32(b, 56) || MINI_CUTOFF;
  const miniFatStart = u32(b, 60);
  const difatStart = u32(b, 68);
  const numDifat = u32(b, 72);
  const sectorCount = Math.floor(b.length / SECTOR) - 1;
  const sectorAt = (id) => {
    const off = (id + 1) * SECTOR;
    if (id < 0 || off + SECTOR > b.length) throw new Error("한글 파일이 손상되었습니다(섹터 범위).");
    return b.subarray(off, off + SECTOR);
  };

  // FAT(섹터 연결표) 모으기: 머리말의 109칸 + 필요하면 DIFAT 섹터들
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < numFat; i += 1) {
    const id = u32(b, 76 + i * 4);
    if (id !== FREESECT) fatSectors.push(id);
  }
  let difat = difatStart;
  for (let n = 0; n < numDifat && difat !== ENDOFCHAIN && difat !== FREESECT; n += 1) {
    const s = sectorAt(difat);
    for (let i = 0; i < SECTOR / 4 - 1 && fatSectors.length < numFat; i += 1) {
      const id = u32(s, i * 4);
      if (id !== FREESECT) fatSectors.push(id);
    }
    difat = u32(s, SECTOR - 4);
  }
  const fat = [];
  for (const id of fatSectors) {
    const s = sectorAt(id);
    for (let i = 0; i < SECTOR / 4; i += 1) fat.push(u32(s, i * 4));
  }

  const chain = (start, table, limit) => {
    const ids = [];
    let id = start;
    while (id !== ENDOFCHAIN && id !== FREESECT) {
      if (ids.length > limit || id >= table.length) throw new Error("한글 파일이 손상되었습니다(섹터 연결).");
      ids.push(id);
      id = table[id];
    }
    return ids;
  };
  const readSectors = (start) => {
    const ids = chain(start, fat, sectorCount);
    const out = new Uint8Array(ids.length * SECTOR);
    ids.forEach((id, i) => out.set(sectorAt(id), i * SECTOR));
    return out;
  };

  // 폴더 항목표
  const dir = readSectors(dirStart);
  const entries = [];
  for (let o = 0; o + DIR_ENTRY <= dir.length; o += DIR_ENTRY) {
    const type = dir[o + 66];
    const nameBytes = Math.max(0, Math.min(64, u16(dir, o + 64)) - 2);
    let name = "";
    for (let i = 0; i < nameBytes; i += 2) name += String.fromCharCode(u16(dir, o + i));
    entries.push({
      name,
      type,
      left: u32(dir, o + 68),
      right: u32(dir, o + 72),
      child: u32(dir, o + 76),
      clsid: dir.slice(o + 80, o + 96),
      state: u32(dir, o + 96),
      ctime: dir.slice(o + 100, o + 108),
      mtime: dir.slice(o + 108, o + 116),
      start: u32(dir, o + 116),
      size: u32(dir, o + 120),
    });
  }
  const root = entries[0];
  if (!root || root.type !== OBJ_ROOT) throw new Error("한글 파일이 손상되었습니다(최상위 항목 없음).");

  // 작은 스트림 묶음(mini stream)과 그 연결표
  const miniFatBytes = miniFatStart === ENDOFCHAIN ? new Uint8Array(0) : readSectors(miniFatStart);
  const miniFat = [];
  for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) miniFat.push(u32(miniFatBytes, i));
  const miniStream = root.start === ENDOFCHAIN || !root.size ? new Uint8Array(0) : readSectors(root.start).subarray(0, root.size);

  const readData = (e) => {
    if (!e.size) return new Uint8Array(0);
    if (e.size < cutoff) {
      const ids = chain(e.start, miniFat, Math.ceil(miniStream.length / MINI_SECTOR));
      const out = new Uint8Array(ids.length * MINI_SECTOR);
      ids.forEach((id, i) => out.set(miniStream.subarray(id * MINI_SECTOR, (id + 1) * MINI_SECTOR), i * MINI_SECTOR));
      return out.subarray(0, e.size).slice();
    }
    return readSectors(e.start).subarray(0, e.size).slice();
  };

  // 항목 사이의 연결(이진 트리)을 따라 폴더 구조를 만든다. 같은 항목을 두 번 만나면 손상된 것으로 본다.
  const seen = new Set([0]);
  const collect = (firstId) => {
    const ids = [];
    const stack = [];
    let id = firstId;
    while (id !== NOSTREAM || stack.length) {
      while (id !== NOSTREAM) {
        if (id >= entries.length || seen.has(id)) throw new Error("한글 파일이 손상되었습니다(폴더 항목 연결).");
        seen.add(id);
        stack.push(id);
        id = entries[id].left;
      }
      id = stack.pop();
      ids.push(id);
      id = entries[id].right;
    }
    return ids;
  };
  const build = (e) => {
    const node = { name: e.name, type: e.type, clsid: e.clsid, state: e.state, ctime: e.ctime, mtime: e.mtime };
    if (e.type === OBJ_STREAM) node.data = readData(e);
    else node.children = collect(e.child).map((id) => build(entries[id]));
    return node;
  };
  return build(root);
}

// "BodyText/Section0" 같은 경로로 스트림 노드를 찾는다. 없으면 null.
export function findNode(root, path) {
  let node = root;
  for (const part of String(path).split("/").filter(Boolean)) {
    node = node && node.children ? node.children.find((c) => c.name === part) : null;
    if (!node) return null;
  }
  return node;
}

export function listStreams(root, prefix = "") {
  const out = [];
  for (const c of root.children || []) {
    const p = prefix ? `${prefix}/${c.name}` : c.name;
    if (c.type === OBJ_STREAM) out.push(p);
    else out.push(...listStreams(c, p));
  }
  return out;
}

// ---------------------------------------------------------------- 쓰기

// 같은 폴더 안 항목의 순서 규칙: 이름이 짧은 것이 앞, 길이가 같으면 대문자로 바꿔 글자 코드로 비교
function compareNames(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  const x = a.toUpperCase();
  const y = b.toUpperCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

// 정렬된 항목 목록을 가운데를 뿌리로 나누어 균형 잡힌 이진 트리로 만든다. 가장 아래 칸이 덜 찬 경우 그 칸만 빨강, 나머지는 검정이면 빨강-검정 트리 조건을 만족한다.
function buildTree(items, setLinks) {
  if (!items.length) return NOSTREAM;
  const depthOf = (n) => Math.floor(Math.log2(n)) + 1; // n개를 균형 있게 나눴을 때 가장 깊은 층 수
  const maxDepth = depthOf(items.length);
  const full = items.length === 2 ** maxDepth - 1;
  const rec = (lo, hi, depth) => {
    if (lo > hi) return NOSTREAM;
    const mid = (lo + hi) >> 1;
    const left = rec(lo, mid - 1, depth + 1);
    const right = rec(mid + 1, hi, depth + 1);
    const red = !full && depth === maxDepth;
    setLinks(items[mid], left, right, red ? 0 : 1);
    return items[mid].id;
  };
  return rec(0, items.length - 1, 1);
}

export function writeCompound(root) {
  // 1) 모든 항목에 번호를 매기고(맨 위 0번), 폴더마다 형제 트리를 만든다
  const dirs = [];
  const assign = (node) => {
    node.id = dirs.length;
    dirs.push(node);
    for (const c of node.children || []) assign(c);
  };
  assign(root);
  const links = new Map();
  const treeOf = (node) => {
    const kids = (node.children || []).slice().sort((a, b) => compareNames(a.name, b.name));
    const top = buildTree(kids, (n, left, right, color) => links.set(n.id, { left, right, color }));
    links.set(node.id, { ...(links.get(node.id) || { left: NOSTREAM, right: NOSTREAM, color: 1 }), child: top });
    for (const c of node.children || []) if (c.children) treeOf(c);
  };
  treeOf(root);
  links.set(0, { left: NOSTREAM, right: NOSTREAM, color: 1, child: links.get(0).child });

  // 2) 스트림을 작은 것(mini)과 큰 것으로 나눠 자리를 계산한다
  const streams = dirs.filter((n) => n.type === OBJ_STREAM);
  const mini = streams.filter((n) => n.data.length > 0 && n.data.length < MINI_CUTOFF);
  const big = streams.filter((n) => n.data.length >= MINI_CUTOFF);
  const miniCount = mini.reduce((s, n) => s + Math.ceil(n.data.length / MINI_SECTOR), 0);
  const miniFatSectors = Math.ceil(miniCount / (SECTOR / 4));
  const miniStreamSectors = Math.ceil((miniCount * MINI_SECTOR) / SECTOR);
  const dirSectors = Math.ceil(dirs.length / (SECTOR / DIR_ENTRY));
  const bigSectors = big.reduce((s, n) => s + Math.ceil(n.data.length / SECTOR), 0);
  const base = dirSectors + miniFatSectors + miniStreamSectors + bigSectors;
  let fatSectors = 1;
  while (fatSectors * (SECTOR / 4) < base + fatSectors) fatSectors += 1;
  if (fatSectors > 109) throw new Error("한글 파일이 너무 커서 처리할 수 없습니다.");

  // 섹터 배치 순서: FAT · 폴더 항목표 · mini FAT · mini 스트림 · 큰 스트림들
  let next = 0;
  const takeRun = (n) => {
    const s = next;
    next += n;
    return s;
  };
  const fatStart = takeRun(fatSectors);
  const dirStart = takeRun(dirSectors);
  const miniFatStart = miniFatSectors ? takeRun(miniFatSectors) : ENDOFCHAIN;
  const miniStreamStart = miniStreamSectors ? takeRun(miniStreamSectors) : ENDOFCHAIN;
  const total = base + fatSectors;
  const fat = new Array(fatSectors * (SECTOR / 4)).fill(FREESECT);
  for (let i = 0; i < fatSectors; i += 1) fat[fatStart + i] = FATSECT;
  const chainRun = (start, n) => {
    for (let i = 0; i < n; i += 1) fat[start + i] = i === n - 1 ? ENDOFCHAIN : start + i + 1;
  };
  chainRun(dirStart, dirSectors);
  if (miniFatSectors) chainRun(miniFatStart, miniFatSectors);
  if (miniStreamSectors) chainRun(miniStreamStart, miniStreamSectors);

  const image = new Uint8Array((total + 1) * SECTOR);
  const sector = (id) => image.subarray((id + 1) * SECTOR, (id + 2) * SECTOR);

  // mini 스트림과 그 연결표
  const miniFat = new Array(miniFatSectors * (SECTOR / 4)).fill(FREESECT);
  const miniData = new Uint8Array(miniStreamSectors * SECTOR);
  let ms = 0;
  for (const n of mini) {
    const cnt = Math.ceil(n.data.length / MINI_SECTOR);
    n.start = ms;
    for (let i = 0; i < cnt; i += 1) miniFat[ms + i] = i === cnt - 1 ? ENDOFCHAIN : ms + i + 1;
    miniData.set(n.data, ms * MINI_SECTOR);
    ms += cnt;
  }
  // 큰 스트림
  for (const n of big) {
    const cnt = Math.ceil(n.data.length / SECTOR);
    n.start = takeRun(cnt);
    chainRun(n.start, cnt);
    image.set(n.data, (n.start + 1) * SECTOR);
  }
  for (const n of streams) if (!n.data.length) n.start = ENDOFCHAIN;
  for (const n of dirs) if (n.type !== OBJ_STREAM && n !== root) n.start = 0;
  root.start = miniStreamStart;
  root.sizeOverride = miniCount * MINI_SECTOR;

  // 폴더 항목표
  const dirBytes = new Uint8Array(dirSectors * SECTOR);
  dirBytes.fill(0);
  for (let i = 0; i < dirSectors * (SECTOR / DIR_ENTRY); i += 1) {
    const o = i * DIR_ENTRY;
    const n = dirs[i];
    if (!n) {
      put32(dirBytes, o + 68, NOSTREAM);
      put32(dirBytes, o + 72, NOSTREAM);
      put32(dirBytes, o + 76, NOSTREAM);
      continue;
    }
    const name = n.name;
    if (name.length > 31) throw new Error("항목 이름이 너무 깁니다: " + name);
    for (let k = 0; k < name.length; k += 1) put16(dirBytes, o + k * 2, name.charCodeAt(k));
    put16(dirBytes, o + 64, (name.length + 1) * 2);
    dirBytes[o + 66] = n.type;
    const link = links.get(n.id) || { left: NOSTREAM, right: NOSTREAM, color: 1, child: NOSTREAM };
    dirBytes[o + 67] = link.color;
    put32(dirBytes, o + 68, link.left);
    put32(dirBytes, o + 72, link.right);
    put32(dirBytes, o + 76, link.child === undefined ? NOSTREAM : link.child);
    if (n.clsid) dirBytes.set(n.clsid.subarray(0, 16), o + 80);
    put32(dirBytes, o + 96, n.state || 0);
    if (n.ctime) dirBytes.set(n.ctime.subarray(0, 8), o + 100);
    if (n.mtime) dirBytes.set(n.mtime.subarray(0, 8), o + 108);
    put32(dirBytes, o + 116, n.start === undefined ? 0 : n.start);
    put32(dirBytes, o + 120, n.type === OBJ_STREAM ? n.data.length : n === root ? n.sizeOverride : 0);
  }
  image.set(dirBytes, (dirStart + 1) * SECTOR);
  if (miniFatSectors) {
    const mf = new Uint8Array(miniFatSectors * SECTOR);
    miniFat.forEach((v, i) => put32(mf, i * 4, v));
    image.set(mf, (miniFatStart + 1) * SECTOR);
  }
  if (miniStreamSectors) image.set(miniData, (miniStreamStart + 1) * SECTOR);
  fat.forEach((v, i) => put32(sector(fatStart + Math.floor(i / (SECTOR / 4))), (i % (SECTOR / 4)) * 4, v));

  // 머리말(512바이트)
  SIGNATURE.forEach((v, i) => {
    image[i] = v;
  });
  put16(image, 24, 0x003e);
  put16(image, 26, 3);
  put16(image, 28, 0xfffe);
  put16(image, 30, 9);
  put16(image, 32, 6);
  put32(image, 44, fatSectors);
  put32(image, 48, dirStart);
  put32(image, 56, MINI_CUTOFF);
  put32(image, 60, miniFatStart);
  put32(image, 64, miniFatSectors);
  put32(image, 68, ENDOFCHAIN);
  put32(image, 72, 0);
  for (let i = 0; i < 109; i += 1) put32(image, 76 + i * 4, i < fatSectors ? fatStart + i : FREESECT);
  return image;
}
