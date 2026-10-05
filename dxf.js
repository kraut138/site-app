// 매우 가벼운 자체 DXF(ASCII) 파서입니다. 실제 CAD 도면은 매우 복잡할 수 있어 모든 요소를
// 완벽히 지원하지는 못하지만, 평면도를 "확인하고 위치를 짚는" 이 앱의 목적에는
// 선(LINE)·폴리라인(LWPOLYLINE/POLYLINE)·원(CIRCLE)·호(ARC)·텍스트(TEXT) 정도면 충분합니다.
// HATCH(해칭), DIMENSION(치수선), INSERT(블록), SPLINE, 3D 솔리드 등은 건너뜁니다.

const MAX_SHAPES = 3000;

function tokenize(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: lines[i + 1] !== undefined ? lines[i + 1] : "" });
  }
  return pairs;
}

function toNum(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

// entityPairs[startIdx..] 에서 다음 code=0 전까지의 필드를 모은다.
// asPoints=true면 반복되는 10/20 그룹을 좌표 배열로도 모아준다(LWPOLYLINE 정점용).
function readFields(pairs, startIdx, asPoints) {
  const map = new Map();
  const points = [];
  let curX = null;
  let j = startIdx;
  while (j < pairs.length && pairs[j].code !== 0) {
    const { code, value } = pairs[j];
    if (asPoints && code === 10) {
      curX = toNum(value);
    } else if (asPoints && code === 20 && curX !== null) {
      points.push([curX, toNum(value)]);
      curX = null;
    } else if (!map.has(code)) {
      map.set(code, value);
    }
    j++;
  }
  return { next: j, get: (code) => map.get(code), getPoints: () => points };
}

export function parseDxf(text) {
  const pairs = tokenize(text);

  let start = -1;
  let end = pairs.length;
  for (let i = 0; i < pairs.length; i++) {
    if (start === -1 && pairs[i].code === 2 && (pairs[i].value || "").trim().toUpperCase() === "ENTITIES") {
      start = i + 1;
    } else if (start !== -1 && pairs[i].code === 0 && (pairs[i].value || "").trim().toUpperCase() === "ENDSEC") {
      end = i;
      break;
    }
  }
  if (start === -1) {
    throw new Error("DXF 파일에서 도형(ENTITIES) 구간을 찾을 수 없습니다.");
  }

  const entityPairs = pairs.slice(start, end);
  const shapes = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function extend(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  let i = 0;
  let currentPolyline = null; // 구형 POLYLINE + VERTEX* + SEQEND 처리용

  while (i < entityPairs.length && shapes.length < MAX_SHAPES) {
    const p = entityPairs[i];
    if (p.code !== 0) {
      i++;
      continue;
    }
    const type = (p.value || "").trim().toUpperCase();
    i++;

    if (type === "LINE") {
      const f = readFields(entityPairs, i, false);
      i = f.next;
      const x1 = toNum(f.get(10));
      const y1 = toNum(f.get(20));
      const x2 = toNum(f.get(11));
      const y2 = toNum(f.get(21));
      shapes.push({ kind: "line", x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2) });
      extend(x1, y1);
      extend(x2, y2);
    } else if (type === "CIRCLE") {
      const f = readFields(entityPairs, i, false);
      i = f.next;
      const cx = toNum(f.get(10));
      const cy = toNum(f.get(20));
      const r = toNum(f.get(40));
      shapes.push({ kind: "circle", cx: round(cx), cy: round(cy), r: round(r) });
      extend(cx - r, cy - r);
      extend(cx + r, cy + r);
    } else if (type === "ARC") {
      const f = readFields(entityPairs, i, false);
      i = f.next;
      const cx = toNum(f.get(10));
      const cy = toNum(f.get(20));
      const r = toNum(f.get(40));
      const a0 = toNum(f.get(50));
      const a1 = toNum(f.get(51));
      const s0 = (a0 * Math.PI) / 180;
      const s1 = (a1 * Math.PI) / 180;
      const sx = cx + r * Math.cos(s0);
      const sy = cy + r * Math.sin(s0);
      const ex = cx + r * Math.cos(s1);
      const ey = cy + r * Math.sin(s1);
      let sweep = a1 - a0;
      if (sweep < 0) sweep += 360;
      const largeArc = sweep > 180 ? 1 : 0;
      shapes.push({ kind: "arc", sx: round(sx), sy: round(sy), ex: round(ex), ey: round(ey), r: round(r), largeArc });
      extend(cx - r, cy - r);
      extend(cx + r, cy + r);
    } else if (type === "TEXT" || type === "MTEXT") {
      const f = readFields(entityPairs, i, false);
      i = f.next;
      const x = toNum(f.get(10));
      const y = toNum(f.get(20));
      const h = toNum(f.get(40), 2.5);
      const text = (f.get(1) || "").replace(/\\P/g, " ").trim();
      if (text) {
        shapes.push({ kind: "text", x: round(x), y: round(y), h: round(h), text: text.slice(0, 60) });
        extend(x, y);
      }
    } else if (type === "LWPOLYLINE") {
      const f = readFields(entityPairs, i, true);
      i = f.next;
      const closed = (parseInt(f.get(70) || "0", 10) & 1) === 1;
      const pts = f.getPoints();
      if (pts.length >= 2) {
        if (closed) pts.push(pts[0]);
        const rounded = pts.map(([x, y]) => [round(x), round(y)]);
        shapes.push({ kind: "polyline", points: rounded });
        pts.forEach(([x, y]) => extend(x, y));
      }
    } else if (type === "POLYLINE") {
      const f = readFields(entityPairs, i, false);
      i = f.next;
      currentPolyline = { points: [], closed: (parseInt(f.get(70) || "0", 10) & 1) === 1 };
    } else if (type === "VERTEX" && currentPolyline) {
      const f = readFields(entityPairs, i, false);
      i = f.next;
      currentPolyline.points.push([toNum(f.get(10)), toNum(f.get(20))]);
    } else if (type === "SEQEND") {
      if (currentPolyline && currentPolyline.points.length >= 2) {
        const pts = currentPolyline.points.slice();
        if (currentPolyline.closed) pts.push(pts[0]);
        const rounded = pts.map(([x, y]) => [round(x), round(y)]);
        shapes.push({ kind: "polyline", points: rounded });
        pts.forEach(([x, y]) => extend(x, y));
      }
      currentPolyline = null;
    } else {
      // 지원하지 않는 엔티티: 다음 code=0까지 건너뛴다
      while (i < entityPairs.length && entityPairs[i].code !== 0) i++;
    }
  }

  if (shapes.length === 0 || !Number.isFinite(minX)) {
    throw new Error("DXF 파일에서 지원되는 도형(선·폴리라인·원·호·텍스트)을 찾지 못했습니다.");
  }

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const pad = Math.max(width, height) * 0.04;

  return {
    shapes,
    truncated: shapes.length >= MAX_SHAPES,
    bounds: {
      minX: round(minX - pad),
      minY: round(minY - pad),
      width: round(width + pad * 2),
      height: round(height + pad * 2),
    },
  };
}
