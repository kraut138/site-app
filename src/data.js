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

export const INSPECTION_STATUSES = ["대기", "승인", "반려"];
export const NCR_STATUSES = ["발생", "조치중", "재검측요청", "완료"];

export const ROLES = {
  SUB: "하도급사",
  SUPER: "감리단",
};

// 하도급사 역할에게는 숨기는 탭(대시보드/동 관리/배치도/호실 정보) - 감리단/소장은 전체 열람 가능
export const RESTRICTED_VIEWS_FOR_SUB = ["dashboard", "buildings", "sitelayout", "unitinfo"];

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
