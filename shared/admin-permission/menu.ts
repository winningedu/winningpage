// 어드민 메뉴 키 목록과 권한 레벨. 화면(라우트, 사이드바, 권한 맵)과 서버(permission.key, 감사 행)가 같은 목록을 쓴다.
// admin_resources 시드의 resource_key 와 같은 키다. 둘이 어긋나면 화면은 있는데 권한을 못 주거나 권한 화면에 유령 항목이 뜬다.

export const ADMIN_MENU_KEYS = [
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
  // 입시정보 관리 (탭 하위 키 포함, 사이드바에는 탭 목록의 첫 키만 뜬다)
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
  // 서비스 관리, 서비스
  "learningDiagnosis",
  "learningDiagnosisV2SurveyCopy",
  "goalUniversityCuts",
  "goalStudents",
  "growthReports",
  "selfevalSessions",
  "aiTelemetry",
  "knowledgeEvals",
  "serviceCreditAdjust",
  // 서비스 관리, 프리미엄
  "premiumBookPages",
  "premiumConsults",
  // 서비스 관리, 멘토
  "mentorApplications",
  "mentorApplyFaqs",
  "mentorApplyCopy",
  // 서비스 관리, 위닝 DB
  "winningBaseData",
  // 서비스 관리, 심화탐구
  "inquirySessions",
  "winningDbInputs",
  "winningSuhaengTopicDb",
  "winningSuhaengResourceDb",
  "winningSetukDb",
  "winningDeepReportDb",
  // 회원관리, 소속(테넌트) 마스터가 회원 데이터의 상위 개념이라 members 앞에
  // 둔다(admin_resources sort_order 305, 20260922002929 참고).
  "tenants",
  "members",
  // 회원관리, 계약 종료 회원 삭제(스쿨멘토, tenants 권한을 같이 쓴다. adminPermissions.ts 의 별칭)
  "memberPurge",
  "memberPurgeLogs",
  // 매출, 결제관리
  "revenue",
  "enrollments",
  "refunds",
  "refundRequests",
  "refundLedger",
  "coupons",
  // 직원관리, 20260822000010_admin_permissions 의 admin_resources 시드에도
  // 같은 키(adminMembers/adminRoles)가 들어 있다. 둘이 어긋나면 화면은 있는데
  // 권한을 못 주거나(키 누락) 권한 화면에 유령 항목이 뜬다(키 잔존).
  "adminMembers",
  "adminRoles",
  "adminAccessLogs",
] as const;

export type AdminMenuKey = (typeof ADMIN_MENU_KEYS)[number];

export const ADMIN_LEVELS = ["view", "edit"] as const;

export type AdminLevel = (typeof ADMIN_LEVELS)[number];

export function isAdminLevel(value: string): value is AdminLevel {
  return (ADMIN_LEVELS as readonly string[]).includes(value);
}
