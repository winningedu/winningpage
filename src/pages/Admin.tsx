import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, Plus, RefreshCw } from "lucide-react";
import {
  type CSSProperties,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import AdmissionMetaEditModal from "@/components/admission/editor/AdmissionMetaEditModal";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Toaster, toast } from "@/components/ui/toast";
import { useAuth } from "@/context/AuthProvider";
import {
  adminPermissionsQueryOptions,
  canAccessSection,
} from "@/lib/adminPermissions";
import { clearAllDrafts } from "@/lib/diagnosisDraft";
import { ApiError } from "@/lib/http/client";
import { supabase } from "@/lib/supabase";
import { ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";
// 쿠폰관리는 제네릭 CRUD 로 표현되지 않는다(파생 사용 건수 · NULL=무제한 3상태
// 입력 · slug 사전중복검사 · 사용이력 드릴다운 + void RPC). config.custom +
// customComponentKey(CUSTOM_COMPONENT_REGISTRY 조회)로 붙인다 — premiumBookPages 선례와 같은 방식이다.
// Admin.jsx 가 5,700줄이라 컴포넌트 본체는 별도 파일에 둔다(이 파일이 그 파일을
// import 하므로 역방향 import 는 만들지 않는다 — 순환 참조 방지).
import CouponAdmin from "@/pages/admin/coupons/CouponAdmin";
import GoalStudentsAdmin from "@/pages/admin/goal/GoalStudentsAdmin";
import LearningDiagnosisAdmin from "@/pages/admin/learning-diagnosis/LearningDiagnosisAdmin";
import MembersAdmin from "@/pages/admin/members/MembersAdmin";
import MentorApplicationsAdmin from "@/pages/admin/mentor/MentorApplicationsAdmin";
import PremiumBookAdmin from "@/pages/admin/premium-book/PremiumBookAdmin";
import RevenueAdmin from "@/pages/admin/revenue/RevenueAdmin";
import { useSensitiveActionGate } from "@/pages/admin/shared/SensitiveActionGate";
import AdminMembersAdmin from "@/pages/admin/staff/AdminMembersAdmin";
import AdminRolesAdmin from "@/pages/admin/staff/AdminRolesAdmin";
import MemberPurgeAdmin from "@/pages/admin/tenants/MemberPurgeAdmin";
import PurgeLogsAdmin from "@/pages/admin/tenants/PurgeLogsAdmin";
import TenantsAdmin from "@/pages/admin/tenants/TenantsAdmin";
import AccessLogsAdmin from "./admin/access-logs/AccessLogsAdmin";
import {
  ADMIN_DEFAULT_SECTION_KEY,
  ADMIN_SECTION_KEYS,
  ADMIN_SERVER_PAGINATE_SECTION_KEYS,
  type AdminSectionKey,
} from "./admin/adminSectionKeys";
import {
  AdmissionListSummary,
  AdmissionResultsListSummary,
} from "./admin/admission/AdmissionPanels";
import { adminSettingsConfigs } from "./admin/configs/adminSettings";
import { admissionConfigs } from "./admin/configs/admission";
import { analyticsConfigs } from "./admin/configs/analytics";
import { boardConfigs } from "./admin/configs/board";
import { goalConfigs } from "./admin/configs/goal";
import { mainConfigs } from "./admin/configs/main";
import { memberConfigs } from "./admin/configs/member";
import { revenueConfigs } from "./admin/configs/revenue";
import { winningConfigs } from "./admin/configs/winning";
import {
  completeRefund as completeRefundRequest,
  createSectionRow,
  deleteSectionRow,
  fetchExportChunk,
  fetchSectionRow,
  markSectionReviewed,
  requestEmbedding,
  sectionKeys,
  updateSectionMeta,
  updateSectionRow,
} from "./admin/engine/api";
import { sectionListQueryOptions } from "./admin/engine/sectionList";
import {
  type ListUrlState,
  parseListSearch,
  parseSectionView,
  sectionPath,
  withListState,
} from "./admin/engine/sectionUrl";
import { GoalCutsListSummary } from "./admin/goal/GoalCutsPanels";
import GrowthReportsAdmin from "./admin/growth/GrowthReportsAdmin";
import HqDashboardAdmin from "./admin/hq-dashboard/HqDashboardAdmin";
import InquirySessionsAdmin from "./admin/inquiry/InquirySessionsAdmin";
import BulkPanel from "./admin/knowledge/bulk/BulkPanel";
import EvalsAdmin from "./admin/knowledge/evals/EvalsAdmin";
import {
  isStaleReview,
  REVIEW_STALE_MONTH_OPTIONS,
  type ReviewStaleMonths,
} from "./admin/knowledge/review/cycle";
import SearchPreview from "./admin/knowledge/search/SearchPreview";
import SectionCopyPanel from "./admin/landing/SectionCopyPanel";
import SelfevalSessionsAdmin from "./admin/selfeval/SelfevalSessionsAdmin";
import ServiceCreditAdjustEntry from "./admin/service-credit/ServiceCreditAdjustEntry";
import {
  AdminConfigTabs,
  AdminForm,
  type AdminRow,
  AdminTable,
  collectBannerPaths,
  PAGE_SIZE,
  removeSectionFiles,
  uploadSectionFiles,
} from "./admin/shared/AdminEngine";
import { AdminTopbar } from "./admin/shared/AdminTopbar";
import { buildFieldLabels, reportAdminError } from "./admin/shared/adminErrors";
import {
  toastProgress,
  toastSuccess,
  toastWarning,
} from "./admin/shared/adminToast";
import { ConfirmAdminHost, confirmAdmin } from "./admin/shared/confirmAdmin";
import {
  csvBody,
  csvHeader,
  downloadCsv,
  downloadCsvText,
  searchable,
} from "./admin/shared/csvExport";
import { useUnsavedGuard } from "./admin/shared/useUnsavedGuard";
import TelemetryAdmin from "./admin/telemetry/TelemetryAdmin";
import WebAnalyticsAdmin from "./admin/web-analytics/WebAnalyticsAdmin";

// CSV 청크 내보내기 1회 요청 크기. PostgREST 기본 응답 상한이 1,000행이라 이보다
// 크게 잡아도 잘려 나온다 — 43k행이면 44회 왕복이다.
const HIDDEN_PAGE_SLUGS = [
  "admission-susi",
  "admission-jungsi",
  "admission-essay",
  "winning-faq",
];

const SEARCH_DEBOUNCE_MS = 300;

// 어드민 대분류 — 노션 「관리자 페이지 > 메뉴 및 기능 정리」 기획표(2026-08-22
// 확정분)의 재편안이다. 기획표 8개 대분류 중 화면이 있는 7개만 그린다. 화면·섹션 키·라우트는 그대로 두고 묶는 방식과 라벨만 바꾼다.
//   - 구 「게시판 관리」 해체 → 입시정보 관리 + 고객안내 관리
//   - 구 「위닝관리」·「프로그램 관리」·「목표관리」 흡수 → 서비스 관리 하위(소분류 캡션)
//   - 구 「관리자 설정」 → 직원관리
// 기획표의 「멘토용페이지」·콜멘토 하위(멘토관리·상담내역·정산·멘토카드)는 콜멘토
// 런칭 연기로 이번 범위에서 빠졌다 — 화면이 없으므로 메뉴도 만들지 않는다.
// ⚠️ 여기 group_title/label/정렬은 admin_resources 시드(권한 화면이 읽는 사본)와
//    같이 움직여야 한다 — 20260823000002_admin_resources_recategorize.sql.
type AdminMenuItem = {
  key: AdminSectionKey;
  label: string;
  // 소분류 캡션. 세부메뉴가 많은 그룹에서만 채운다(지금은 서비스 관리 하나) —
  // 사이드바는 section 이 바뀌는 첫 항목에만 캡션을 그린다(AdminSidebar).
  section?: string;
};

const MENU_GROUPS: { title: string; items: AdminMenuItem[] }[] = [
  // 통계: 본사 대시보드(우리 DB)와 방문 분석(Vercel Web Analytics). 분석 grill 2026-11-23.
  {
    title: "통계",
    items: [
      { key: "hqDashboard", label: "대시보드" },
      { key: "webAnalytics", label: "방문 분석" },
    ],
  },
  {
    title: "메인화면 관리",
    items: [
      { key: "popups", label: "팝업 관리" },
      { key: "banners", label: "메인 배너 관리" },
      { key: "sideBanners", label: "우측 소형 배너" },
      { key: "universityAcceptances", label: "합격생 대학 관리" },
      { key: "programCategories", label: "핵심 서비스" },
      // 기획표 라벨 변경: 멘토 성공전략 → 멘토스 소개.
      { key: "mentorStrategies", label: "멘토스 소개" },
      { key: "footerImages", label: "푸터관리" },
      // premiumAchievements(프리미엄 실적 뱃지) 화면은 premium-db-decouple로 제거했다 —
      // premium_achievements 테이블 자체가 drop되고(20260824000008), 프리미엄 랜딩은
      // premiumStaticData.ts 코드 상수를 쓴다.
    ],
  },
  // 입시정보 관리 — 사용자단 내비게이션의 「입시정보」 그룹(src/data/navigation.ts)과
  // 같은 구성이다. 교육칼럼이 여기 들어가는 것도 그쪽 그룹을 따른 것.
  {
    title: "입시정보 관리",
    items: [
      // 기획표 라벨 변경: 대학별 모집요강 → 대입 모집 요강.
      { key: "admissionGuidelines", label: "대입 모집 요강" },
      { key: "admissionUniversities", label: "대학 목록 관리" },
      // 라벨은 「대입합격」이다. 노션 기획표(8/22)에 「수시정시합격」으로 적혀
      // 있지만 그쪽이 더 옛날 결정이고, 정시 이용자가 거의 없어 수시·정시를
      // 묶어 「대입합격」으로 가기로 뒤집혔다(사용자 확정 2026-08-23, QA 49행).
      // 사용자단도 같은 라벨이다 — useNavGroups 가 DB 의 구 라벨을 런타임에
      // '대입합격'으로 치환하고 있고(useNavGroups.ts:64) 전용 테스트도 있다.
      { key: "admissionSusiJungsi", label: "대입합격" },
      { key: "specialHighschool", label: "특목고합격" },
      // 기획표에 「개발 중, 우선 보류」로 적힌 둘이지만 화면은 이미 동작 중이라
      // 그대로 둔다 — 메뉴에서 빼면 살아 있는 기능이 사라지는 회귀가 된다.
      { key: "admissionResults", label: "입결정보" },
      { key: "trendingDepartments", label: "지금 뜨고 있는 학과" },
      { key: "galleries", label: "교육칼럼" },
      { key: "columnCategories", label: "칼럼 카테고리" },
    ],
  },
  {
    title: "고객안내 관리",
    items: [
      { key: "companyNews", label: "회사소식" },
      { key: "notices", label: "공지사항" },
      { key: "faqs", label: "자주하는질문" },
      // 세부 페이지 관리(page_contents)에 회사소개 문구가 들어 있어 회사소식과
      // 같은 계열로 본다(2026-08-22 확정).
      { key: "pageContents", label: "세부 페이지 관리" },
    ],
  },
  // 서비스 관리 — 판매 중인 서비스의 운영 화면을 전부 모은 최대 그룹(16개)이다.
  // 세부메뉴가 많아 item.section(소분류 캡션)으로 한 단계 더 끊는다.
  {
    title: "서비스 관리",
    items: [
      { key: "learningDiagnosis", label: "학습진단 관리", section: "서비스" },
      {
        key: "learningDiagnosisV2SurveyCopy",
        label: "학습진단(ver2) 문항 문구",
        section: "서비스",
      },
      // 목표관리(goal_*)는 기획표에 빠져 있었다 — 판매 중인 서비스라 누락으로
      // 보고 「서비스」 소분류에 채운 것(2026-08-22 확정).
      {
        key: "goalUniversityCuts",
        label: "목표관리 — 대학 컷",
        section: "서비스",
      },
      { key: "goalStudents", label: "목표관리 — 학생 현황", section: "서비스" },
      { key: "growthReports", label: "성장설계 회차", section: "서비스" },
      { key: "selfevalSessions", label: "자기평가서 세션", section: "서비스" },
      { key: "aiTelemetry", label: "AI 호출 계기판", section: "서비스" },
      {
        key: "knowledgeEvals",
        label: "지식 검색 품질 평가",
        section: "서비스",
      },
      {
        key: "serviceCreditAdjust",
        label: "서비스이용횟수조정",
        section: "서비스",
      },
      {
        key: "premiumBookPages",
        label: "프리미엄 책자 관리",
        section: "프리미엄",
      },
      {
        key: "premiumConsults",
        label: "프리미엄 상담 신청",
        section: "프리미엄",
      },
      // ⚠️ 멘토 3종은 콜멘토와 무관하게 이미 서비스 중이다(멘토 지원 접수 +
      //    멘토신청 랜딩). 콜멘토 보류에 휩쓸어 지우지 말 것.
      { key: "mentorApplications", label: "멘토 신청 내역", section: "멘토" },
      { key: "mentorApplyFaqs", label: "멘토신청 FAQ", section: "멘토" },
      { key: "mentorApplyCopy", label: "멘토신청 문구", section: "멘토" },
      { key: "winningBaseData", label: "기초데이터추출", section: "위닝 DB" },
      { key: "inquirySessions", label: "심화탐구 세션", section: "서비스" },
      { key: "winningDbInputs", label: "위닝DB입력", section: "위닝 DB" },
      {
        key: "winningSuhaengTopicDb",
        label: "위닝 수행 주제 DB",
        section: "위닝 DB",
      },
      {
        key: "winningSuhaengResourceDb",
        label: "위닝 수행 자료 DB",
        section: "위닝 DB",
      },
      { key: "winningSetukDb", label: "위닝 세특 DB", section: "위닝 DB" },
      {
        key: "winningDeepReportDb",
        label: "위닝 심화보고서 DB",
        section: "위닝 DB",
      },
    ],
  },
  // 회원관리 — 상세(6탭)가 QA 182의 「고객조회상담」을 통째로 흡수했다.
  // 수강 신청 내역은 결제 원장이라 매출·결제관리로 옮겼다.
  {
    title: "회원관리",
    items: [
      // 소속(테넌트) 마스터가 회원 데이터의 상위 개념이라 회원 목록 앞에 둔다
      // (admin_resources sort_order 305 < members, 20260922002929).
      { key: "tenants", label: "기관 관리" },
      { key: "members", label: "회원 목록" },
      // 스쿨멘토 전용. canAccessSection 이 tenants 권한과 hqTenantAdmin 플래그로 거른다.
      { key: "memberPurge", label: "계약 종료 회원 삭제" },
      { key: "memberPurgeLogs", label: "삭제 로그" },
    ],
  },
  {
    title: "매출·결제관리",
    items: [
      // 납부상태·수강료·감면액·납부액 컬럼을 가진 사실상 결제 원장이라 회원관리가
      // 아니라 여기 둔다 — 회원 상세의 결제내역 탭과 역할이 겹치는 것도 피한다.
      { key: "revenue", label: "매출 및 결제" },
      { key: "enrollments", label: "수강 신청 내역" },
      // 「매출 조정」·「매출 정산」·「일일정산」은 2026-08-23 에 없앴다.
      // 셋 다 운영자가 손으로 적는 수기 장부였고, 앞의 둘은 화면이 그리던 컬럼이
      // 실제 payments 스키마에 아예 없어 빈 화면으로 떠 있었다. 실제 결제
      // (orders/order_items)를 보는 「매출 및 결제」가 이 자리를 대신한다.
      // CONFIGS.refunds 라벨과 동일하게 유지할 것 — '환불 신청 내역'(아래)과
      // 혼동돼 있던 라벨을 2026-08-12 정정했다.
      { key: "refunds", label: "환불 수기 대장" },
      // fn_request_refund(고객 신청) 원장 — 위 refunds(관리자 수기 대장)와는
      // 다른 테이블이다. CONFIGS.refundRequests 참고.
      { key: "refundRequests", label: "환불 신청 내역" },
      // QA 275 — 완료된 환불의 결과 원장(파일18 「환불 처리 대장」).
      { key: "refundLedger", label: "환불 처리 대장" },
      { key: "coupons", label: "쿠폰관리" },
    ],
  },
  // 직원관리(구 「관리자 설정」) — 실무 관리자 묶음에는 이 그룹 권한 항목이
  // 하나도 없어(규칙 3) 메뉴 자체가 보이지 않는다. 최고 관리자만 쓴다.
  {
    title: "직원관리",
    items: [
      { key: "adminMembers", label: "관리자 관리" },
      { key: "adminRoles", label: "관리자 권한 관리" },
      // 개인정보 반출 게이트가 남기는 원장(QA 268·270·228·223·271·269).
      // RLS 상 최고 관리자만 읽는다.
      { key: "adminAccessLogs", label: "개인정보 접근 로그" },
    ],
  },
];

const CONFIGS = {
  ...mainConfigs,
  ...boardConfigs,
  ...admissionConfigs,
  ...memberConfigs,
  ...winningConfigs,
  ...revenueConfigs,
  ...goalConfigs,
  ...adminSettingsConfigs,
  ...analyticsConfigs,
};

// App.jsx의 ADMIN_SECTION_KEYS(라우트 목록, adminSectionKeys.ts)와 여기 CONFIGS가
// 어긋나면 새 config 키를 추가하고도 라우트를 안 만든(또는 반대) 상태로 배포될 수
// 있다 — dev에서만 즉시 알아채도록 콘솔 경고를 낸다(빌드 실패로는 만들지 않는다,
// 두 파일이 물리적으로 분리돼 있어야 하는 이유는 adminSectionKeys.ts 상단 주석 참고).
if (import.meta.env.DEV) {
  const declared = [...ADMIN_SECTION_KEYS].sort();
  const actual = Object.keys(CONFIGS).sort();
  if (JSON.stringify(declared) !== JSON.stringify(actual)) {
    console.error(
      "[admin] adminSectionKeys.ts와 CONFIGS가 어긋났습니다 — 라우트 목록을 갱신하세요.",
      { declared, actual },
    );
  }
}

// config.custom인 5개 config가 렌더할 실제 컴포넌트를 config.customComponentKey
// 문자열 → 컴포넌트 함수로 조회하는 간접 레이어. CONFIGS 리터럴 안에 컴포넌트
// 값을 직접 실어두면(구 CustomComponent 필드) CONFIGS를 나중에 별도 파일로
// 옮길 때(4단계) 그 파일이 도메인 컴포넌트 파일들을 import해야 하고, 그
// 컴포넌트들도 자기 config를 읽으려 다시 CONFIGS를 import하면서 순환 참조가
// 생긴다. 여기서는 CONFIGS가 문자열만 갖고, 이 레지스트리만 컴포넌트를
// import한다 — CONFIGS 쪽에서 도메인 컴포넌트로의 의존이 아예 없어진다.
const CUSTOM_COMPONENT_REGISTRY = {
  coupons: CouponAdmin,
  learningDiagnosis: LearningDiagnosisAdmin,
  premiumBookPages: PremiumBookAdmin,
  mentorApplications: MentorApplicationsAdmin,
  goalStudents: GoalStudentsAdmin,
  members: MembersAdmin,
  adminMembers: AdminMembersAdmin,
  adminRoles: AdminRolesAdmin,
  adminAccessLogs: AccessLogsAdmin,
  revenue: RevenueAdmin,
  tenants: TenantsAdmin,
  memberPurge: MemberPurgeAdmin,
  memberPurgeLogs: PurgeLogsAdmin,
  growthReports: GrowthReportsAdmin,
  selfevalSessions: SelfevalSessionsAdmin,
  aiTelemetry: TelemetryAdmin,
  knowledgeEvals: EvalsAdmin,
  serviceCreditAdjust: ServiceCreditAdjustEntry,
  inquirySessions: InquirySessionsAdmin,
  hqDashboard: HqDashboardAdmin,
  webAnalytics: WebAnalyticsAdmin,
};

// CUSTOM_COMPONENT_REGISTRY와 같은 이유의 간접 레이어 — config.ListSummary가
// 컴포넌트를 직접 실으면 CONFIGS를 도메인별 파일로 옮길 때(4단계) 그 파일이
// 여기 정의된 컴포넌트들(AdmissionListSummary 등)을 import해야 하고, 그
// 컴포넌트들도 Admin.jsx 안의 다른 헬퍼를 참조하므로 순환 참조가 생긴다.
// CONFIGS는 config.listSummaryKey 문자열만 갖고, 조회는 이 레지스트리가 진다.
const LIST_SUMMARY_REGISTRY = {
  admissionListSummary: AdmissionListSummary,
  admissionResultsListSummary: AdmissionResultsListSummary,
  acceptanceRateSummary: AcceptanceRateSummary,
  goalCutsListSummary: GoalCutsListSummary,
  acceptanceCopyPanel: AcceptanceCopyPanel,
  servicesCopyPanel: ServicesCopyPanel,
  mentorCopyPanel: MentorCopyPanel,
};

const _OPTION_EMPTY = {
  label: "",
  program_ids: [],
  is_active: true,
  sort_order: 1,
};

const WINNING_RAG_KNOWLEDGE_TYPES = new Set([
  "topic_pattern",
  "verified_resource",
]);

function shouldRequestWinningEmbedding(config, row) {
  if (config?.table !== "winning_assessment_knowledge_items") return false;
  return WINNING_RAG_KNOWLEDGE_TYPES.has(String(row?.knowledge_type || ""));
}

// 임베딩 진입점은 자기 저장소의 /api 하나뿐이다(api 클라이언트가 세션 토큰을 싣는다).
export async function requestWinningEmbedding(row) {
  if (!row?.id) return null;

  try {
    const result = await requestEmbedding(row.id);

    console.log("위닝 수행 DB 자동 임베딩 요청 완료:", result);
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // 공용 PC에 학습진단 초안(성적, 목표 학교)이 남지 않게 함께 지운다.
      clearAllDrafts();
      await supabase.auth.signOut().catch(() => {});
      console.error(
        "위닝 수행 DB 자동 임베딩 요청 실패:",
        new Error(
          `${error.detail || "관리자 인증 실패"}: 로그아웃 후 다시 로그인하세요.`,
        ),
      );
      return null;
    }
    console.error("위닝 수행 DB 자동 임베딩 요청 실패:", error);
    return null;
  }
}

