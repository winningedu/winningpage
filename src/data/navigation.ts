// ---- 컨텐츠 격자 공유 상수 (헤더 nav·메가 컬럼이 공유하는 컨텐츠 격자, 0729 시안 2207:12337) ----
// 헤더 Header.jsx에서 이전(원래 위치: Header.jsx 상단, 산정 근거 주석 포함). SiteFooter.jsx는
// 이 상수를 import하지 않는다(2026-07-29 확인 — 별도 재작업 예정).
//
// nav 5개 셀(좌표계 2, max-w-content=72.75rem 컨텐츠 영역)과 메가 컬럼은 0729 시안부터
// 서로 다른 폭·gap을 쓴다(예전엔 완전히 동일 상수 공유) — nav 셀이 100px로 좁아지면서
// 메가 컬럼(140px, 긴 라벨 보존 위해 유지)과 더 이상 같은 상수를 쓸 수 없어 분리했다.
// 정렬 기준은 좌측선 공유다 — nav 텍스트가 셀 안에서 좌측 정렬(justify-start)이므로,
// 메가 컬럼 i의 타이틀·아이템 좌측 끝이 nav 셀 i의 텍스트 좌측 끝과 정확히 일치해야 한다.
// 두 그리드의 "피치"(셀/컬럼 폭 + gap)를 148px로 동일하게 맞추면(nav: 100+48, 메가: 140+8)
// 좌측선끼리는 marginLeft를 별도 보정 없이 동일하게 써도 항상 정렬된다(중심 정렬이었던
// 이전 버전은 컬럼이 100px보다 40px 넓어 -20px 오프셋(MEGA_GUARD)이 필요했지만, 좌측선
// 기준에서는 시작점이 같으므로 그 오프셋이 불필요 — MEGA_GUARD를 폐기하고 NAV_GUARD를
// 그대로 재사용한다).
//
// NAV_CELL_W / NAV_CELL_GAP (0729 시안 실측 — nav 5항목):
//   각 항목 100px(6.25rem) 셀, 셀 내부는 좌측 정렬(justify-start), 셀 간 gap 48px(3rem)
//   고정(피치 148px). 과거 유동 clamp(gap)는 폐기 — 시안이 고정값이라 뷰포트별 보간이
//   불필요해졌다.
// MEGA_COL_W / MEGA_COL_GAP:
//   컬럼 폭은 기존 8.75rem(140px) 유지(변경 시 "국제・해외고 국내대 입학컨설팅" 등 긴
//   서브아이템 라벨이 줄바꿈된다). gap은 140+8=148px로 nav 피치와 일치시키기 위한 8px(0.5rem)
//   고정값 — nav와 임의로 다른 값을 쓰면 컬럼-셀 좌측선 정렬이 뷰포트에 따라 어긋난다.
//
// NAV_GUARD (좁은 데스크톱 충돌 가드, 로고용):
//   marginLeft: max(0px, calc(18.382rem − (100vw − 72.75rem) / 2))
//   18.382rem = 2xl 밴드 패딩(px-30=7.5rem) + LOGO_W(10.882rem, 2026-09-03 정본 가로형
//   로고 winning-logo-horizontal.svg, 헤더 시안 4782:3215 실값 h 22px 기준 렌더 폭
//   174.112px, Header.tsx LOGO_W 주석 참고) = 2xl 기준 로고 우측 끝까지의 안전영역.
//   72.75rem은 max-w-content 토큰. 패딩이 2rem(<2xl)/7.5rem(2xl+)로 갈리지만 인라인
//   calc에는 미디어쿼리를 넣을 수 없어 더 넓은 2xl 패딩 기준(18.382rem)으로 통일했다 —
//   <2xl 구간에서는 로고와 nav 사이에 여백이 추가로 생기는 보수적 동작이고, 어느
//   구간에서도 겹치지 않는다(nav 총폭 43.25rem + 가드 최대값 < 72.75rem이라 우측
//   침범도 없다).
// MEGA_GUARD: 좌측선 정렬 기준에서는 컬럼 0의 시작이 nav 셀 0의 시작과 같아야 하므로
//   NAV_GUARD와 완전히 동일한 값을 그대로 재사용한다(별도 오프셋 보정 없음 — 위 피치
//   설명 참고). 두 이름으로 나눠 export하는 이유는 순수 값이 같더라도 nav/메가 각각의
//   의미를 코드에서 명확히 구분하기 위함이다.
//
// 2026-09-03 사용자 결정(B안): 신규 헤더 시안(header-footer-figma-2026-09.md §1·§2)이 한때
// nav·메가 컬럼을 160px/10rem 고정폭+clamp(vw)로 통일했었으나, "nav·메가 컬럼 얼라인은
// dev 방식(좌측선 공유)으로 되돌린다"는 결정에 따라 위 dev 정본 값(NAV_CELL_W 6.25rem/
// MEGA_COL_W 8.75rem, 피치 148px 공유)으로 복원했다. chevron·오픈 트리거·MY 컬럼·회색존
// 28rem·프로모 카드 0.8 스케일·계정 버튼·햄버거·메가 컬럼 제목 행 등 나머지 신규 작업은
// 이 되돌리기와 무관하게 그대로 유지한다(Header.tsx 참고).
//
// 2026-09-03 추가 결정: 헤더 로고를 가로형 정본(winning-logo-horizontal.svg)으로 최종
// 확정하며 LOGO_W가 6.5rem(스택형)에서 10.882rem(가로형, 174.112px)으로 바뀌어
// NAV_GUARD 기준값도 19.375rem → 18.382rem으로 재계산했다. NAV_GUARD=MEGA_GUARD는
// 여전히 같은 상수를 공유하므로(위 피치 설명 참고) nav·메가 컬럼은 값이 바뀌어도 항상
// 서로 같은 marginLeft를 받아 좌측선 정렬은 이 변경으로 깨지지 않는다 — 둘 다 같은 폭만큼
// 같이 이동한다(절대 좌표는 이전 기준값 대비 1rem(16px) 정도 왼쪽으로 이동한다).
import {
  PREMIUM_ADMISSION_A_PATH,
  PREMIUM_PROGRAM_PATH_PREFIX,
  USAGE_GUIDE_PATH,
} from "@/components/premium/premiumRoutesPaths";

