// CONFIGS(Admin.tsx)의 각 도메인 섹션 키를 라우터 계층(App.jsx)에서 개별 <Route>로
// 매핑하기 위한 정적 목록이다. App.jsx가 Admin.tsx(CONFIGS 조립 + 도메인 config
// 파일 8종 + 폼 컴포넌트)를 직접 import하면 /admin에 진입하지 않는 사용자도 그
// 무게를 초기 번들에서 받게 된다 — Admin이 lazy(() => import("./pages/Admin"))로
// 분리돼 있는 이유와 같은 제약이라, 여기서는 문자열 키만 별도로 들고 있는다.
// CONFIGS와의 어긋남은 Admin.tsx 모듈 스코프의 dev 전용 검증(assertAdminSectionKeysInSync)이 잡는다.
export const ADMIN_SECTION_KEYS = [
  // 통계
  "hqDashboard",
  "webAnalytics",
  // 메인화면 관리
  "popups",
  "banners",
  "sideBanners",
  "universityAcceptances",
  "programCategories",
  "mentorStrategies",
  "footerImages",
  // 입시정보 관리 (탭 하위 키 포함 — 사이드바에는 탭 목록의 첫 키만 뜬다)
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
  // 고객안내 관리
  "companyNews",
  "notices",
  "faqs",
  "pageContents",
  // 서비스 관리 — 서비스
  "learningDiagnosis",
  "learningDiagnosisV2SurveyCopy",
  "goalUniversityCuts",
  "goalStudents",
  "growthReports",
  "selfevalSessions",
  "aiTelemetry",
  "knowledgeEvals",
  "serviceCreditAdjust",
  // 서비스 관리 — 프리미엄
  "premiumBookPages",
  "premiumConsults",
  // 서비스 관리 — 멘토
  "mentorApplications",
  "mentorApplyFaqs",
  "mentorApplyCopy",
  // 서비스 관리 — 위닝 DB
  "winningBaseData",
  // 서비스 관리, 심화탐구
  "inquirySessions",
  "winningDbInputs",
  "winningSuhaengTopicDb",
  "winningSuhaengResourceDb",
  "winningSetukDb",
  "winningDeepReportDb",
  // 회원관리 — 소속(테넌트) 마스터가 회원 데이터의 상위 개념이라 members 앞에
  // 둔다(admin_resources sort_order 305, 20260922002929 참고).
  "tenants",
  "members",
  // 회원관리, 계약 종료 회원 삭제(스쿨멘토, tenants 권한을 같이 쓴다. adminPermissions.ts 의 별칭)
  "memberPurge",
  "memberPurgeLogs",
  // 매출·결제관리
  "revenue",
  "enrollments",
  "refunds",
  "refundRequests",
  "refundLedger",
  "coupons",
  // 직원관리 — 20260822000010_admin_permissions 의 admin_resources 시드에도
  // 같은 키(adminMembers/adminRoles)가 들어 있다. 둘이 어긋나면 화면은 있는데
  // 권한을 못 주거나(키 누락) 권한 화면에 유령 항목이 뜬다(키 잔존).
  "adminMembers",
  "adminRoles",
  "adminAccessLogs",
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTION_KEYS)[number];

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
