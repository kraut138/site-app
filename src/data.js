// 공종별 표준 체크리스트 템플릿
export const CATEGORIES = [
  {
    id: "frame",
    name: "골조공사",
    shortName: "골조",
    color: "#5B7CA6",
    description: "철근 배근, 거푸집, 콘크리트 타설 및 양생",
    items: [
      { id: "frame-1", text: "철근 배근 간격 및 규격 적정성" },
      { id: "frame-2", text: "철근 이음 위치 및 정착 길이" },
      { id: "frame-3", text: "거푸집 치수 및 수직·수평도" },
      { id: "frame-4", text: "거푸집 조립 상태 및 지지대(동바리) 고정" },
      { id: "frame-5", text: "콘크리트 타설 전 이물질 제거 상태" },
      { id: "frame-6", text: "콘크리트 타설 및 다짐 상태" },
      { id: "frame-7", text: "콘크리트 양생 관리(양생포·살수)" },
    ],
  },
  {
    id: "finish",
    name: "마감공사",
    shortName: "마감",
    color: "#B8895A",
    description: "미장, 방수, 타일, 창호 마감 상태",
    items: [
      { id: "finish-1", text: "미장 바탕면 평활도 및 균열 여부" },
      { id: "finish-2", text: "방수 바탕면 처리 및 방수층 두께" },
      { id: "finish-3", text: "타일 압착 시공 및 공극(뜬 부분) 여부" },
      { id: "finish-4", text: "타일 줄눈 간격 균일성 및 마감" },
      { id: "finish-5", text: "창호 수직·수평 및 고정 상태" },
      { id: "finish-6", text: "창호 주변 실링 처리 및 누수 여부" },
    ],
  },
  {
    id: "mep",
    name: "설비/전기",
    shortName: "설비전기",
    color: "#5C8C6B",
    description: "배관 누수 테스트, 전기 간선 및 절연저항",
    items: [
      { id: "mep-1", text: "급수·배수 배관 누수 압력 테스트" },
      { id: "mep-2", text: "배관 구배 및 고정 상태" },
      { id: "mep-3", text: "전기 간선 포설 경로 및 결속 상태" },
      { id: "mep-4", text: "절연 저항 측정값 기준 충족 여부" },
      { id: "mep-5", text: "분전반 결선 및 접지 상태" },
    ],
  },
  {
    id: "safety",
    name: "안전/환경",
    shortName: "안전환경",
    color: "#B2555A",
    description: "추락방지, 가설구조물, 보호구 착용",
    items: [
      { id: "safety-1", text: "추락 방지시설(안전난간·개구부 덮개) 설치" },
      { id: "safety-2", text: "가설 구조물(비계·동바리) 안전성" },
      { id: "safety-3", text: "개인 보호구(안전모·안전대) 착용 여부" },
      { id: "safety-4", text: "현장 정리정돈 및 자재 적치 상태" },
      { id: "safety-5", text: "화기 작업 관리 및 소화기 비치 여부" },
    ],
  },
];

export function getCategory(categoryId) {
  return CATEGORIES.find((c) => c.id === categoryId) || null;
}

export function getItem(categoryId, itemId) {
  const cat = getCategory(categoryId);
  if (!cat) return null;
  return cat.items.find((i) => i.id === itemId) || null;
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
