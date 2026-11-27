// CONFIGS(Admin.tsx)의 각 도메인 섹션 키를 라우터 계층(App.jsx)에서 개별 <Route>로
// 매핑하기 위한 정적 목록이다. App.jsx가 Admin.tsx(CONFIGS 조립 + 도메인 config
// 파일 8종 + 폼 컴포넌트)를 직접 import하면 /admin에 진입하지 않는 사용자도 그
// 무게를 초기 번들에서 받게 된다 — Admin이 lazy(() => import("./pages/Admin"))로
// 분리돼 있는 이유와 같은 제약이라, 여기서는 문자열 키만 별도로 들고 있는다.
// CONFIGS와의 어긋남은 Admin.tsx 모듈 스코프의 dev 전용 검증(assertAdminSectionKeysInSync)이 잡는다.
import type { AdminMenuKey } from "../../../shared/admin-permission/menu.js";

// 키 목록 자체는 서버 permission.key 와 같이 쓰려고 shared/admin-permission/menu.ts 에 둔다.
export { ADMIN_MENU_KEYS as ADMIN_SECTION_KEYS } from "../../../shared/admin-permission/menu.js";

export type AdminSectionKey = AdminMenuKey;

export const ADMIN_DEFAULT_SECTION_KEY: AdminSectionKey = "popups";

// 제네릭 섹션 엔진이 그리는 섹션(custom 도 comingSoon 도 아닌 것). 목록, 등록(new), 수정(:id) 주소를 받는다.
// adminRoutes 가 CONFIGS 를 import 하지 않으려고 따로 든 목록이며 adminSectionKeys.test.ts 가 CONFIGS 와 같은지 본다.
export const ADMIN_ENGINE_SECTION_KEYS: readonly AdminSectionKey[] = [
  "popups",
  "banners",
  "sideBanners",
  "universityAcceptances",
  "programCategories",
  "mentorStrategies",
  "footerImages",
  "admissionGuidelines",
  "admissionUniversities",
  "admissionSusiJungsi",
  "acceptanceRates",
  "admissionCaseLogos",
  "specialHighschool",
  "specialHighschoolRates",
  "admissionResults",
  "trendingDepartments",
  "galleries",
  "columnCategories",
  "companyNews",
  "notices",
  "faqs",
  "pageContents",
  "learningDiagnosisV2SurveyCopy",
  "goalUniversityCuts",
  "premiumConsults",
  "mentorApplyFaqs",
  "mentorApplyCopy",
  "winningBaseData",
  "winningDbInputs",
  "winningSuhaengTopicDb",
  "winningSuhaengResourceDb",
  "enrollments",
  "refunds",
  "refundRequests",
  "refundLedger",
];

// 목록을 서버 페이지네이션으로 받는 엔진 섹션(config.serverPaginate). 목록 쿼리 키에 page 와 q 가 들어가는 섹션이며
// 미들웨어 선받기와 Admin.tsx 가 같은 키를 쓰도록 여기서 한 번만 든다. adminSectionKeys.test.ts 가 CONFIGS 와 같은지 본다.
export const ADMIN_SERVER_PAGINATE_SECTION_KEYS: readonly AdminSectionKey[] = [
  "admissionResults",
  "goalUniversityCuts",
];