export const NAV_GUARD = "max(0px, calc(18.382rem - (100vw - 72.75rem) / 2))";
export const MEGA_GUARD = NAV_GUARD;
export const NAV_CELL_W = "6.25rem";
export const NAV_CELL_GAP = "3rem";
export const MEGA_COL_W = "8.75rem";
export const MEGA_COL_GAP = "0.5rem";

// 프리미엄 메뉴 그룹 — DB(page_contents) 소유가 아니라 이 상수가 정본이다(premium-db-decouple:
// 프리미엄 프로그램 페이지 전체가 DB 조회 0건으로 전환되며 메뉴도 함께 코드 소유로 옮겼다).
// useNavGroups.ts가 DB에서 파생된 그룹 트리에 이 그룹을 항상 주입한다(제목 '프리미엄'인 DB
// 그룹은 있어도 무시하고 이 상수로 교체) — page_contents에 프리미엄 프로그램 행이 아예
// 없어져도(20260824000007 마이그레이션) 메뉴가 사라지지 않는다.
export const PREMIUM_NAV_GROUP = {
  title: "프리미엄",
  to: PREMIUM_ADMISSION_A_PATH,
  items: [
    {
      label: "대입컨설팅 프로그램",
      to: PREMIUM_ADMISSION_A_PATH,
      sortOrder: 1,
    },
    {
      label: "특목고입학 프로그램",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/special-highschool`,
      sortOrder: 2,
    },
    {
      label: "대학원입학 프로그램",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/graduate-school`,
      sortOrder: 3,
    },
    {
      label: "해외명문대 진학컨설팅",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/global-university`,
      sortOrder: 4,
    },
    {
      label: "국제학교 학습관리",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/international-school`,
      sortOrder: 5,
    },
    {
      label: "국제・해외고 국내대 입학컨설팅",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/returning-student`,
      sortOrder: 6,
    },
  ],
};

// 헤더 메가메뉴·푸터 공용 fallback — DB(page_contents)가 우선, 이 상수는 오프라인/최초 페인트용.
// 시안 2016:1796 기준. '프리미엄' 그룹은 PREMIUM_NAV_GROUP을 그대로 참조한다(위 주석 참고).
export const FALLBACK_NAV_GROUPS = [
  {
    title: "서비스",
    to: "/services/learning-diagnosis",
    items: [
      { label: "학습진단", to: "/services/learning-diagnosis", sortOrder: 1 },
      { label: "목표관리", to: "/services/goal", sortOrder: 2 },
      { label: "수행평가", to: "/services/performance", sortOrder: 3 },
      { label: "자기평가", to: "/services/self-assessment", sortOrder: 4 },
      { label: "심화탐구", to: "/services/research", sortOrder: 5 },
      { label: "콜멘토", to: "/services/callmentor", sortOrder: 6 },
    ],
  },
  PREMIUM_NAV_GROUP,
  {
    title: "입시정보",
    to: "/admission/guidelines",
    items: [
      { label: "대입모집요강", to: "/admission/guidelines", sortOrder: 1 },
      { label: "입결정보", to: "/admission/results", sortOrder: 2 },
      { label: "대입합격", to: "/admission/susi-jungsi", sortOrder: 3 },
      {
        label: "특목고합격",
        to: "/admission/special-highschool",
        sortOrder: 4,
      },
      { label: "교육칼럼", to: "/info/column", sortOrder: 5 },
    ],
  },
  {
    title: "이용신청",
    to: "/pricing",
    items: [
      { label: "서비스요금", to: "/pricing", sortOrder: 1 },
      { label: "프리미엄 이용", to: "/page/premium-apply", sortOrder: 2 },
      { label: "멘토신청", to: "/page/mentor-apply", sortOrder: 3 },
    ],
  },
  {
    title: "고객안내",
    to: "/company-news",
    items: [
      { label: "회사소개", to: "/company-news", sortOrder: 1 },
      { label: "공지사항", to: "/events", sortOrder: 2 },
      { label: "자주하는 질문", to: "/faq", sortOrder: 3 },
      { label: "온라인문의", to: "/online-inquiry", sortOrder: 4 },
    ],
  },
];

// 스쿨멘토 fallback 메뉴 트리(DB 캐시도 조회 결과도 없을 때의 첫 그림). 2026-11-05 확정 메뉴 이름.
// 이용신청 그룹은 이용안내 하나만 둔다. 서비스제공은 2026-11-04에 중단돼 넣지 않는다.
export const SCHOOLMENTOR_FALLBACK_NAV_GROUPS = [
  {
    title: "목표성장서비스",
    to: "/services/learning-diagnosis",
    items: [
      { label: "학습진단", to: "/services/learning-diagnosis", sortOrder: 1 },
      { label: "목표관리", to: "/services/goal", sortOrder: 2 },
      { label: "성장설계", to: "/services/growth", sortOrder: 3 },
    ],
  },
  {
    title: "수행심화서비스",
    to: "/services/performance",
    items: [
      { label: "수행평가", to: "/services/performance", sortOrder: 1 },
      { label: "심화탐구", to: "/services/research", sortOrder: 2 },
      { label: "자기평가", to: "/services/self-assessment", sortOrder: 3 },
    ],
  },
  {
    title: "입시정보",
    to: "/admission/guidelines",
    items: [
      { label: "대입모집요강", to: "/admission/guidelines", sortOrder: 1 },
      { label: "입결정보", to: "/admission/results", sortOrder: 2 },
      { label: "칼럼-교육청소식", to: "/info/column", sortOrder: 3 },
    ],
  },
  {
    title: "이용신청",
    to: USAGE_GUIDE_PATH,
    items: [{ label: "이용안내", to: USAGE_GUIDE_PATH, sortOrder: 1 }],
  },
  {
    title: "고객안내",
    to: "/company-news",
    items: [
      { label: "공지-회사소개", to: "/company-news", sortOrder: 1 },
      { label: "교육-정보안내", to: "/events", sortOrder: 2 },
      { label: "자주하는 질문", to: "/faq", sortOrder: 3 },
      { label: "온라인문의", to: "/online-inquiry", sortOrder: 4 },
    ],
  },
];

// program_categories(DB) 서비스명 → 서비스 6종 정본 라우트. ServicesSection 카드 클릭 링크가
// DB link 컬럼에 죽은 값(레거시 '/services' 스텁 등)을 담고 있을 때의 이름 기반 안전망.
// FALLBACK_NAV_GROUPS의 '서비스' 그룹 라벨・경로와 동일한 소스오브트루스로 유지할 것.
export const SERVICE_NAME_ROUTES = {
  학습진단: "/services/learning-diagnosis",
  목표관리: "/services/goal",
  수행평가: "/services/performance",
  자기평가: "/services/self-assessment",
  심화탐구: "/services/research",
  콜멘토: "/services/callmentor",
};

export const MENU_GROUP_ORDER = {
  서비스: 1,
  프리미엄: 2,
  입시정보: 3,
  이용신청: 4,
  고객안내: 5,
  합격전략: 6,
  회사소개: 7,
};