// 어드민 사이드바는 어두운 배경을 유지한다. ui 사이드바 토큰을 이 래퍼에서만 덮어쓰고
// 전역(:root)은 건드리지 않는다. 앱 셸 사이드바(AppShellSidebar)는 전역 값을 그대로 쓴다.
const ADMIN_SIDEBAR_THEME = {
  "--sidebar": "#101214",
  "--sidebar-foreground": "#ffffff",
  "--sidebar-accent": "rgb(255 255 255 / 0.1)",
  "--sidebar-accent-foreground": "#ffffff",
  "--sidebar-border": "rgb(255 255 255 / 0.1)",
  "--sidebar-primary": "#ffffff",
  "--sidebar-primary-foreground": "#101214",
  "--sidebar-ring": "rgb(255 255 255 / 0.6)",
} as CSSProperties;

function AdminSidebar({ activeKey }: { activeKey: string }) {
  // 자식 탭(acceptanceRates/admissionCaseLogos)에 있을 때도 사이드바에서는
  // 탭 목록의 첫 번째 key(admissionSusiJungsi)를 기준으로 활성 항목을 매칭한다.
  const sidebarActiveKey = CONFIGS[activeKey]?.tabs
    ? CONFIGS[activeKey].tabs[0].key
    : activeKey;
  const activeGroupTitle = MENU_GROUPS.find((group) =>
    group.items.some((item) => item.key === sidebarActiveKey),
  )?.title;

  // 처음에는 현재 항목의 그룹만 펼친다. 다른 그룹의 항목으로 이동하면 그 그룹을
  // 추가로 펼치되, 이미 열린 그룹은 닫지 않는다(렌더 중 prop 변경에 맞춰 state 보정).
  const [open, setOpen] = useState(
    () => new Set(activeGroupTitle ? [activeGroupTitle] : []),
  );
  const [prevActiveGroupTitle, setPrevActiveGroupTitle] =
    useState(activeGroupTitle);
  if (activeGroupTitle !== prevActiveGroupTitle) {
    setPrevActiveGroupTitle(activeGroupTitle);
    if (activeGroupTitle && !open.has(activeGroupTitle)) {
      setOpen(new Set(open).add(activeGroupTitle));
    }
  }

  // 권한이 있는 메뉴만 그린다 — 라우트 가드(requireAdminMiddleware)와 **같은 규칙**을
  // 쓴다(canAccessSection). 예전에는 MENU_GROUPS 를 무조건 전부 그려서, 「접근 불가」로
  // 설정한 메뉴가 그대로 보이고 눌러도 들어가졌다(2026-08-23).
  //
  // 빈 목록으로 시작한다 — 전부 그렸다가 지우면 권한 없는 메뉴가 한 번 번쩍인다.
  // 라우트 가드가 이미 같은 조회를 마친 뒤라(캐시 TTL 15초) 실제로는 즉시 채워진다.
  const { userId } = useAuth();
  const { data: access } = useQuery({
    ...adminPermissionsQueryOptions(userId ?? ""),
    enabled: !!userId,
  });

  // 못 읽거나 읽는 중이면 그리지 않는다(fail-closed).
  const menuGroups = useMemo(() => {
    if (!access) return [];
    return MENU_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        canAccessSection(access.permissions, access.isSuper, item.key),
      ),
    })).filter((group) => group.items.length > 0);
  }, [access]);

  const allOpen = menuGroups.every((group) => open.has(group.title));

  function toggleAll() {
    setOpen(allOpen ? new Set() : new Set(menuGroups.map((g) => g.title)));
  }

  function toggle(title) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <aside
      className="fixed left-0 top-0 z-40 h-screen w-56 text-white"
      style={ADMIN_SIDEBAR_THEME}
    >
      <Sidebar collapsible="none">
        <SidebarHeader className="border-b border-white/10 px-5 py-5 text-2xl font-bold">
          관리자
        </SidebarHeader>

        <SidebarContent className="overflow-hidden">
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-2 py-3">
              {menuGroups.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="mb-1 rounded px-2 py-1 text-xs text-white/70 outline-hidden hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  {allOpen ? "모두 접기" : "모두 펼치기"}
                </button>
              )}
              {menuGroups.map((group) => {
                const isOpen = open.has(group.title);

                return (
                  <Collapsible
                    key={group.title}
                    open={isOpen}
                    onOpenChange={() => toggle(group.title)}
                  >
                    <SidebarGroup className="py-2">
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-[0.9375rem] font-semibold outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                        {group.title}
                        <ChevronDown
                          size={16}
                          className={`transition ${isOpen ? "rotate-0" : "-rotate-90"}`}
                        />
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <SidebarMenu className="mt-1 gap-1">
                          {group.items.map((item, index) => {
                            const isActive = sidebarActiveKey === item.key;

                            return (
                              <Fragment key={item.key}>
                                {/* 소분류 캡션. 기획표의 3단(대분류 > 소분류 > 세부메뉴)을
                              접었다 펴는 단계를 하나 더 두지 않고 캡션으로 표현한다.
                              「서비스 관리」가 16개로 가장 크고, 그 안에서 서비스,
                              프리미엄, 멘토, 위닝 DB가 섞이면 훑기 어렵다.
                              섹션이 바뀌는 첫 항목에서만 그린다. */}
                                {item.section &&
                                  item.section !==
                                    group.items[index - 1]?.section && (
                                    <li className="px-4 pb-1 pt-3 text-[0.6875rem] font-medium tracking-wide text-white/60">
                                      {item.section}
                                    </li>
                                  )}
                                <SidebarMenuItem>
                                  <SidebarMenuButton
                                    isActive={isActive}
                                    render={<Link to={`/admin/${item.key}`} />}
                                    aria-current={isActive ? "page" : undefined}
                                    className={`h-auto px-4 py-2 text-[0.8125rem] font-medium data-active:font-semibold before:mr-2 before:content-["•"] ${
                                      isActive
                                        ? "text-white before:text-red-500"
                                        : "text-white/55 before:text-white/35"
                                    }`}
                                  >
                                    {item.label}
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              </Fragment>
                            );
                          })}
                        </SidebarMenu>
                      </CollapsibleContent>
                    </SidebarGroup>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        </SidebarContent>
      </Sidebar>
    </aside>
  );
}

// LIST_SUMMARY_REGISTRY 의 랜딩 섹션 제목 패널 3종. 레지스트리가 모듈 초기화 시점에
// 평가하므로 GoalCutsListSummary 와 같이 **function 선언문**이어야 한다(TDZ).
function AcceptanceCopyPanel() {
  return <SectionCopyPanel sectionKey="acceptance" />;
}

function ServicesCopyPanel() {
  return <SectionCopyPanel sectionKey="services" />;
}

function MentorCopyPanel() {
  return <SectionCopyPanel sectionKey="mentor" />;
}

function AcceptanceRateSummary({ rows }) {
  const active = (rows || []).filter((row) => row.is_active);
  if (active.length === 0) return null;

  const average =
    active.reduce((sum, row) => sum + Number(row.rate || 0), 0) / active.length;

  return (
    <div className="mb-6 grid grid-cols-2 bg-white text-center text-sm shadow-sm">
      <div className="border p-4">
        <div className="font-semibold">노출 연도 수</div>
        <div className="mt-2 font-bold">{active.length}개년</div>
      </div>
      <div className="border p-4">
        <div className="font-semibold">홈페이지 표시값</div>
        <div className="mt-2 font-bold text-blue-600">
          {active.length}개년 평균 {average.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function MoneySummary({ activeKey, rows }) {
  if (!["refunds"].includes(activeKey)) return null;

  const sale = rows.reduce(
    (sum, row) => sum + Number(row.sale_amount || row.total_sale_amount || 0),
    0,
  );
  const discount = rows.reduce(
    (sum, row) =>
      sum + Number(row.discount_amount || row.total_discount_amount || 0),
    0,
  );
  const paid = rows.reduce(
    (sum, row) => sum + Number(row.paid_amount || row.total_paid_amount || 0),
    0,
  );
  const refund = rows.reduce(
    (sum, row) =>
      sum + Number(row.refund_amount || row.total_refund_amount || 0),
    0,
  );

  return (
    <div className="mb-6 grid grid-cols-4 bg-white text-center text-sm shadow-sm">
      <div className="border p-4">
        <div className="font-semibold">판매금액 합계</div>
        <div className="mt-2 font-bold">{sale.toLocaleString()}원</div>
      </div>
      <div className="border p-4">
        <div className="font-semibold">감면액 합계</div>
        <div className="mt-2 font-bold">{discount.toLocaleString()}원</div>
      </div>
      <div className="border p-4">
        <div className="font-semibold">실 납부금액 합계</div>
        <div className="mt-2 font-bold text-blue-600">
          {paid.toLocaleString()}원
        </div>
      </div>
      <div className="border p-4">
        <div className="font-semibold">환불금액 합계</div>
        <div className="mt-2 font-bold text-red-500">
          {refund.toLocaleString()}원
        </div>
      </div>
    </div>
  );
}

// 섹션(=CONFIGS 키)마다 App.jsx가 개별 <Route>로 매핑하고, 그 라우트의 element가
// 이 컴포넌트를 section prop과 함께 렌더한다(라우트 정의는 adminSectionKeys.ts +
// App.jsx 참고) — activeKey는 더 이상 내부 state가 아니라 어느 라우트가
// 매칭됐는지로 결정된다. 섹션이 바뀌면 다른 라우트가 매칭되어 이 컴포넌트가
// 통째로 새로 마운트되므로, 예전 changeTab이 손으로 초기화하던
// mode/editingRow/pendingSection/keyword/searchTerm/page/pendingCreateDefaults는
// 전부 마운트 시점의 useState 초기값으로 자연히 리셋된다.
// 등록, 수정 화면에서만 그린다. useBlocker 는 데이터 라우터가 필요해 목록 화면에는 걸지 않는다.
function UnsavedGuard({ dirty }: { dirty: boolean }) {
  useUnsavedGuard(dirty);
  return null;
}

export function AdminSectionRoute({ section }: { section: string }) {
  const activeKey = section;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // 화면 모양(목록, 등록, 수정)은 주소가 정한다. 라우트 표는 adminRoutes.tsx.
  const view = parseSectionView(location.pathname, activeKey);
  const routeState = location.state as {
    listSearch?: unknown;
    prefillCreateDefaults?: Partial<AdminRow>;
  } | null;
  // 등록, 수정 화면에서 돌아갈 목록 주소. 목록이 들고 온 검색값(쪽, 검색어, 필터)을 그대로 돌려준다.
  const listSearch =
    typeof routeState?.listSearch === "string" &&
    routeState.listSearch.startsWith("?")
      ? routeState.listSearch
      : "";
  const listPath = `${sectionPath(activeKey)}${listSearch}`;
  // 다른 섹션에서 navigateWithPrefill로 건너온 1회성 등록 프리필(§4-3-C-4 원클릭
  // 컷 만들기). location.state에 실려 오므로 마운트 시점 값만 읽는다.
  const [prefill] = useState<Partial<AdminRow> | null>(() =>
    view.kind === "new" ? (routeState?.prefillCreateDefaults ?? null) : null,
  );
  // location.state는 History API의 history.state에 실려 새로고침 후에도 남는다 —
  // 마운트 시 1회 소비한 뒤 지워서, 이 주소에서 새로고침해도 프리필이 재적용되지
  // 않게 한다. 마운트 시점 값만 봐야 하는 1회성 효과라 deps를 비운다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 위 설명 참고 — 마운트 1회성 효과.
  useEffect(() => {
    if (!prefill) return;
    navigate(location.pathname, {
      replace: true,
      state: { listSearch },
    });
  }, []);
  // 목록 셀 [수정]으로 진입할 때 편집 다이얼로그가 열릴 섹션 키. null이면 닫힘.
  // AdminForm의 initialSection/origin으로만 쓰인다. 다이얼로그가 편집하는 행은 editingRow다.
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<AdminRow | null>(null);
  // 등록, 수정 화면의 저장 안 된 변경 여부(이탈 확인용)와, 저장을 마치고 목록으로 돌아가는 중인지.
  const [formDirty, setFormDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // 목록 CRUD(등록·수정·삭제) 성공 횟수. ListSummary가 "자기 집계를 다시 읽어야
  // 하는 시점"을 아는 유일한 신호다 — loadRows()는 목록 rows만 새로 받고
  // ListSummary가 스스로 던지는 집계 쿼리(예: GoalCutsOverviewBlock의 head
  // 카운트 6종)는 건드리지 않아서, 행을 지워도 상단 요약이 옛 숫자를 그대로
  // 보여 준다. page/keyword 변경으로는 올라가지 않으므로 페이지 이동마다
  // 집계를 다시 던지는 낭비도 없다.
  const [mutationSeq, setMutationSeq] = useState(0);
  // 관리 열 ⚙️(메타 전용 모달)이 열려 있는 행. null이면 닫힘. 목록 위에 오버레이만 뜬다
  // (목록 셀 [수정]과 같은 1뎁스 UX).
  const [metaEditRow, setMetaEditRow] = useState<AdminRow | null>(null);
  // 목록 상태(쪽, 검색어, 목록 필터, 미검토 필터)는 주소에 둔다. 새로고침과 뒤로가기가 목록을 그대로 되살린다.
  const listState = parseListSearch(searchParams);
  const page = listState.page;
  // 서버 페이지네이션 탭에서 실제로 서버로 나가는 검색어(주소의 q). keyword는 타이핑마다
  // 바뀌므로 그대로 쓰면 글자당 한 번씩 조회가 나간다. 디바운스한 값만 주소에 쓴다.
  const searchTerm = listState.q;
  const [keyword, setKeyword] = useState(listState.q);
  // 목록 상단 드롭다운 필터의 선택값(QA 227). 지금 선택지에 없는 값은 아래에서 무시한다.
  const listFilterValue = listState.filter;
  // 지식 DB "미검토만 보기" 필터(config.knowledgeReview). 기준 개월 수는 화면에서 고른다.
  const reviewStaleOnly = listState.stale;
  const reviewStaleMonths = listState.months;
  // 목록 상태를 주소에 쓴다. 쪽 이동과 필터는 히스토리를 쌓고, 타이핑으로 바뀌는 검색어는 쌓지 않는다.
  function patchList(patch: Partial<ListUrlState>, replace = false) {
    setSearchParams((prev) => withListState(prev, patch), { replace });
  }
  function setPage(next: number | ((prev: number) => number)) {
    patchList({ page: typeof next === "function" ? next(page) : next });
  }
  // CSV 청크 내보내기 진행 상태. null이면 진행 중 아님.
  const [exporting, setExporting] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // 개인정보 반출 게이트 — 모달 상태를 이 훅이 들고, gate 를 아래 트리에 그린다.
  const { requestAccess, gate } = useSensitiveActionGate();

  const config = CONFIGS[activeKey];
  const queryClient = useQueryClient();

  // 목록은 서버(/api/admin/sections)에서 받는다. 서버 페이지네이션 탭은 page 와 q 가 키에 들어가
  // 바뀔 때마다 다시 받고, 그 외 탭은 섹션 키 하나로 전량을 받는다.
  // 키와 요청은 라우트 미들웨어의 선받기와 같은 sectionListQueryOptions 로 만든다(둘이 어긋나면 선받기가 헛돈다).
  const paginate = (
    ADMIN_SERVER_PAGINATE_SECTION_KEYS as readonly string[]
  ).includes(activeKey);
  const listEnabled = !config.custom && !config.comingSoon;
  const isList = view.kind === "list";
  const listQuery = useQuery({
    ...sectionListQueryOptions(activeKey, { page, q: searchTerm }),
    enabled: listEnabled && isList,
    refetchOnWindowFocus: false,
  });
  // 수정 주소(/:id)는 새로고침해도 행을 id 로 다시 받는다. 목록 행으로 채우지 않는 이유는
  // 목록이 조인 뷰의 행일 수 있어 저장용 행과 모양이 다를 수 있기 때문이다.
  const editId = view.kind === "edit" ? view.id : null;
  const rowQuery = useQuery({
    queryKey: sectionKeys.row(activeKey, editId ?? ""),
    queryFn: ({ signal }) =>
      fetchSectionRow(activeKey, editId as string, signal),
    enabled: listEnabled && editId !== null,
    // 편집 중에 다시 받아 폼 아래의 행이 바뀌지 않게 한다.
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const editTarget = rowQuery.data ?? null;
  const listData = listQuery.isError ? undefined : listQuery.data;
  const rows = useMemo<AdminRow[]>(() => {
    const items = listData?.items ?? [];
    return activeKey === "pageContents"
      ? items.filter((row) => !HIDDEN_PAGE_SLUGS.includes(row.slug))
      : items;
  }, [listData, activeKey]);
  // 서버 페이지네이션 탭의 전체 건수. 전량 로드 탭은 rows.length가 곧 전체다.
  const totalCount = paginate ? (listData?.total ?? 0) : rows.length;
  const loading = listEnabled && isList && listQuery.isFetching;
  // 목록 쿼리를 무효화해 다시 받는다(등록, 수정, 삭제 뒤와 [초기화]).
  function loadRows() {
    return queryClient.invalidateQueries({
      queryKey: sectionKeys.section(activeKey),
    });
  }

  // 쓰기 요청. 목록 갱신(invalidate)과 토스트는 호출부가 순서대로 처리한다.
  const reviewMutation = useMutation({
    mutationFn: (id: string) => markSectionReviewed(activeKey, id),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string | number) => deleteSectionRow(activeKey, id),
  });
  // 저장 뒤 임베딩 요청. 저장과 토스트는 이 응답을 기다리지 않는다(실패는 함수 안에서 로그만 남긴다).
  const embedMutation = useMutation({ mutationFn: requestWinningEmbedding });
  const refundMutation = useMutation({
    mutationFn: (id: string | number) => completeRefundRequest(id),
  });
  const metaMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string | number;
      values: Record<string, unknown>;
    }) => updateSectionMeta(activeKey, id, values),
  });

  const ListSummaryComponent = config.listSummaryKey
    ? LIST_SUMMARY_REGISTRY[config.listSummaryKey]
    : null;

  // 목록 상단 드롭다운(config.listFilter)의 선택지 — 불러온 행의 실제 값에서
  // 중복을 걷어내 만든다(QA 227). 빈 값은 선택지가 될 수 없어 뺀다.
  const listFilterOptions = useMemo(() => {
    const key = config.listFilter?.key;
    if (!key) return [];
    const seen = new Set<string>();
    for (const row of rows) {
      const value = String(row[key] ?? "").trim();
      if (value) seen.add(value);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows, config.listFilter?.key]);

  // 실제로 적용할 필터값. 지금 선택지에 없는 값은 무시한다(QA 227) — 메뉴를 옮기면
  // 선택지가 통째로 달라지는데 이전 선택이 살아 있으면 새 목록이 0건으로 보인다.
  // 상태를 effect 로 비우는 대신 "유효하지 않으면 없는 것으로 친다"로 두면 값이
  // 잠깐 남아 있는 렌더도 생기지 않는다.
  const activeListFilter = listFilterOptions.includes(listFilterValue)
    ? listFilterValue
    : "";

  const filteredRows = useMemo(() => {
    // 서버 페이지네이션 탭의 rows는 이미 "검색어가 적용된 현재 페이지 10행"이다.
    // 여기서 클라이언트 필터를 또 걸면 그 10행 안에서 한 번 더 걸러진다.
    if (config.serverPaginate) return rows;

    const key = config.listFilter?.key;
    const listFiltered =
      key && activeListFilter
        ? rows.filter(
            (row) => String(row[key] ?? "").trim() === activeListFilter,
          )
        : rows;

    const now = new Date();
    const base =
      config.knowledgeReview && reviewStaleOnly
        ? listFiltered.filter((row) =>
            isStaleReview(row.last_reviewed_at, now, reviewStaleMonths),
          )
        : listFiltered;

    const q = keyword.trim().toLowerCase();
    if (!q) return base;
    return base.filter((row) => searchable(row).includes(q));
  }, [
    rows,
    keyword,
    config.serverPaginate,
    config.listFilter?.key,
    activeListFilter,
    config.knowledgeReview,
    reviewStaleOnly,
    reviewStaleMonths,
  ]);

  // "이 조합의 컷 만들기"(§4-3-C-4) 전용 — 다른 섹션으로 이동하면서 그 섹션의
  // 등록 폼을 프리필값과 함께 바로 연다. 일반 changeTab과 분리한 이유: 프리필값은
  // location.state로 실어야 목적지 인스턴스(마운트 시점)가 읽을 수 있다 — 지금
  // 인스턴스의 setState는 이동과 동시에 버려진다.
  function navigateWithPrefill(
    key: string,
    prefillCreateDefaults: Record<string, unknown>,
  ) {
    navigate(sectionPath(key, "new"), { state: { prefillCreateDefaults } });
  }

  // 검색어 디바운스. 확정되는 순간 주소의 q 에 쓰고 1페이지로 되돌린다. 5페이지를 보다 검색하면
  // 결과가 5페이지에 못 미쳐 빈 목록이 뜬다. 한 번의 주소 갱신이라 조회도 1회다.
  // 타이핑마다 히스토리를 쌓지 않으려고 replace 로 쓴다.
  const writtenQ = useRef(listState.q);
  // biome-ignore lint/correctness/useExhaustiveDependencies: patchList 는 렌더마다 새로 만들어지지만 타이머가 부르는 시점의 것이면 충분하다.
  useEffect(() => {
    const term = keyword.trim();
    if (!isList || term === searchTerm) return undefined;
    const timer = setTimeout(() => {
      writtenQ.current = term;
      patchList({ q: term, page: 1 }, true);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [keyword, searchTerm, isList]);
  // 뒤로가기 등 우리가 쓰지 않은 주소 변경으로 q 가 바뀌면 입력창을 맞춘다.
  useEffect(() => {
    if (searchTerm === writtenQ.current) return;
    writtenQ.current = searchTerm;
    setKeyword(searchTerm);
  }, [searchTerm]);

  // 수정 주소의 행을 못 받으면(없는 id 404 포함) 안내하고 목록으로 되돌린다.
  const rowError = rowQuery.error;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 오류가 생긴 순간 한 번만 안내하고 돌아간다.
  useEffect(() => {
    if (!rowError) return;
    if (rowError instanceof ApiError && rowError.status === 404) {
      toastWarning(
        "찾을 수 없는 항목입니다.",
        "이미 삭제됐거나 없는 주소예요.",
      );
    } else {
      reportAdminError(`${config.title} 조회 실패`, rowError);
    }
    navigate(listPath, { replace: true });
  }, [rowError]);

  // 저장을 마친 등록, 수정 화면은 이탈 확인을 거치지 않고 목록으로 돌아간다. dirty 가 꺼진 렌더 뒤에 옮겨야
  // 가드가 막지 않는다(자식인 가드 effect 가 부모 effect 보다 먼저 돈다).
  useEffect(() => {
    if (!leaving) return;
    navigate(listPath, { replace: true });
    setLeaving(false);
    setFormDirty(false);
  }, [leaving, listPath, navigate]);

  // 조회 실패는 목록을 비우고 안내만 한 번 띄운다.
  const listError = listQuery.error;
  useEffect(() => {
    if (listError) reportAdminError(`${config.title} 조회 실패`, listError);
  }, [listError, config.title]);

  // 삭제 등으로 총 건수가 줄어 현재 페이지가 범위를 벗어나면 마지막 페이지로 당긴다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: patchList 는 렌더마다 새로 만들어지지만 부르는 시점의 것이면 충분하다
  useEffect(() => {
    if (!config.serverPaginate || totalCount === 0) return;
    const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page > lastPage) patchList({ page: lastPage }, true);
  }, [config.serverPaginate, totalCount, page]);

  // uploadImage는 컴포넌트 상태에 의존하지 않는 순수 함수라 모듈 스코프로 뺐다 — PremiumBookAdmin의
  // 제네릭 개별 페이지 편집(AdminForm onUpload)에서도 그대로 재사용한다. 정의는 파일 하단, Admin() 선언
  // 직전 참고.

  // 등록, 수정 화면으로 갈 때 목록의 검색값을 실어 보내 돌아올 때 그대로 되살린다.
  // 목록의 [등록] 버튼은 프리필 없이 백지에서 시작한다.
  function createRow() {
    navigate(sectionPath(activeKey, "new"), {
      state: { listSearch: location.search },
    });
  }

  function editRow(row) {
    navigate(sectionPath(activeKey, { id: row.id }), {
      state: { listSearch: location.search },
    });
  }

  // 목록 셀 [수정] → **목록을 그대로 둔 채** 그 섹션의 편집 다이얼로그만 연다.
  // mode는 'list'를 유지한다 — AdminTable이 언마운트되지 않고, 아래 목록 분기가
  // pendingSection을 보고 엔진 전용 AdminForm(origin='list', 모달만 렌더)을
  // 오버레이로 함께 마운트한다. 저장 경로는 editRow와 동일(같은 saveRow).
  // 예전엔 setMode('edit')로 폼 화면 전체를 마운트하고 그 위에 모달을 얹었는데,
  // 반투명 백드롭 뒤로 사용자가 본 적 없는 폼 UI가 비쳐 보였다.
  function openRowSection(row, sectionKey) {
    setEditingRow(row);
    setPendingSection(sectionKey);
  }

  async function saveRow(form) {
    // QA A13(2026-08-27): config.confirmBeforeSave 가 있는 섹션은 저장 직전 한 번 더 묻는다.
    if (
      config.confirmBeforeSave &&
      !(await confirmAdmin({
        title: config.confirmBeforeSave,
        confirmLabel: "저장",
      }))
    ) {
      return;
    }

    const payload = config.formToPayload
      ? config.formToPayload(form)
      : { ...form };

    if (
      config.fixedCategories &&
      !config.fixedCategories.includes(payload.category)
    ) {
      toastWarning("수시 또는 정시 구분을 선택해 주세요.");
      return;
    }

    if (config.fixedValues) {
      Object.assign(payload, config.fixedValues);
    }

    if (activeKey === "banners") {
      delete payload.category;
      payload.subtitle = null;
    }

    delete payload.created_at;
    delete payload.updated_at;

    // 목록을 조인 뷰에서 읽는 섹션(config.listTable)은 폼이 그 뷰의 행을 그대로
    // 받는다. 뷰에만 있는 파생 컬럼을 그대로 저장하면 원본 테이블에 없는 컬럼이라
    // 42703 으로 죽는다 — 쓰기 직전에 걷어낸다 (QA 272).
    for (const column of config.listOnlyColumns || []) {
      delete payload[column];
    }
    // 조회수는 원칙적으로 공개면에서만 증가한다. payload는 수정 화면을 열 때의 row
    // 스냅샷이라, 그대로 저장하면 화면을 열어둔 사이 늘어난 조회수가 옛 값으로 덮여
    // 롤백된다 — 그래서 기본은 항상 제거한다. 단, config.fields에 view_count가 있는
    // 표(notices/companyNews/galleries "조회수 조정")는 어드민이 그 필드를 통해 값을
    // 명시적으로 편집한 것이므로 강제 조정 의도를 그대로 반영한다.
    const viewCountEditable = config.fields?.some(
      (field) => field.key === "view_count",
    );
    if (!viewCountEditable) {
      delete payload.view_count;
    }

    if (
      Array.isArray(payload.image_urls) &&
      payload.image_urls.length > 0 &&
      !payload.image_url
    ) {
      payload.image_url = payload.image_urls[0];
    }

    if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
      const firstFile = payload.attachments[0];
      if (!payload.file_url) payload.file_url = firstFile.url;
      if (!payload.file_name) payload.file_name = firstFile.name;
    }

    if (activeKey === "winningDbInputs") {
      try {
        payload.parsed_data = payload.raw_data
          ? JSON.parse(payload.raw_data)
          : null;
      } catch {
        payload.parsed_data = null;
      }
    }

    // id 는 경로로 보낸다. 값에 실으면 서버가 거부한다.
    delete payload.id;

    // 등록, 수정은 서버가 처리한다. sort_order 를 지정한 저장이 이미 쓰는 행들을 +1씩 미는
    // 재배열(QA 행337)도 서버 몫이라 여기서는 값만 보낸다.
    // 등록인지 수정인지는 주소가 정한다. 수정 대상은 /:id 로 받은 행, 또는 목록 셀 [수정]
    // 다이얼로그가 들고 있는 행이다(둘 다 비어 있으면 이 분기에 올 수 없다).
    const creating = view.kind === "new";
    let savedRow: AdminRow;
    try {
      savedRow = creating
        ? await createSectionRow(activeKey, payload)
        : await updateSectionRow(
            activeKey,
            (view.kind === "edit" ? editTarget : editingRow)!.id,
            payload,
          );
    } catch (error) {
      reportAdminError(
        creating ? "등록 실패" : "수정 실패",
        error as Error,
        buildFieldLabels(config),
      );
      return;
    }

    if (shouldRequestWinningEmbedding(config, savedRow)) {
      embedMutation.mutate(savedRow);
    }

    toastSuccess(
      "저장 완료",
      shouldRequestWinningEmbedding(config, savedRow)
        ? "임베딩은 자동 생성 중입니다."
        : undefined,
    );
    // 목록 위 다이얼로그는 닫기만 하고, 등록, 수정 화면은 목록으로 돌아간다.
    if (isList) {
      setEditingRow(null);
      setPendingSection(null);
    } else {
      setLeaving(true);
    }
    setMutationSeq((seq) => seq + 1);
    await loadRows();
  }

  // 지식 DB 행 버튼 "검토 완료". last_reviewed_at 한 컬럼만 고치므로 임베딩은 다시 만들지
  // 않는다. 쓰기 권한은 기존 is_admin 정책(winning_assessment_knowledge_admin_all)이다.
  async function markReviewed(row: { id?: unknown }) {
    if (typeof row.id !== "string") return;
    // AdminTable 에 disabled 속성이 없어 진행 중 중복 클릭은 여기서 막는다.
    if (reviewMutation.isPending) return;
    try {
      await reviewMutation.mutateAsync(row.id);
    } catch (error) {
      reportAdminError("검토 완료 표시 실패", error as Error);
      return;
    }

    setMutationSeq((seq) => seq + 1);
    await loadRows();
  }

  async function deleteRow(row) {
    if (
      !(await confirmAdmin({
        title: "정말 삭제하시겠습니까?",
        confirmLabel: "삭제",
        destructive: true,
      }))
    ) {
      return;
    }

    if (deleteMutation.isPending) return;
    try {
      await deleteMutation.mutateAsync(row.id);
    } catch (error) {
      reportAdminError("삭제 실패", error as Error, buildFieldLabels(config));
      return;
    }

    // 고아 방지 스펙 3: row가 참조하던 banners 이미지(image/multiImage/multiFile)를
    // 함께 지운다. blockEditor 본문 이미지는 collectBannerPaths가 애초에 보지
    // 않는다(주간 GC 몫). best-effort라 실패해도 행 삭제 자체는 이미 끝난 뒤다.
    const referencedPaths = collectBannerPaths(
      row,
      config.fields || config.columns,
    );
    if (referencedPaths.size > 0)
      removeSectionFiles(activeKey, referencedPaths);

    setMutationSeq((seq) => seq + 1);
    await loadRows();
  }

  // refundRequests 탭 전용 — '환불완료'는 fn_complete_refund RPC 직접 호출이
  // 아니라 api/complete-refund 서버 라우트를 거친다(2026-08-22, 환불 갭 해결
  // 확정 설계). 그 라우트가 토스 결제취소(카드 부분취소·가상계좌/계좌이체
  // 취소)를 먼저 실행하고, **성공했을 때만** fn_complete_refund 를 호출한다 —
  // 예전처럼 RPC를 바로 부르면 DB 상태만 완료로 바뀌고 실제로는 아무도
  // 돈을 돌려주지 않은 채 남는다(qa-payment 환불 흐름 점검 보고).
  // (제네릭 PATCH 로는 completed 로 못 가게 status select 에서 이미 뺐다, ①).
  async function completeRefund(row) {
    if (
      !(await confirmAdmin({
        title: "환불을 완료 처리하시겠습니까?",
        confirmLabel: "완료 처리",
        destructive: true,
      }))
    ) {
      return;
    }

    // 같은 버튼을 연달아 눌러도 토스 취소 요청이 겹치지 않게 한다.
    if (refundMutation.isPending) return;
    try {
      await refundMutation.mutateAsync(row.id);
    } catch (error) {
      // 토스 에러 메시지를 그대로 보여준다(팀 리드 지시) — reportAdminError의
      // WC 코드 매핑을 거치면 "요청을 처리하지 못했습니다"류 일반 문구로
      // 뭉개져 카드사·계좌 거부 사유(예: 이미 취소된 결제, 잔액 부족)가
      // 안 보인다. 여기는 admin 전용 화면이라 원문 노출 위험이 낮다.
      console.error("환불 완료 처리 실패:", error);
      alert(
        `환불 완료 처리 실패: ${error instanceof ApiError ? error.detail : (error as Error).message}`,
      );
      return;
    }

    toastSuccess("환불 완료 처리되었습니다.");
    await loadRows();
  }

  // AdmissionMetaEditModal 저장 경로. saveRow와 같은 변환(config.rowToForm/
  // formToPayload)·같은 table·같은 supabase update를 그대로 타되, saveRow가
  // 의존하는 editingRow/mode 상태는 건드리지 않는다(목록은 계속 'list'
  // 모드다) — 그래서 saveRow를 직접 호출하지 않고 같은 변환만 재사용한다.
  //
  // *_json/*_html을 건드리지 않는 이유: rowToForm(row)이 이미 그 컬럼들을
  // row 원본 값 그대로 채우고, metaForm(9필드)은 그 키들을 포함하지 않으므로
  // merged[jsonKey] === row[jsonKey]다. formToPayload는 그 값이 그대로면
  // 동일한 값을 다시 실어 보내거나(변경 없음), null/무효면 payload에서
  // 아예 delete한다(컬럼을 건드리지 않음) — 어느 경우에도 카테고리 콘텐츠는
  // 달라지지 않는다.
  async function saveAdmissionMeta(row, metaForm) {
    const merged = {
      ...(config.rowToForm ? config.rowToForm(row) : row),
      ...metaForm,
    };
    const payload = config.formToPayload
      ? config.formToPayload(merged)
      : merged;
    delete payload.created_at;
    delete payload.updated_at;

    if (metaMutation.isPending) return false;
    try {
      await metaMutation.mutateAsync({ id: row.id, values: payload });
    } catch (error) {
      reportAdminError("수정 실패", error as Error, buildFieldLabels(config));
      return false;
    }

    toastSuccess("저장 완료");
    setMetaEditRow(null);
    await loadRows();
    return true;
  }

  // 개인정보 반출 게이트 (QA 223·268·270·271). config.sensitiveDownload 인 섹션은
  // [엑셀 다운로드]가 곧장 내려받지 않고 비밀번호 재확인 + 사유 기재를 먼저 태운다.
  // 게이트는 로그를 남긴 뒤에야 onGranted 를 부르므로, 적재 실패 시 파일은 나가지 않는다.
  function handleDownloadClick() {
    if (!config.sensitiveDownload) {
      void downloadExcel();
      return;
    }

    const rowCount = config.serverPaginate ? totalCount : filteredRows.length;

    // 내보낼 행이 없으면 비밀번호와 사유를 받기 전에 알리고 게이트를 열지 않는다.
    if (rowCount === 0) {
      toastWarning("내보낼 데이터가 없습니다.");
      return;
    }

    requestAccess({
      action: "download",
      resourceKey: activeKey,
      title: `${config.title} 다운로드`,
      description: `${rowCount.toLocaleString()}건의 개인정보가 CSV 파일로 저장됩니다. 건수가 많으면 수십 초 걸릴 수 있습니다.`,
      rowCount,
      onGranted: downloadExcel,
    });
  }

  async function downloadExcel() {
    const filename = `${config.title}_${ymdIn(new Date(), browserTimeZone())}.csv`;

    // 전량 로드 탭은 화면 rows가 곧 전체다 — 기존 경로 그대로.
    if (!config.serverPaginate) {
      downloadCsv(filename, filteredRows, config.columns);
      return;
    }

    // 서버 페이지네이션 탭은 rows가 현재 페이지 10행뿐이라 그대로 쓰면 10행짜리
    // 파일이 나온다. 목록과 같은 조건으로 서버에서 청크 단위로
    // 끊어 받아, 청크마다 CSV 줄로 접어 모은다 — 43k행 행 객체를 한꺼번에 메모리에
    // 쌓지 않고, await 사이마다 진행률이 화면에 갱신된다.
    if (exporting) return;

    if (totalCount === 0) {
      toastWarning("내보낼 데이터가 없습니다.");
      return;
    }

    setExporting({ done: 0, total: totalCount });
    // 민감 다운로드는 게이트 설명이 같은 안내를 하므로, 게이트가 없는 경로만 알린다.
    const noteId = config.sensitiveDownload
      ? null
      : toastProgress(
          `${totalCount.toLocaleString()}건을 내려받는 중입니다. 건수가 많으면 수십 초 걸릴 수 있으니 이 화면을 벗어나지 마세요.`,
        );
    const closeNote = () => {
      if (noteId) toast.close(noteId);
    };

    const parts: string[] = [];
    let done = 0;

    // 서버가 EXPORT_CHUNK행씩 끊어 주고 next 가 null 이면 끝이다. 목록과 같은 검색어를 보낸다.
    for (let from: number | null = 0; from !== null; ) {
      let chunk: Awaited<ReturnType<typeof fetchExportChunk>>;
      try {
        chunk = await fetchExportChunk(activeKey, from, searchTerm);
      } catch (error) {
        closeNote();
        setExporting(null);
        reportAdminError("CSV 내보내기 실패", error as Error);
        return;
      }

      // 빈 청크는 그 사이에 행이 지워졌다는 뜻 — 더 받아봐야 소용없다.
      if (chunk.items.length === 0) break;

      parts.push(csvBody(chunk.items, config.columns));
      done += chunk.items.length;
      setExporting({ done, total: totalCount });
      from = chunk.next;
    }

    closeNote();
    setExporting(null);
    downloadCsvText(filename, csvHeader(config.columns), parts.join("\n"));
  }

  // 사이드바/탑바는 AdminLayout(부모 라우트, <Outlet/> 을 감싸는 영속 셸)이 그린다 —
  // 여기서는 섹션 본문만 반환한다. AdminLayout의 배치(ml-[224px] pt-[56px] 등)는
  // 예전에 이 컴포넌트의 <main>/바깥 div가 지던 책임을 그대로 넘겨받았다.
  return (
    <>
      {gate}

      {config.custom ? (
        // custom: true 인 config 는 전부 customComponentKey를 지정한다(coupons /
        // premiumBookPages / mentorApplications / learningDiagnosis / goalStudents) —
        // 실제 컴포넌트는 CUSTOM_COMPONENT_REGISTRY[key]로 조회한다(렌더 결과·동작은
        // 과거 config.CustomComponent 직접 참조와 동일, 조회 방식만 간접화됐다).
        //
        // 🔴 공용 변경 (e) — 명세 §4-1-3 의 (a)~(d) 에 없던 5번째 항목이다.
        //   왜 필요한가: 토대 단계가 pendingCreateDefaults state 를 만들었지만
        //   **공급자가 생길 통로가 없었다.** 그 유일한 공급자는 학생 상세의
        //   "이 조합의 컷 만들기"(명세 §4-3-C-4)인데, 그 화면은 customComponentKey 로
        //   렌더되고 이 줄이 props 를 하나도 넘기지 않았다. 그래서 버튼을 눌러도
        //   탭을 옮기거나 폼을 열 수단이 없다.
        //   기존 소비처 무영향 근거: onNavigateWithPrefill을 실제로 쓰는 컴포넌트는
        //   goalStudents뿐이고 나머지(coupons / premiumBookPages /
        //   mentorApplications / learningDiagnosis)는 인자를 받지 않는 함수 선언이라
        //   여분의 props를 그냥 무시한다.
        //
        // config={config}: PremiumBookAdmin/MentorApplicationsAdmin/GoalStudentsAdmin이
        // 별도 파일로 분리되며 CONFIGS.<ownKey> 대신 이 prop을 읽는다(3단계) — activeKey가
        // 곧 그 config의 키이므로 CONFIGS[activeKey]와 항상 같은 값이다. coupons/
        // learningDiagnosis는 이 prop을 읽지 않고 그냥 무시한다.
        (() => {
          const CustomComponent =
            CUSTOM_COMPONENT_REGISTRY[config.customComponentKey];
          return (
            <CustomComponent
              config={config}
              onNavigateWithPrefill={navigateWithPrefill}
            />
          );
        })()
      ) : view.kind === "list" ? (
        config.comingSoon ? (
          <div className="bg-white p-10 shadow-sm">
            <h1 className="text-2xl font-semibold text-foreground">
              {config.title}
            </h1>
            <p className="mt-3 text-sm font-bold text-gray-500">
              {config.description}
            </p>
            <div className="mt-6 rounded-sm border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-bold text-[#7A4A12]">
              이 메뉴는 추후 별도 Supabase 연결 후 활성화됩니다.
            </div>
          </div>
        ) : (
          <>
            {config.tabs && (
              <AdminConfigTabs tabs={config.tabs} activeKey={activeKey} />
            )}

            <div className="mb-6 bg-white px-6 py-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {!config.hideReset && (
                    <Button
                      variant="outline"
                      size="lg"
                      type="button"
                      onClick={loadRows}
                    >
                      <RefreshCw size={14} />
                      초기화
                    </Button>
                  )}

                  {(config.excel ||
                    ["members", "refunds"].includes(activeKey)) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={handleDownloadClick}
                      disabled={Boolean(exporting)}
                    >
                      <Download aria-hidden="true" />
                      {exporting
                        ? `내보내는 중 ${Math.floor((exporting.done / Math.max(1, exporting.total)) * 100)}%`
                        : "엑셀 다운로드"}
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {config.listFilter && listFilterOptions.length > 0 && (
                    <NativeSelect
                      value={activeListFilter}
                      aria-label={config.listFilter.allLabel}
                      onChange={(e) => {
                        patchList({ filter: e.target.value, page: 1 });
                      }}
                      className="[&>select]:h-9 [&>select]:font-medium"
                    >
                      <option value="">{config.listFilter.allLabel}</option>
                      {listFilterOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </NativeSelect>
                  )}

                  {config.knowledgeReview && (
                    <>
                      <label className="inline-flex h-9 items-center gap-2 text-sm font-bold whitespace-nowrap">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={reviewStaleOnly}
                          onChange={(e) => {
                            patchList({ stale: e.target.checked, page: 1 });
                          }}
                        />
                        미검토만 보기
                      </label>
                      <NativeSelect
                        value={reviewStaleMonths}
                        onChange={(e) => {
                          patchList({
                            months: Number(e.target.value) as ReviewStaleMonths,
                            page: 1,
                          });
                        }}
                        aria-label="미검토 기준 개월 수"
                        className="[&>select]:h-9 [&>select]:font-medium"
                      >
                        {REVIEW_STALE_MONTH_OPTIONS.map((months) => (
                          <option key={months} value={months}>
                            {months}개월 이전
                          </option>
                        ))}
                      </NativeSelect>
                    </>
                  )}

                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={config.searchPlaceholder}
                    aria-label={config.searchPlaceholder || "검색"}
                    className="h-9 w-80 font-medium"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold">{config.title}</h1>
                  {config.homepage && (
                    <div className="mt-1 space-y-1">
                      <p className="text-sm font-bold text-red-500">
                        이 메뉴에서 저장한 내용은 실제 홈페이지에 반영됩니다.
                      </p>

                      {config.guideText && (
                        <p className="whitespace-pre-line text-sm font-semibold leading-6 text-red-600">
                          {config.guideText}
                        </p>
                      )}
                    </div>
                  )}
                  {config.retentionNotice && (
                    <p className="mt-1 text-xs font-bold text-gray-500">
                      {config.retentionNotice}
                    </p>
                  )}
                </div>

                {!config.noCreate && !config.readOnly && (
                  <Button
                    size="lg"
                    className="shrink-0 whitespace-nowrap"
                    type="button"
                    onClick={createRow}
                  >
                    <Plus size={14} />
                    등록
                  </Button>
                )}
              </div>

              {/* rowCapWarning은 "전량 로드가 1,000행 상한에 잘렸다"는 경고라
                      config.serverPaginate 탭에는 선언하지 않는다 — 그쪽은 .range()로
                      PAGE_SIZE행만 받고 전체 건수를 count로 따로 받으므로 상한 자체에
                      닿지 않는다. */}
              {config.rowCapWarning && rows.length >= 1000 && (
                <p className="mt-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-600">
                  조회된 건수가 1,000건에 도달했습니다 — Supabase 기본 조회
                  상한으로 오래된 신청 건이 목록에서 빠졌을 수 있습니다. 전체
                  건수가 아닙니다.
                </p>
              )}

              {exporting && (
                <p className="mt-4 rounded-sm border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold leading-6 text-primary">
                  CSV 내보내는 중 — {exporting.done.toLocaleString()} /{" "}
                  {exporting.total.toLocaleString()}건. 완료될 때까지 이 화면을
                  닫지 마세요.
                </p>
              )}
            </div>

            <MoneySummary activeKey={activeKey} rows={filteredRows} />
            {/* mutationSeq: 목록 CRUD 성공 시에만 올라가는 카운터. 자기 집계를
                    따로 던지는 ListSummary(현재 GoalCutsListSummary 하나)가 이 값을
                    보고 다시 읽는다. 이 prop을 받지 않는 기존 3개
                    (AcceptanceRateSummary / AdmissionListSummary /
                    AdmissionResultsListSummary)는 전부 props를 구조분해로 받으므로
                    추가 prop을 그냥 무시한다 — 회귀 없음. */}
            {ListSummaryComponent && (
              <ListSummaryComponent
                rows={rows}
                onReload={loadRows}
                mutationSeq={mutationSeq}
              />
            )}

            {config.knowledgeBulk && (
              <BulkPanel config={config} rows={rows} onReload={loadRows} />
            )}

            {config.knowledgeSearchPreview && <SearchPreview config={config} />}

            {loading ? (
              <div
                role="status"
                className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm"
              >
                데이터를 불러오는 중입니다.
              </div>
            ) : (
              <AdminTable
                config={config}
                rows={filteredRows}
                page={page}
                setPage={setPage}
                totalCount={totalCount}
                onEdit={editRow}
                onDelete={deleteRow}
                activeKey={activeKey}
                onCompleteRefund={completeRefund}
                onOpenSection={openRowSection}
                onOpenMetaEdit={setMetaEditRow}
                onMarkReviewed={markReviewed}
              />
            )}

            {metaEditRow && (
              <AdmissionMetaEditModal
                row={metaEditRow}
                onClose={() => setMetaEditRow(null)}
                onSave={(form) => saveAdmissionMeta(metaEditRow, form)}
              />
            )}

            {/* 목록 셀 [수정](openRowSection) → 섹션 편집 모달. AdminForm은
                origin='list'에서 화면 JSX 없이 상태·저장 엔진 + 모달만 렌더
                하므로(AdminEngine의 조기 반환), 목록 위에 다이얼로그만 뜬다.
                mode는 'list' 그대로 — saveRow의 update 분기는 mode !== 'create'
                조건이라 editingRow.id로 정상 저장된다. */}
            {pendingSection && editingRow && (
              <AdminForm
                config={config}
                mode="list"
                row={editingRow}
                origin="list"
                initialSection={pendingSection}
                onCancel={() => {
                  setEditingRow(null);
                  setPendingSection(null);
                }}
                onSave={saveRow}
                onUpload={(files, field) =>
                  uploadSectionFiles(activeKey, files, field)
                }
                onRemoveFiles={(paths) => removeSectionFiles(activeKey, paths)}
              />
            )}
          </>
        )
      ) : view.kind === "edit" && !editTarget ? (
        <div
          role="status"
          className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm"
        >
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <>
          <UnsavedGuard dirty={formDirty && !leaving} />
          <AdminForm
            key={view.kind === "edit" ? view.id : "new"}
            config={config}
            mode={view.kind === "new" ? "create" : "edit"}
            row={editTarget}
            // 등록, 수정 화면은 pendingSection이 없다. 목록 [수정] 직행(openRowSection)은
            // 목록 분기의 오버레이 AdminForm으로 렌더된다.
            origin="form"
            initialSection={null}
            createDefaults={prefill}
            // 이탈 확인은 UnsavedGuard(useBlocker, beforeunload)가 맡는다.
            onDirtyChange={setFormDirty}
            onCancel={() => navigate(listPath, { replace: true })}
            onSave={saveRow}
            onUpload={(files, field) =>
              uploadSectionFiles(activeKey, files, field)
            }
            onRemoveFiles={(paths) => removeSectionFiles(activeKey, paths)}
          />
        </>
      )}
    </>
  );
}

// /admin의 영속 셸 — 사이드바(AdminSidebar) + 탑바(AdminTopbar) + 섹션 본문(Outlet).
// App.jsx가 /admin 부모 라우트의 element로 이 컴포넌트를 쓰고, 그 아래 자식
// 라우트로 ADMIN_SECTION_KEYS(adminSectionKeys.ts) 각각을 개별 <Route path={key}
// element={<AdminSectionRoute section={key} />} />로 매핑한다 — 섹션이 바뀔 때
// Outlet 안쪽(AdminSectionRoute)만 새로 마운트되고, 이 셸(사이드바 펼침 상태
// 등)은 그대로 유지된다.
export function AdminLayout() {
  const location = useLocation();
  // 사이드바 하이라이트용 activeKey — 라우팅 매칭(어느 config를 쓸지 결정하는 것)에는
  // 관여하지 않는다. 그건 App.jsx의 개별 <Route path={key}> 매칭이 이미 끝낸 일이고,
  // 여기서는 그 결과인 URL을 보고 "지금 어느 메뉴가 눌려 있어 보여야 하는가"만 고른다.
  // 하위 경로(tenants/123, coupons/c1/edit)에서도 첫 구간이 메뉴 키다.
  const activeKey =
    location.pathname.replace(/^\/admin\/?/, "").split("/")[0] ||
    ADMIN_DEFAULT_SECTION_KEY;

  async function logout() {
    // 공용 PC에 학습진단 초안(성적, 목표 학교)이 남지 않게 함께 지운다.
    clearAllDrafts();
    await supabase.auth.signOut();
    window.location.replace("/");
  }

  return (
    <Toaster limit={5}>
      {/* 어드민은 데스크톱 전용이라 사이드바는 접히지 않는다(collapsible="none").
          open 을 true 로 고정하고 onOpenChange 를 비워, SidebarProvider 의 Cmd/Ctrl+B
          단축키가 눌려도 상태가 바뀌지 않는다. 다만 Cmd/Ctrl+B 는 아무도 읽지 않는
          sidebar_state=false 쿠키를 쓰고, 프로바이더가 어드민에서 브라우저 자체의
          Ctrl+B 를 막는다. */}
      <SidebarProvider
        open
        onOpenChange={() => {}}
        style={{ "--sidebar-width": "14rem" } as CSSProperties}
        className="block min-h-screen bg-[#f4f4f4] text-[#111827]"
      >
        <AdminSidebar activeKey={activeKey} />
        <AdminTopbar onLogout={logout} />

        <main className="ml-56 pt-14">
          <div className="min-h-[calc(100vh-3.5rem)] px-7 py-8">
            <Outlet />
          </div>
        </main>
      </SidebarProvider>
      <ConfirmAdminHost />
    </Toaster>
  );
}
