// 현장통 화면의 탭 목록. 관리자 포털과 하도급 모바일 모드가 각각 다른 탭을 가진다.
// id는 App.jsx의 view 값과 같고(data.js의 VIEW_ROLES가 역할별로 열 수 있는 화면을 정한다).
import {
  LayoutDashboard,
  QrCode,
  Building2,
  DoorOpen,
  Grid3x3,
  BookOpen,
  ClipboardCheck,
  Mic,
  Headphones,
  FileText,
} from "lucide-react";

// 관리자(시공사 관리자 포털) 탭 - 앞의 6개는 현장통 시안의 탭 순서 그대로이고, 뒤의 2개(서류 작성, 검측·NCR·표준 공종)는 앱에만 있던 기능이다.
// 관리자 화면은 한국어로만 보여 주므로 이름은 그대로 적는다(하도급사가 보는 화면만 번역 사전을 쓴다).
export const ADMIN_TABS = [
  { id: "dashboard", label: "공사현황 대시보드", Icon: LayoutDashboard },
  { id: "qrgen", label: "1. 공종별 QR 생성소", Icon: QrCode },
  { id: "buildings", label: "2. 동.호수 생성", Icon: Building2 },
  { id: "unitinfo", label: "3. 각 호실 정보 & 평면도", Icon: DoorOpen },
  { id: "sitelayout", label: "4. 건물 골구도 뷰어", Icon: Grid3x3 },
  { id: "glossary", label: "5. 현장용어/은어 DB", Icon: BookOpen },
  { id: "voicerequests", label: "6. 공사 확인 음성요청 내역", Icon: Headphones },
  { id: "paperwork", label: "7. 서류 작성", Icon: FileText },
  { id: "operations", label: "8. 검측·NCR·표준 공종", Icon: ClipboardCheck, badgeKey: "operations" },
];

// 하도급사(하도급 반장 모바일 모드) 탭 - 번역 사전의 키로 적는다.
export const SUB_TABS = [
  { id: "voice", labelKey: "platform.tab.voice", Icon: Mic },
  { id: "operations", labelKey: "platform.tab.requests", Icon: ClipboardCheck, badgeKey: "operations" },
];

// 탭 위쪽에 보여 주는 화면 제목·설명. 키가 있으면 번역 사전에서, text가 있으면 그대로 쓴다.
export const PAGE_META = {
  dashboard: { title: "공사현황 대시보드", desc: "현장 음성 보고, 검측 승인율, NCR 현황을 한눈에 확인합니다" },
  qrgen: { title: "공종별 QR 생성소", desc: "동·층·호실과 공종을 고르면 현장에 붙일 QR 스티커를 만들어 줍니다" },
  buildings: { titleKey: "page.buildings.title", descKey: "page.buildings.desc" },
  unitinfo: { titleKey: "page.unitinfo.title", descKey: "page.unitinfo.desc" },
  sitelayout: { titleKey: "page.sitelayout.title", descKey: "page.sitelayout.desc" },
  glossary: { titleKey: "page.glossary.title", descKey: "page.glossary.desc" },
  voicerequests: { title: "공사 확인 음성요청 내역", desc: "하도급 반장이 남긴 음성 보고를 동·호수 칸으로 모아 확인합니다" },
  paperwork: { title: "서류 작성", desc: "음성 기록으로 작업일보·TBM 일지·검측요청서 양식을 자동으로 채워 내려받습니다" },
  operations: { titleKey: "page.operations.title", descKey: "page.operations.desc" },
  voice: { titleKey: "page.voice.title", descKey: "page.voice.desc" },
};

// 관리자 화면에서만 다르게 쓰는 제목·설명(공사현황 대시보드는 별도 탭이라 "공사현황"이라는 이름을 여기서는 쓰지 않는다).
export const ADMIN_PAGE_META = {
  operations: { title: "검측 · NCR · 표준 공종", desc: "공사 확인 요청 내역, NCR 관리, 표준 공종을 한 곳에서 확인합니다" },
};
