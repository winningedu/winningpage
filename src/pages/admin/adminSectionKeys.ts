// CONFIGS(Admin.tsx)의 각 도메인 섹션 키를 라우터 계층(App.jsx)에서 개별 <Route>로
// 매핑하기 위한 정적 목록이다. App.jsx가 Admin.tsx(CONFIGS 조립 + 도메인 config
// 파일 8종 + 폼 컴포넌트)를 직접 import하면 /admin에 진입하지 않는 사용자도 그
// 무게를 초기 번들에서 받게 된다 — Admin이 lazy(() => import("./pages/Admin"))로
// 분리돼 있는 이유와 같은 제약이라, 여기서는 문자열 키만 별도로 들고 있는다.
// CONFIGS와의 어긋남은 Admin.tsx 모듈 스코프의 dev 전용 검증(assertAdminSectionKeysInSync)이 잡는다.
export const ADMIN_SECTION_KEYS = [
  // 메인화면 관리
  "popups",
  "banners",
  "sideBanners",
  "universityAcceptances",
  "programCategories",
  "mentorStrategies",
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
  // 서비스 관리 — 프리미엄
  "premiumBookPages",
  "premiumConsults",
  // 서비스 관리 — 멘토
  "mentorApplications",
  "mentorApplyFaqs",
  "mentorApplyCopy",
  // 서비스 관리 — 위닝 DB
  "winningBaseData",
  "winningDbInputs",
  "winningSuhaengTopicDb",
  "winningSuhaengResourceDb",
  "winningSetukDb",
  "winningDeepReportDb",
  // 회원관리 — 소속(테넌트) 마스터가 회원 데이터의 상위 개념이라 members 앞에
  // 둔다(admin_resources sort_order 305, 20260922002929 참고).
  "tenants",
  "members",
  // 회원관리 — 이용 현황
  "dailyEntries",
  "usageStatus",
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
