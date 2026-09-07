// 2D 평면도(DXF 파싱 결과)를 3D 매스로 만드는 순수 계산 로직.
// three.js Mesh를 직접 만들지 않고 "벽 하나를 어디에 어떤 크기/회전으로 세울지"만
// 계산해서 반환한다 - three.js 객체 생성과 분리해두면 브라우저 없이도 로직을 검증할 수 있다.
//
// 좌표계: DXF의 2D (x, y) 평면도를 three.js의 수평면(X, Z)에 놓는다. DXF의 y는 그대로
// three.js의 z로 옮긴다(부호는 그대로 유지 - 뒤집으면 실제 배치도 위치와 어긋나므로).
// three.js의 y(수직)만 층 높이로 새로 쓴다.

const WALL_THICKNESS = 0.12; // m

// 도면 좌표가 mm 단위로 보이면(값이 비정상적으로 크면) m로 정규화한다.
// 실제 CAD 도면은 mm로 그려지는 경우가 많아, 그대로 쓰면 건물이 터무니없이 커진다.
export function normalizeScale(bounds) {
  const span = Math.max(bounds.width, bounds.height, 1);
  if (span > 60) return 0.001; // mm로 추정 -> m로 변환
  if (span < 0.3) return 1000; // 반대로 너무 작으면(비정상 스케일) 확대
  return 1;
}

// shapes(line/polyline만 대상, circle/arc/text는 벽으로 압출하지 않고 건너뜀) -> 벽 세그먼트 배열.
// 각 세그먼트: { cx, cz, length, angle, } (angle: three.js Y축 기준 라디안)
// 로컬 좌표(도면 자체의 0,0 기준) 그대로 반환하며, 실제 배치는 호출부에서 offset을 더해 처리한다.
export function shapesToWallSegments(shapes, scale = 1) {
  const segments = [];

  function addSegment(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dz = y2 - y1;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return; // 길이가 사실상 0인 세그먼트는 무시
    segments.push({
      cx: ((x1 + x2) / 2) * scale,
      cz: ((y1 + y2) / 2) * scale,
      length: length * scale,
      angle: Math.atan2(dz, dx),
    });
  }

  for (const s of shapes) {
    if (s.kind === "line") {
      addSegment(s.x1, s.y1, s.x2, s.y2);
    } else if (s.kind === "polyline" && Array.isArray(s.points)) {
      for (let i = 0; i < s.points.length - 1; i++) {
        const [x1, y1] = s.points[i];
        const [x2, y2] = s.points[i + 1];
        addSegment(x1, y1, x2, y2);
      }
    }
    // circle/arc/text는 벽 압출 대상에서 제외 (범위를 벽 중심으로 한정)
  }
  return segments;
}

/**
 * 동 하나의 전체 3D 매스를 구성하는 데 필요한 모든 정보를 계산한다.
 * - building: {id, name, floors, unitsPerFloor}
 * - unitFloorPlans: 전체 평면도 목록(다른 동 것도 섞여 있어도 됨, 내부에서 필터링)
 * - floorHeight: 층고(m), 기본 3.3
 * 반환: { units: [{unit, x0(로우 내 좌측 시작 x), width, depth, floorPlan}], totalWidth, totalDepth, wallSegmentsByUnit: Map }
 *
 * 호실 간 좌우 배치는 실제 설계도가 없으므로, 등록된 평면도의 가로폭(bounds.width)을 기준으로
 * 호수 순서(01,02,03...)대로 왼쪽부터 나란히 붙여 배치한다 - 평면도가 없는 호실은 기본 폭(8m)을 쓴다.
 */
export function computeBuildingLayout(building, unitFloorPlans, unitOptionsFn, findPlanFn, floorHeight = 3.3) {
  const unitsList = unitOptionsFn(building.unitsPerFloor);
  const DEFAULT_W = 8;
  const DEFAULT_D = 10;

  let cursorX = 0;
  const units = [];
  for (const u of unitsList) {
    const plan = findPlanFn(unitFloorPlans, building.id, u);
    let width = DEFAULT_W;
    let depth = DEFAULT_D;
    let scale = 1;
    let segments = [];
    if (plan && plan.bounds && plan.shapes) {
      scale = normalizeScale(plan.bounds);
      width = Math.max(2, plan.bounds.width * scale);
      depth = Math.max(2, plan.bounds.height * scale);
      // 평면도 로컬 좌표계는 도면 자신의 (minX,minY)가 기준일 수 있으므로, 배치 시에는
      // 항상 "그 평면도의 좌하단이 유닛 슬롯의 좌하단에 오도록" bounds.minX/minY를 빼서 정규화한다.
      const shifted = plan.shapes.map((s) => shiftShape(s, -plan.bounds.minX, -plan.bounds.minY));
      segments = shapesToWallSegments(shifted, scale);
    }
    units.push({ unit: u, x0: cursorX, width, depth, floorPlan: plan, wallSegments: segments });
    cursorX += width + 0.3; // 세대 간 약간의 간격(외벽 두께 감안)
  }
  const totalWidth = cursorX - 0.3;
  const totalDepth = Math.max(...units.map((u) => u.depth), DEFAULT_D);
  return { units, totalWidth, totalDepth };
}

function shiftShape(s, dx, dy) {
  if (s.kind === "line") return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  if (s.kind === "polyline") return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy]) };
  return s;
}
