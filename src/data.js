// 공종 카테고리 메타 정보 (체크리스트 항목 자체는 백엔드에서 동적으로 관리됨)
export const CATEGORIES = [
  {
    id: "frame",
    name: "골조공사",
    shortName: "골조",
    color: "#5B7CA6",
    description: "철근 배근, 거푸집, 콘크리트 타설 및 양생",
  },
  {
    id: "finish",
    name: "마감공사",
    shortName: "마감",
    color: "#B8895A",
    description: "미장, 방수, 타일, 창호 마감 상태",
  },
  {
    id: "mep",
    name: "설비/전기",
    shortName: "설비전기",
    color: "#5C8C6B",
    description: "배관 누수 테스트, 전기 간선 및 절연저항",
  },
  {
    id: "safety",
    name: "안전/환경",
    shortName: "안전환경",
    color: "#B2555A",
    description: "추락방지, 가설구조물, 보호구 착용",
  },
];

export function getCategory(categoryId) {
  return CATEGORIES.find((c) => c.id === categoryId) || null;
}

// checklistItems(bootstrap에서 받아온 동적 목록)에서 특정 공종의 항목만 추출
export function itemsForCategory(checklistItems, categoryId) {
  return (checklistItems || []).filter((i) => i.categoryId === categoryId);
}

// 항목 id로 텍스트 조회. 감리단이 삭제한 항목이면 안내 문구로 대체(과거 기록이 깨지지 않도록)
export function findItemText(checklistItems, itemId) {
  const item = (checklistItems || []).find((i) => i.id === itemId);
  return item ? item.text : "(삭제된 항목)";
}

// 층당 세대수로 "01","02"... 형태의 호수 목록 생성
export function unitOptions(unitsPerFloor) {
  const n = Math.max(1, Number(unitsPerFloor) || 1);
  return Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, "0"));
}

// 특정 동/층/호/공종의 최신 검측 상태와 진행률(%) 계산
export function categoryProgress(inspections, checklistItems, buildingId, floor, unit, categoryId) {
  const relevant = inspections.filter(
    (i) => i.buildingId === buildingId && String(i.floor) === String(floor) && i.unit === unit && i.categoryId === categoryId
  );
  const total = itemsForCategory(checklistItems, categoryId).length;
  if (relevant.length === 0) return { status: "미시작", percent: 0 };
  const latest = [...relevant].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const percent = total ? Math.round((latest.checkedItemIds.length / total) * 100) : 0;
  return { status: latest.status, percent: latest.status === "반려" ? 0 : percent };
}

// 카테고리별 "기본값" 목록 - 체크리스트 탭의 "기본값으로 초기화" 버튼에서 사용
export const DEFAULT_ITEMS_BY_CATEGORY = {
  frame: [
    "철근 배근 간격 및 규격 적정성",
    "철근 이음 위치 및 정착 길이",
    "거푸집 치수 및 수직·수평도",
    "거푸집 조립 상태 및 지지대(동바리) 고정",
    "콘크리트 타설 전 이물질 제거 상태",
    "콘크리트 타설 및 다짐 상태",
    "콘크리트 양생 관리(양생포·살수)",
  ],
  finish: [
    "PL창호",
    "단열재",
    "견출",
    "조적",
    "경량틀",
    "목창호",
    "석고판",
    "차음재",
    "기포 콘크리트 타설",
    "바닥 난방 코일",
    "방통 타설",
    "천정",
    "가구",
    "도배",
    "바닥마감",
  ],
  mep: [
    "급수·배수 배관 누수 압력 테스트",
    "배관 구배 및 고정 상태",
    "전기 간선 포설 경로 및 결속 상태",
    "절연 저항 측정값 기준 충족 여부",
    "분전반 결선 및 접지 상태",
  ],
  safety: [
    "추락 방지시설(안전난간·개구부 덮개) 설치",
    "가설 구조물(비계·동바리) 안전성",
    "개인 보호구(안전모·안전대) 착용 여부",
    "현장 정리정돈 및 자재 적치 상태",
    "화기 작업 관리 및 소화기 비치 여부",
  ],
};

export const INSPECTION_STATUSES = ["대기", "승인", "반려"];
export const NCR_STATUSES = ["발생", "조치중", "재검측요청", "완료"];

export const ROLES = {
  SUB: "하도급사",
  SUPER: "감리단",
};

// 뷰(탭)별 접근 가능한 역할. 값을 생략하면 두 역할 모두 접근 가능.
// (대시보드는 "현장관리" 탭 내부의 서브탭이며, OperationsHub.jsx에서 role로 별도 제한됨)
export const VIEW_ROLES = {
  workers: [ROLES.SUB],
  buildings: [ROLES.SUPER],
  sitelayout: [ROLES.SUPER],
  unitinfo: [ROLES.SUPER],
  safety: [ROLES.SUPER],
};

export function isViewAllowed(viewId, role) {
  const allowed = VIEW_ROLES[viewId];
  return !allowed || allowed.includes(role);
}

export const SHAPE_OPTIONS = [
  { id: "slab", label: "판상형" },
  { id: "tower", label: "타워형" },
  { id: "l", label: "ㄱ형" },
  { id: "y", label: "Y형" },
];

export function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
