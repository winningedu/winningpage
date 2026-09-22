import { ChevronDown, Download, Plus, RefreshCw, Search } from "lucide-react";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import * as XLSX from "xlsx";
import AdminMembersAdmin from "@/components/admin/AdminMembersAdmin";
import AdminRolesAdmin from "@/components/admin/AdminRolesAdmin";
// 쿠폰관리는 제네릭 CRUD 로 표현되지 않는다(파생 사용 건수 · NULL=무제한 3상태
// 입력 · slug 사전중복검사 · 사용이력 드릴다운 + void RPC). config.custom +
// customComponentKey(CUSTOM_COMPONENT_REGISTRY 조회)로 붙인다 — premiumBookPages 선례와 같은 방식이다.
// Admin.jsx 가 5,700줄이라 컴포넌트 본체는 별도 파일에 둔다(이 파일이 그 파일을
// import 하므로 역방향 import 는 만들지 않는다 — 순환 참조 방지).
import CouponAdmin from "@/components/admin/CouponAdmin";
import GoalStudentsAdmin from "@/components/admin/GoalStudentsAdmin";
import LearningDiagnosisAdmin from "@/components/admin/LearningDiagnosisAdmin";
import MembersAdmin from "@/components/admin/MembersAdmin";
import MentorApplicationsAdmin from "@/components/admin/MentorApplicationsAdmin";
import PremiumBookAdmin from "@/components/admin/PremiumBookAdmin";
import RevenueAdmin from "@/components/admin/RevenueAdmin";
import { useSensitiveActionGate } from "@/components/admin/SensitiveActionGate";
import TenantsAdmin from "@/components/admin/TenantsAdmin";
import AdmissionMetaEditModal from "@/components/admission/editor/AdmissionMetaEditModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  canAccessSection,
  fetchAdminPermissions,
  fetchIsSuperAdmin,
} from "@/lib/adminPermissions";
import {
  exportAdmissionRowsToXlsx,
  parseAdmissionRowsFromXlsx,
} from "@/lib/admissionBulkXlsx";
import { HWP_SECTION_JSON_KEYS } from "@/lib/admissionDoc";
import {
  ADMISSION_RESULTS_BULK_XLSX_COLUMNS,
  exportAdmissionResultRowsToXlsx,
  parseAdmissionResultRowsFromXlsx,
} from "@/lib/admissionResultsBulkXlsx";
import {
  getAdmissionActiveYear,
  setAdmissionActiveYear,
} from "@/lib/admissionSettings";
import {
  computeGoalCutBackfill,
  fetchBackfillSourceRows,
  GOAL_BACKFILL_YEAR_MODES,
  type GoalBackfillYearMode,
  type GoalCutBackfillPayload,
  type GoalCutBackfillStats,
  goalCutConflictKey,
} from "@/lib/goal/goalCutBackfill";
import { withDedupedKeys } from "@/lib/reactKeys";
import { supabase } from "@/lib/supabase";
import type { TablesInsert } from "@/types/database.types";
import {
  ADMIN_DEFAULT_SECTION_KEY,
  ADMIN_SECTION_KEYS,
  type AdminSectionKey,
} from "./admin/adminSectionKeys";
import { adminSettingsConfigs } from "./admin/configs/adminSettings";
import { admissionConfigs } from "./admin/configs/admission";
import { boardConfigs } from "./admin/configs/board";
import { goalConfigs } from "./admin/configs/goal";
import {
  exportGoalUniversityCutRowsToXlsx,
  parseGoalUniversityCutRowsFromXlsx,
} from "./admin/configs/goalUniversityCutsBulkXlsx";
import { mainConfigs } from "./admin/configs/main";
import { memberConfigs } from "./admin/configs/member";
import { programConfigs } from "./admin/configs/program";
import { revenueConfigs } from "./admin/configs/revenue";
import { winningConfigs } from "./admin/configs/winning";
import {
  AdminForm,
  type AdminRow,
  AdminTable,
  collectBannerPaths,
  PAGE_SIZE,
  removeBannerPaths,
  uploadImage,
} from "./admin/shared/AdminEngine";
import { AdminTopbar } from "./admin/shared/AdminTopbar";
import { buildFieldLabels, reportAdminError } from "./admin/shared/adminErrors";
import { getFreshSupabaseAccessTokenOrSignOut } from "./admin/shared/adminSession";
import {
  csvBody,
  csvHeader,
  downloadCsv,
  downloadCsvText,
  searchable,
} from "./admin/shared/csvExport";

// CSV 청크 내보내기 1회 요청 크기. PostgREST 기본 응답 상한이 1,000행이라 이보다
// 크게 잡아도 잘려 나온다 — 43k행이면 44회 왕복이다.
const EXPORT_CHUNK = 1000;
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
  //
  // 일일 입장·이용 현황은 "누가 언제 들어와서 무엇을 썼나"를 보는 화면이라
  // 서비스 운영이 아니라 **회원**에 붙는다(사용자 확정 2026-08-23). 원래는
  // 서비스 관리 > 이용 현황에 있었다.
  {
    title: "회원관리",
    items: [
      // 소속(테넌트) 마스터가 회원 데이터의 상위 개념이라 회원 목록 앞에 둔다
      // (admin_resources sort_order 305 < members, 20260922002929).
      { key: "tenants", label: "소속(테넌트) 관리" },
      { key: "members", label: "회원 목록" },
      { key: "dailyEntries", label: "일일 입장", section: "이용 현황" },
      { key: "usageStatus", label: "이용 현황", section: "이용 현황" },
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
  ...programConfigs,
  ...winningConfigs,
  ...revenueConfigs,
  ...goalConfigs,
  ...adminSettingsConfigs,
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
  revenue: RevenueAdmin,
  tenants: TenantsAdmin,
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

// 임베딩 진입점은 자기 저장소의 상대 경로 하나뿐이다. 예전에는
// VITE_RAG_API_BASE_URL이 있으면 브라우저가 외부 도메인의 /api/admin-embeddings를
// 직접 쳤는데, 그 경로는 CORS·이중 인증(x-admin-secret)을 끌고 다니는 데다
// 외부 앱 자체가 폐기 대상이라 없앴다.
const WINNING_EMBED_ENDPOINT = "/api/performance/admin-embed";

function shouldRequestWinningEmbedding(config, row) {
  if (config?.table !== "winning_assessment_knowledge_items") return false;
  return WINNING_RAG_KNOWLEDGE_TYPES.has(String(row?.knowledge_type || ""));
}

async function requestWinningEmbedding(row) {
  if (!row?.id) return null;

  try {
    const accessToken = await getFreshSupabaseAccessTokenOrSignOut();

    const response = await fetch(WINNING_EMBED_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: "embed-one",
        id: row.id,
      }),
    });

    const result = await response.json().catch(async () => {
      const text = await response.text().catch(() => "");
      return { detail: text || `HTTP ${response.status}` };
    });

    // admin-embed는 실패 사유를 항상 `detail`로 돌려준다(200 응답에는 detail이 없다).
    if (!response.ok) {
      const detail = result?.detail;

      if (response.status === 401) {
        await supabase.auth.signOut().catch(() => {});
        throw new Error(
          `${detail || "관리자 인증 실패"}: 로그아웃 후 다시 로그인하세요.`,
        );
      }

      throw new Error(detail || `HTTP ${response.status}`);
    }

    console.log("위닝 수행 DB 자동 임베딩 요청 완료:", result);
    return result;
  } catch (error) {
    console.error("위닝 수행 DB 자동 임베딩 요청 실패:", error);
    return null;
  }
}
function AdminSidebar({ activeKey, setActiveKey }) {
  const [open, setOpen] = useState(
    () => new Set(MENU_GROUPS.map((group) => group.title)),
  );

  // 권한이 있는 메뉴만 그린다 — 라우트 가드(requireAdminMiddleware)와 **같은 규칙**을
  // 쓴다(canAccessSection). 예전에는 MENU_GROUPS 를 무조건 전부 그려서, 「접근 불가」로
  // 설정한 메뉴가 그대로 보이고 눌러도 들어가졌다(2026-08-23).
  //
  // 빈 목록으로 시작한다 — 전부 그렸다가 지우면 권한 없는 메뉴가 한 번 번쩍인다.
  // 라우트 가드가 이미 같은 조회를 마친 뒤라(캐시 TTL 15초) 실제로는 즉시 채워진다.
  const [menuGroups, setMenuGroups] = useState<typeof MENU_GROUPS>([]);

  const loadMenuGroups = useEffectEvent(async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;

    const [permissions, isSuperAdmin] = await Promise.all([
      fetchAdminPermissions(userId),
      fetchIsSuperAdmin(userId),
    ]);

    setMenuGroups(
      MENU_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          canAccessSection(permissions, isSuperAdmin, item.key),
        ),
      })).filter((group) => group.items.length > 0),
    );
  });

  useEffect(() => {
    loadMenuGroups();
  }, []);
  // 자식 탭(acceptanceRates/admissionCaseLogos)에 있을 때도 사이드바에서는
  // 탭 목록의 첫 번째 key(admissionSusiJungsi)를 기준으로 활성 항목을 매칭한다.
  const sidebarActiveKey = CONFIGS[activeKey]?.tabs
    ? CONFIGS[activeKey].tabs[0].key
    : activeKey;

  function toggle(title) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[224px] bg-[#101214] text-white">
      <ScrollArea className="h-full">
        <div className="border-b border-white/10 px-5 py-5 text-2xl font-black">
          관리자
        </div>

        <nav className="px-4 py-5">
          {menuGroups.map((group) => {
            const isOpen = open.has(group.title);

            return (
              <div key={group.title} className="mb-4">
                <button
                  type="button"
                  onClick={() => toggle(group.title)}
                  className="flex w-full items-center justify-between py-2 text-left text-[15px] font-black"
                >
                  {group.title}
                  <ChevronDown
                    size={16}
                    className={`transition ${isOpen ? "rotate-0" : "-rotate-90"}`}
                  />
                </button>

                {isOpen && (
                  <div className="mt-1 space-y-1">
                    {group.items.map((item, index) => (
                      <Fragment key={item.key}>
                        {/* 소분류 캡션 — 기획표의 3단(대분류 > 소분류 > 세부메뉴)을
                          접었다 펴는 단계를 하나 더 두지 않고 캡션으로 표현한다.
                          「서비스 관리」가 16개로 가장 크고, 그 안에서 서비스·
                          프리미엄·멘토·위닝 DB가 섞이면 훑기 어렵다.
                          섹션이 바뀌는 첫 항목에서만 그린다. */}
                        {item.section &&
                          item.section !== group.items[index - 1]?.section && (
                            <div className="px-4 pb-1 pt-3 text-[11px] font-black tracking-wide text-white/35">
                              {item.section}
                            </div>
                          )}
                        <button
                          type="button"
                          onClick={() => setActiveKey(item.key)}
                          className={`block w-full rounded px-4 py-2 text-left text-[13px] font-bold ${
                            sidebarActiveKey === item.key
                              ? 'bg-white/10 text-white before:mr-2 before:text-red-500 before:content-["•"]'
                              : 'text-white/55 before:mr-2 before:text-white/35 before:content-["•"] hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}

// 대입모집요강 공개 노출 연도 표시·변경(admissionGuidelines의 ListSummary —
// AcceptanceRateSummary와 같은 확장점, 목록 페이지 헤더에서만 렌더된다.
// 상세 편집 폼(아코디언)과 완전히 다른 렌더 트리라 폼 무게(input 14개,
// 3,744px)에 영향이 없다 — 2026-08-06 사용자의 "어드민이 너무 무겁다"
// 지적 이후 이 제약을 지키기 위해 일부러 폼 밖에 둔 것.
//
// 드롭다운을 안 쓰고 숫자 입력 + 버튼을 쓴다 — 지금 admission_year가
// 2027 하나뿐이라(dev DB 실측) 선택지 1개짜리 select는 phase0가 공개
// 쪽에서 거부한 것과 같은 문제("없는 기능을 있는 것처럼 보이게 함")를
// admin에도 만든다. 숫자 입력은 연도 개수와 무관하게 항상 동작한다.
//
// ⚠ 자유 입력의 대가 — 데이터 없는 연도를 공개로 지정하면 공개
// 페이지가 통째로 빈 화면이 된다(team-lead 지적, 2026-08-06). 저장
// 직전에 그 연도의 행 수를 이 컴포넌트가 이미 들고 있는 rows(목록
// 조회가 이미 전체 행을 가져온다 — PAGE_SIZE는 화면 표시에만 쓰이는
// 클라이언트 슬라이스, loadRows의 select('*')엔 .range()가 없다.
// config.serverPaginate를 켠 탭만 예외로 서버에서 페이지 단위로 끊어
// 받는데, admissionGuidelines는 그 탭이 아니라 전제가 그대로 유효하다)에서
// 세어 0이면 확인을 받는다. 검증을 admissionSettings.js에 넣지
// 않은 이유는 그 함수가 설정 저장만 하는 게 책임이고, 리소스 테이블
// 행 수를 아는 건 호출부(이 파일)의 책임이라고 team-lead가 판단했기
// 때문이다.
//
// admissionGuidelines.ListSummary의 실제 진입점. 연도 표시·변경(기존
// AdmissionActiveYearSummary, 안 건드림)과 엑셀 일괄 왕복 패널(신규
// AdmissionBulkXlsxPanel)을 세로로 쌓아 렌더한다 — 한 줄에 몰아넣으면
// "연도 표시+입력+버튼+다운로드+업로드"가 뒤섞여 복잡해진다는 판단
// (설계 문서 §2). onReload는 AdminForm의 loadRows를 그대로 받아
// 엑셀 적용 후 목록을 재조회하는 데 쓴다.
function AdmissionListSummary({ rows, onReload }) {
  return (
    <>
      <AdmissionActiveYearSummary rows={rows} />
      <AdmissionBulkXlsxPanel rows={rows} onReload={onReload} />
    </>
  );
}

function AdmissionActiveYearSummary({ rows }) {
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [loadingActiveYear, setLoadingActiveYear] = useState(true);
  const [draftYear, setDraftYear] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAdmissionActiveYear(supabase).then((year) => {
      if (cancelled) return;
      setActiveYear(year);
      setDraftYear(String(year));
      setLoadingActiveYear(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeYearCount = activeYear
    ? (rows || []).filter((row) => Number(row.admission_year) === activeYear)
        .length
    : 0;

  async function handleChangeYear() {
    const year = Number(draftYear);
    // 4자리 상식선 제한 — 999999 같은 값이 통과하면 안 된다(team-lead 지적).
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      alert("연도는 2000~2100 사이 정수로 입력해 주세요.");
      return;
    }

    const matchCount = (rows || []).filter(
      (row) => Number(row.admission_year) === year,
    ).length;
    if (matchCount === 0) {
      const proceed = window.confirm(
        `${year}학년도 데이터가 0개교입니다. 이대로 공개 연도를 지정하면 공개 페이지의 대학별 모집요강이 통째로 빈 화면이 됩니다.\n\n그래도 지정하시겠습니까?`,
      );
      if (!proceed) return;
    }

    setSaving(true);
    const result = await setAdmissionActiveYear(supabase, year);
    if (!result.ok) {
      setSaving(false);
      alert(`공개 연도 저장 실패: ${result.error}`);
      return;
    }

    // 낙관적 표시 대신 실제 값을 재조회한다 — 이 값이 고객 노출을 좌우하므로
    // 저장이 실제로 반영됐는지(RLS 등으로 조용히 무시되지 않았는지) 확인한다.
    const confirmedYear = await getAdmissionActiveYear(supabase);
    setActiveYear(confirmedYear);
    setDraftYear(String(confirmedYear));
    setSaving(false);
    alert(`공개 연도를 ${confirmedYear}학년도로 변경했습니다.`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-white p-4 text-sm shadow-sm">
      <div className="font-black">
        {loadingActiveYear ? (
          "공개 연도 확인 중…"
        ) : (
          <>
            현재 공개 연도:{" "}
            <span className="text-blue-600">{activeYear}학년도</span>
            {" · "}
            {activeYearCount}개교
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={draftYear}
          onChange={(e) => setDraftYear(e.target.value)}
          min={2000}
          max={2100}
          disabled={loadingActiveYear || saving}
          className="h-9 w-24 border border-[#9ca3af] px-2 text-sm outline-hidden disabled:bg-gray-100"
          aria-label="새 공개 연도"
        />
        <button
          type="button"
          onClick={handleChangeYear}
          disabled={loadingActiveYear || saving}
          className="h-9 bg-[#2348ff] px-4 text-sm font-black text-white disabled:opacity-50"
        >
          {saving ? "저장 중…" : "변경"}
        </button>
      </div>
    </div>
  );
}

// 대입모집요강 218행 전체를 26컬럼 xlsx(src/lib/admissionBulkXlsx.js,
// 사용자가 준 모집요강.xlsx와 동일 포맷)로 일괄 왕복한다. 설계 문서
// (docs/admission-bulk-xlsx-ui-design.md, 커밋 대상 아님) §3의 흐름을
// 그대로 구현했다:
//   다운로드(항상 전체, 필터 무시) → 업로드(파일 선택만으로는 반영 안
//   됨) → 미리보기(신규/수정/거부/잘림보존/raw변경재생성 건수 +
//   errors 항상 펼침 + warnings 4그룹, 건수는 항상 보이고 목록만 접힘)
//   → "영향받는 N행을 확인했습니다" 체크박스로 게이트된 적용 → 재조회.
//
// warnings.type 계약(team-lead가 phase0와 확정, 최종 b0d05c0)을 그대로
// 쓴다 — reason 문자열은 파싱하지 않고 표시 전용으로만 쓴다. 4그룹
// 분류가 이 UI에서 제일 중요한 판단이다: rawChangedRegenerated는
// 이름이 다른 "보존형"과 비슷해 보이지만 실제로는 값이 바뀐다(표
// 구조가 단순해질 수 있음) — 나머지 보존형(truncated/regressionSkipped,
// "반영 안 됨")과 같은 그룹에 넣으면 관리자가 오해하므로 별도 그룹
// ("반영됐지만 품질 주의")으로 시각적으로 분리한다.
//
// 엑셀 포맷에서 html 3종이 빠지면서(26→23컬럼) "html 파싱 실패"라는
// 상태 자체가 없어졌다 — 이제 트리거는 raw 비교뿐이다: 업로드 raw가
// DB raw와 같으면 경고 자체가 안 생기고(raw가 안 바뀐 카테고리의
// "보존" type이 열거형에서 아예 빠졌다 — emit된 적 없는 죽은 값이라
// 정리됐다), 다르면 raw에서 재생성하고 rawChangedRegenerated 경고가
// 남는다.
const BULK_XLSX_WARNING_GROUPS = [
  {
    key: "notApplied",
    label: "반영 안 됨 — 기존 값 유지",
    tone: "neutral",
    types: ["truncated", "regressionSkipped"],
  },
  {
    key: "regeneratedCaution",
    label: "반영됨 — 품질 주의(표 구조가 단순해질 수 있음)",
    tone: "warning",
    types: ["rawChangedRegenerated"],
  },
  {
    key: "emptied",
    label: "이 카테고리가 비워짐(저장 안 됨)",
    tone: "neutral",
    types: ["importFailed"],
  },
  {
    key: "newUniversity",
    label: "신규 대학 추가(오타 확인 필요)",
    tone: "info",
    types: ["newUniversity"],
  },
];

const BULK_XLSX_TONE_CLASS = {
  neutral: "border-gray-300 bg-gray-50 text-gray-700",
  warning: "border-amber-400 bg-amber-50 text-amber-700",
  info: "border-blue-300 bg-blue-50 text-blue-700",
};

// existingRows 맵 값에 담을 6개 raw 카테고리 컬럼 — CATEGORY_KEYS와
// 이름이 같다(admissionBulkXlsx.js는 이 파일에 export 안 돼 있어 여기서
// HWP_SECTION_JSON_KEYS의 키로 다시 뽑는다). html 파싱 실패 시 "raw가
// 안 바뀌었나" 비교에 쓰인다 — 빠뜨리면 항상 "다름"으로 판정돼
// 불필요한 재생성이 일어난다(team-lead가 명시적으로 강조한 지점).
const BULK_XLSX_RAW_CATEGORY_KEYS = Object.keys(HWP_SECTION_JSON_KEYS);

function pad2(n) {
  return String(n).padStart(2, "0");
}

// 표 단위 xlsx(tableBlockXlsx.js)와 같은 이유로 XLSX.writeFile 대신
// XLSX.write(버퍼만 생성) + 수동 다운로드를 쓴다 — writeFile의 Node
// ESM/CJS 환경 감지 불안정 이슈를 겪은 적이 있어(그건 노드 검증
// 스크립트 얘기지만) 프로덕션 경로도 동일 패턴으로 통일해둔다.
function triggerXlsxDownload(workbook, fileName) {
  const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function AdmissionBulkXlsxPanel({ rows, onReload }) {
  const [exportTruncatedCells, setExportTruncatedCells] = useState<
    ReturnType<typeof exportAdmissionRowsToXlsx>["truncatedCells"]
  >([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<ReturnType<
    typeof parseAdmissionRowsFromXlsx
  > | null>(null); // { rows, errors, warnings, summary }
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalRows = (rows || []).length;

  function handleDownload() {
    const { workbook, truncatedCells } = exportAdmissionRowsToXlsx(rows || []);
    setExportTruncatedCells(truncatedCells);
    const today = new Date();
    const fileName = `모집요강_전체_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`;
    if (typeof document !== "undefined") {
      triggerXlsxDownload(workbook, fileName);
    }
  }

  function buildExistingRowsMap() {
    const map = new Map();
    (rows || []).forEach((row) => {
      const key = `${row.admission_year}::${row.university_key}`;
      const value = { id: row.id };
      Object.values(HWP_SECTION_JSON_KEYS).forEach((jsonColumn) => {
        value[jsonColumn] = row[jsonColumn];
      });
      BULK_XLSX_RAW_CATEGORY_KEYS.forEach((rawKey) => {
        value[rawKey] = row[rawKey];
      });
      map.set(key, value);
    });
    return map;
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 선택해도 change가 발생하게 리셋
    if (!file) return;

    setParseErrors([]);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: "array" });
        const existingRows = buildExistingRowsMap();
        const result = parseAdmissionRowsFromXlsx(workbook, existingRows);
        setParseResult(result);
      } catch (err) {
        setParseErrors([
          `파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`,
        ]);
      }
    };
    reader.onerror = () => {
      setParseErrors(["파일을 읽지 못했습니다."]);
    };
    reader.readAsArrayBuffer(file);
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function cancelPreview() {
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
  }

  async function handleApply() {
    if (!parseResult || !confirmChecked || applying) return;
    setApplying(true);
    // parseAdmissionRowsFromXlsx(src/lib/admissionBulkXlsx.js, .js라 반환 타입이
    // Record<string, unknown>[]로 느슨하다)의 결과를 이 upsert 직전에서만
    // 생성 Insert 형태로 좁힌다 — 파서 자체는 이 작업 범위 밖이다.
    const { error } = await supabase
      .from("admission_university_resources")
      .upsert(
        parseResult.rows as TablesInsert<"admission_university_resources">[],
        {
          onConflict: "admission_year,university_key",
        },
      );
    if (error) {
      setApplying(false);
      alert(`엑셀 적용 실패: ${error.message}`);
      return;
    }
    const { summary } = parseResult;
    setApplying(false);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
    onReload?.();
    alert(
      `엑셀 적용 완료 — 신규 ${summary.willInsert}건 · 수정 ${summary.willUpdate}건 · 거부 ${summary.willSkip}건.`,
    );
  }

  const affectedCount = parseResult
    ? parseResult.summary.willInsert + parseResult.summary.willUpdate
    : 0;

  return (
    <div className="mb-6 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-black">엑셀 일괄 관리</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold"
          >
            {`엑셀 다운로드 (전체 ${totalRows}행)`}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold"
          >
            엑셀 업로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            aria-label="모집요강 xlsx 파일 선택"
          />
        </div>
      </div>

      {exportTruncatedCells.length > 0 && (
        <div className="mt-3 rounded-sm border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <p>
            {exportTruncatedCells.length}개 셀이 문자 수 한도(32,767자)를 넘어
            잘린 채로 다운로드됐습니다. 이 파일을 그대로 재업로드하면 해당
            컬럼은 자동으로 보존됩니다(데이터 손상 아님, 스킵 처리).
          </p>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {withDedupedKeys(parseErrors).map(({ item: msg, key }) => (
            <p key={key}>{msg}</p>
          ))}
        </div>
      )}

      {parseResult && (
        <div className="mt-3 rounded-sm border border-[#2348ff] bg-[#eef2ff] p-4 text-xs">
          {/* truncatedCellSkipCount 같은 개별 집계 필드는 여기서 안 쓰고
              warningCounts만 쓴다(team-lead 지시) — type별 건수를 lib이
              그대로 주므로 문자열 매칭·직접 재계산을 안 한다. 경고
              총건수도 warningCounts 값을 그대로 더한 것이다. 엑셀
              포맷에서 html 3종이 빠지면서(26→23컬럼) "html 파싱" 개념
              자체가 없어져 그쪽 집계 필드도 lib에서 정리됐다 — 애초에
              이 컴포넌트가 그 필드를 쓴 적이 없어 갱신할 코드는 없었다. */}
          <p className="font-black text-[#2348ff]">
            신규 {parseResult.summary.willInsert}건 · 수정{" "}
            {parseResult.summary.willUpdate}건 · 거부{" "}
            {parseResult.summary.willSkip}건 · 경고{" "}
            {Object.values(parseResult.summary.warningCounts || {}).reduce(
              (sum, n) => sum + n,
              0,
            )}
            건
          </p>

          {parseResult.summary.newYears.length > 0 && (
            <p className="mt-2 rounded-sm border border-blue-300 bg-blue-50 px-2 py-1.5 font-bold text-blue-700">
              신규 연도: {parseResult.summary.newYears.join(", ")}학년도 — 이
              파일에 새 연도 데이터가 포함돼 있습니다.
            </p>
          )}

          {parseResult.errors.length > 0 && (
            <div className="mt-3 rounded-sm border border-red-300 bg-red-50 p-2">
              <p className="font-black text-red-600">
                거부된 행 {parseResult.errors.length}건(적용 대상에서 완전히
                제외됩니다)
              </p>
              <ul className="mt-1 space-y-1">
                {withDedupedKeys(
                  parseResult.errors,
                  (err) => `${err.row}-${err.universityKey}-${err.reason}`,
                ).map(({ item: err, key }) => (
                  <li key={key} className="text-red-700">
                    행 {err.row + 1} · {String(err.admissionYear ?? "-")}학년도
                    · {String(err.universityKey || "(키 없음)")} — {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {BULK_XLSX_WARNING_GROUPS.map((group) => {
            // 건수는 lib이 준 warningCounts에서 합산한다(직접 세지 말라는
            // team-lead 지시) — 상세 목록은 어차피 개별 항목이 필요해
            // warnings 배열을 그대로 필터링한다(같은 type 기준이라 두
            // 값은 항상 같다).
            const groupCount = group.types.reduce(
              (sum, t) => sum + (parseResult.summary.warningCounts?.[t] || 0),
              0,
            );
            if (groupCount === 0) return null;
            const items = parseResult.warnings.filter((w) =>
              group.types.includes(w.type),
            );
            const isOpen = Boolean(expandedGroups[group.key]);
            return (
              <div
                key={group.key}
                className={`mt-3 rounded-sm border p-2 ${BULK_XLSX_TONE_CLASS[group.tone]}`}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between text-left font-black"
                >
                  <span>
                    {group.label} — {groupCount}건
                  </span>
                  <span>{isOpen ? "접기" : "자세히 보기"}</span>
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1 font-normal">
                    {withDedupedKeys(
                      items,
                      (w) =>
                        `${w.row}-${w.universityKey}-${w.column}-${w.reason}`,
                    ).map(({ item: w, key }) => (
                      <li key={key}>
                        행 {w.row + 1} · {String(w.admissionYear ?? "-")}학년도
                        · {String(w.universityKey || "(키 없음)")}
                        {w.column ? ` · ${w.column}` : ""} — {w.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <p className="mt-3 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
            되돌릴 수 없는 작업입니다 — 최대 {affectedCount}행이 일괄
            반영됩니다.
          </p>

          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            영향받는 {affectedCount}행을 확인했습니다
          </label>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={!confirmChecked || applying}
              className="h-9 bg-[#2348ff] px-4 font-black text-white disabled:opacity-50"
            >
              {applying ? "적용 중…" : "적용"}
            </button>
            <button
              type="button"
              onClick={cancelPreview}
              disabled={applying}
              className="h-9 border border-gray-400 bg-white px-4 font-bold disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// admissionResults.ListSummary의 진입점. AdmissionListSummary(모집요강)를
// 재사용하지 않는다 — 그쪽은 AdmissionActiveYearSummary(공개 연도 지정)를
// 함께 쌓는데, 입결은 공개 연도 개념이 없다(연도 자체가 result_year 행
// 값이고 그 축이 이미 데이터로 존재한다). 두 도메인을 한 컴포넌트에
// 억지로 묶으면 나중에 한쪽만 바뀌어도 다른 쪽 회귀를 걱정해야 한다.
function AdmissionResultsListSummary({ onReload }) {
  return <AdmissionResultsBulkXlsxPanel onReload={onReload} />;
}

// 입결정보(admission_results) 43,170행 전체를 29컬럼 xlsx
// (src/lib/admissionResultsBulkXlsx.js)로 일괄 왕복한다. UX 흐름은
// AdmissionBulkXlsxPanel(모집요강)과 동일하게 맞췄다 — 다운로드 →
// 업로드 → 미리보기(신규/수정/거부/경고 건수 + 거부 행 목록 + 경고
// 그룹 접기/펼치기) → 확인 체크박스로 게이트된 적용 → 재조회.
//
// 모집요강 패널과 다른 점은 전부 43,170행 규모 + coalesce() 표현식
// 유일성 인덱스에서 온다(design brief (A)(B)):
//   (A) props로 rows를 받지 않는다 — AdminTable이 config.serverPaginate
//       탓에 현재 페이지 PAGE_SIZE행만 들고 있어(Admin.jsx:6305 부근),
//       그걸 그대로 내보내면 10행짜리 파일이 나온다. 다운로드·업로드
//       (existingIdSet 준비) 둘 다 이 컴포넌트가 자체적으로 PostgREST
//       기본 상한(1,000행)에 맞춰 .range()로 청크 반복해 전량을 읽는다.
//   (B) onConflict 기반 upsert를 쓰지 않는다 — sql/53의 유일성 인덱스가
//       coalesce() 표현식이라 PostgREST onConflict가 컬럼 목록으로 못
//       받는다. 대신 admissionResultsBulkXlsx.js가 이미 행마다 id 유무로
//       insert/update를 갈라 payload를 만들어 주므로(id 없으면 insert,
//       있으면 update — 있는데 DB에 없으면 파싱 단계에서 거부), 이
//       컴포넌트는 그 분류를 그대로 받아 insert 배치는 .insert()로,
//       update 배치는 .upsert(chunk, { onConflict: 'id' })로 나눠 보낸다.
//       id는 이 테이블의 실제 기본키(평범한 컬럼 유일성)라 onConflict:'id'
//       자체는 admission_university_resources 때와 달리 문제가 없다 —
//       여기서 피한 건 "자연키 축(연도·대학·모집단위…)으로 onConflict를
//       거는 것"이지 id 자체가 아니다.
const RESULTS_TABLE = "admission_results";
// PostgREST 기본 응답 상한과 맞춘 읽기 청크 — 다운로드(전체 조회)와
// existingIdSet 준비(id만 조회) 둘 다 이 크기로 .range() 반복한다.
const RESULTS_READ_CHUNK = 1000;
// insert/upsert 배치 크기. 43k행 전량이 한 번에 바뀌는 시나리오(연도
// 전체 재적재 등)에서도 요청 하나가 과도하게 커지지 않게 나눈다.
const RESULTS_APPLY_CHUNK = 500;

const RESULTS_WARNING_GROUPS = [
  {
    key: "allGradesEmpty",
    label: "등급 9종이 전부 비어 있음",
    tone: "neutral",
    types: ["allGradesEmpty"],
  },
  {
    key: "competitionRateZero",
    label: "경쟁률 0 — §Q2 정책상 미공개는 빈 값이어야 함",
    tone: "warning",
    types: ["competitionRateZero"],
  },
  {
    key: "gradeCutInversion",
    label: "50%컷 > 70%컷 역전(원문 확인 필요)",
    tone: "warning",
    types: ["gradeCutInversion"],
  },
];

// count는 head:true로 행 본문 없이 받는다 — 다운로드 버튼 라벨·진행률
// 분모로만 쓰이므로 매번 새로 물어 최신 값을 반영한다(캐시하면 다른
// 화면에서 추가/삭제된 행수가 안 맞을 수 있다).
async function fetchResultsCount() {
  const { count, error } = await supabase
    .from(RESULTS_TABLE)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// 29컬럼 전량을 id 오름차순으로 청크 반복해 읽는다. order 없이 .range()만
// 반복하면 PostgREST가 매 요청마다 정렬을 보장하지 않아(암묵적 순서)
// 페이지 경계에서 행이 중복·누락될 수 있다 — id는 위닝 identity라 항상
// 유일하고 단조증가라 경계 문제가 없다.
async function fetchAllResultRows(onProgress) {
  const total = await fetchResultsCount();
  const all: Record<string, unknown>[] = [];
  for (let from = 0; from < total; from += RESULTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select(ADMISSION_RESULTS_BULK_XLSX_COLUMNS.join(", "))
      .order("id", { ascending: true })
      .range(from, from + RESULTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    // .select(동적 join 문자열)이라 supabase-js가 컬럼을 정적으로 못 읽어 data를
    // GenericStringError[]로 잡는다(런타임 값은 평범한 행 객체 배열) — 캐스팅으로 우회한다.
    all.push(...(data as unknown as Record<string, unknown>[]));
    onProgress?.({ done: all.length, total });
  }
  return all;
}

// id 컬럼만 전량 읽어 Set으로 돌려준다 — parseAdmissionResultRowsFromXlsx의
// existingIdSet 계약(파일의 id가 실제로 DB에 있는지 판정)에 쓴다. 29컬럼을
// 전부 읽는 fetchAllResultRows보다 훨씬 가볍다(업로드 시 매번 새로 조회해도
// 부담이 적다 — 그 사이 다른 관리자가 지운 id를 놓치지 않기 위해 캐시하지
// 않는다).
async function fetchAllResultIds(onProgress) {
  const total = await fetchResultsCount();
  const idSet = new Set<number>();
  for (let from = 0; from < total; from += RESULTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select("id")
      .order("id", { ascending: true })
      .range(from, from + RESULTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    data.forEach((r) => {
      idSet.add(r.id);
    });
    onProgress?.({ done: idSet.size, total });
  }
  return idSet;
}

function AdmissionResultsBulkXlsxPanel({ onReload }) {
  const [totalRowCount, setTotalRowCount] = useState<number | null>(null);
  const [fetchProgress, setFetchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null); // 다운로드 전량 읽기 진행률
  const [idSetProgress, setIdSetProgress] = useState<{
    done: number;
    total: number;
  } | null>(null); // 업로드 검증용 id 전량 읽기 진행률
  const [applyProgress, setApplyProgress] = useState<{
    done: number;
    total: number;
  } | null>(null); // 적용(insert/update) 진행률
  const [exportTruncatedCells, setExportTruncatedCells] = useState<
    ReturnType<typeof exportAdmissionResultRowsToXlsx>["truncatedCells"]
  >([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<ReturnType<
    typeof parseAdmissionResultRowsFromXlsx
  > | null>(null); // { rows, errors, warnings, summary }
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchResultsCount()
      .then((count) => {
        if (!cancelled) setTotalRowCount(count);
      })
      .catch(() => {
        // 버튼 라벨용 참고 수치일 뿐이라 실패해도 화면을 막지 않는다 —
        // 라벨은 그냥 "전체 -행"으로 남는다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = Boolean(fetchProgress || idSetProgress || applying);

  async function handleDownload() {
    if (busy) return;
    try {
      setFetchProgress({ done: 0, total: totalRowCount ?? 0 });
      const allRows = await fetchAllResultRows((p) => setFetchProgress(p));
      const { workbook, truncatedCells } =
        exportAdmissionResultRowsToXlsx(allRows);
      setExportTruncatedCells(truncatedCells);
      const today = new Date();
      const fileName = `입결정보_전체_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`;
      if (typeof document !== "undefined") {
        triggerXlsxDownload(workbook, fileName);
      }
    } catch (err) {
      alert(`엑셀 다운로드 실패: ${err.message}`);
    } finally {
      setFetchProgress(null);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 선택해도 change가 발생하게 리셋
    if (!file) return;

    setParseErrors([]);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});

    try {
      const buffer = await file.arrayBuffer();
      setIdSetProgress({ done: 0, total: totalRowCount ?? 0 });
      const existingIdSet = await fetchAllResultIds((p) => setIdSetProgress(p));
      setIdSetProgress(null);

      const workbook = XLSX.read(buffer, { type: "array" });
      const result = parseAdmissionResultRowsFromXlsx(workbook, existingIdSet);
      setParseResult(result);
    } catch (err) {
      setIdSetProgress(null);
      setParseErrors([
        `파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`,
      ]);
    }
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function cancelPreview() {
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
  }

  async function handleApply() {
    if (!parseResult || !confirmChecked || applying) return;
    setApplying(true);

    // id 유무로 이미 갈라진 payload를 그대로 배치에 나눠 보낸다 — insert
    // 배치는 .insert()(id 없음, identity 자동 채번), update 배치는
    // .upsert(chunk, { onConflict: 'id' })(실제 기본키라 안전, 설계 브리핑
    // (B) 참고). 두 배치는 컬럼 구성이 달라(update만 id를 가짐) 같은
    // 요청에 섞지 않는다 — PostgREST가 배열 안 각 객체의 키 집합이
    // 다르면 누락된 키를 일괄 default/null로 해석해 의도와 다르게 동작할
    // 수 있다.
    const insertRows = parseResult.rows.filter((row) => !("id" in row));
    const updateRows = parseResult.rows.filter((row) => "id" in row);
    const total = insertRows.length + updateRows.length;
    let done = 0;
    setApplyProgress({ done, total });

    try {
      for (let i = 0; i < insertRows.length; i += RESULTS_APPLY_CHUNK) {
        const chunk = insertRows.slice(i, i + RESULTS_APPLY_CHUNK);
        const { error } = await supabase.from(RESULTS_TABLE).insert(chunk);
        if (error) {
          throw new Error(
            `신규 등록 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`,
          );
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
      for (let i = 0; i < updateRows.length; i += RESULTS_APPLY_CHUNK) {
        const chunk = updateRows.slice(i, i + RESULTS_APPLY_CHUNK);
        const { error } = await supabase
          .from(RESULTS_TABLE)
          .upsert(chunk, { onConflict: "id" });
        if (error) {
          throw new Error(
            `수정 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`,
          );
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
    } catch (err) {
      setApplying(false);
      setApplyProgress(null);
      alert(
        `엑셀 적용 실패 — 이미 반영된 청크는 되돌려지지 않습니다(청크 단위 배치라 단일 트랜잭션이 아님). ${err.message}`,
      );
      onReload?.();
      return;
    }

    const { summary } = parseResult;
    setApplying(false);
    setApplyProgress(null);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
    fetchResultsCount()
      .then((count) => setTotalRowCount(count))
      .catch(() => {});
    onReload?.();
    alert(
      `엑셀 적용 완료 — 신규 ${summary.willInsert}건 · 수정 ${summary.willUpdate}건 · 거부 ${summary.willSkip}건.`,
    );
  }

  const affectedCount = parseResult
    ? parseResult.summary.willInsert + parseResult.summary.willUpdate
    : 0;

  return (
    <div className="mb-6 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-black">엑셀 일괄 관리</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fetchProgress
              ? `읽는 중… ${fetchProgress.done.toLocaleString()} / ${fetchProgress.total.toLocaleString()}행`
              : `엑셀 다운로드 (전체 ${totalRowCount === null ? "-" : totalRowCount.toLocaleString()}행)`}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {idSetProgress
              ? `업로드 검증 준비 중… ${idSetProgress.done.toLocaleString()} / ${idSetProgress.total.toLocaleString()}행`
              : "엑셀 업로드"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            aria-label="입결정보 xlsx 파일 선택"
          />
        </div>
      </div>

      {exportTruncatedCells.length > 0 && (
        <div className="mt-3 rounded-sm border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <p>
            {exportTruncatedCells.length}개 셀이 문자 수 한도(32,767자)를 넘어
            잘린 채로 다운로드됐습니다. 이 파일을 그대로 재업로드하면 해당 행은
            자동으로 거부됩니다(데이터 손상 아님).
          </p>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {withDedupedKeys(parseErrors).map(({ item: msg, key }) => (
            <p key={key}>{msg}</p>
          ))}
        </div>
      )}

      {parseResult && (
        <div className="mt-3 rounded-sm border border-[#2348ff] bg-[#eef2ff] p-4 text-xs">
          <p className="font-black text-[#2348ff]">
            신규 {parseResult.summary.willInsert}건 · 수정{" "}
            {parseResult.summary.willUpdate}건 · 거부{" "}
            {parseResult.summary.willSkip}건 · 경고{" "}
            {Object.values(parseResult.summary.warningCounts || {}).reduce(
              (sum, n) => sum + n,
              0,
            )}
            건
          </p>

          {parseResult.errors.length > 0 && (
            <div className="mt-3 rounded-sm border border-red-300 bg-red-50 p-2">
              <p className="font-black text-red-600">
                거부된 행 {parseResult.errors.length}건(적용 대상에서 완전히
                제외됩니다)
              </p>
              <ul className="mt-1 space-y-1">
                {withDedupedKeys(
                  parseResult.errors,
                  (err) =>
                    `${err.row}-${err.universityKey}-${err.departmentKey}-${err.admissionTrack}-${err.reason}`,
                ).map(({ item: err, key }) => (
                  <li key={key} className="text-red-700">
                    행 {err.row + 1} · {String(err.resultYear ?? "-")}학년도 ·{" "}
                    {String(err.universityKey || "(대학 키 없음)")}/
                    {String(err.departmentKey || "(모집단위 키 없음)")} ·{" "}
                    {String(err.admissionTrack || "(전형명 없음)")} —{" "}
                    {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {RESULTS_WARNING_GROUPS.map((group) => {
            const groupCount = group.types.reduce(
              (sum, t) => sum + (parseResult.summary.warningCounts?.[t] || 0),
              0,
            );
            if (groupCount === 0) return null;
            const items = parseResult.warnings.filter((w) =>
              group.types.includes(w.type),
            );
            const isOpen = Boolean(expandedGroups[group.key]);
            return (
              <div
                key={group.key}
                className={`mt-3 rounded-sm border p-2 ${BULK_XLSX_TONE_CLASS[group.tone]}`}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between text-left font-black"
                >
                  <span>
                    {group.label} — {groupCount}건
                  </span>
                  <span>{isOpen ? "접기" : "자세히 보기"}</span>
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1 font-normal">
                    {withDedupedKeys(
                      items,
                      (w) =>
                        `${w.row}-${w.universityKey}-${w.departmentKey}-${w.admissionTrack}-${w.reason}`,
                    ).map(({ item: w, key }) => (
                      <li key={key}>
                        행 {w.row + 1} · {String(w.resultYear ?? "-")}학년도 ·{" "}
                        {String(w.universityKey || "(대학 키 없음)")}/
                        {String(w.departmentKey || "(모집단위 키 없음)")} ·{" "}
                        {String(w.admissionTrack || "(전형명 없음)")} —{" "}
                        {w.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <p className="mt-3 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
            되돌릴 수 없는 작업입니다 — 최대 {affectedCount.toLocaleString()}
            행이 일괄 반영됩니다.
          </p>

          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            영향받는 {affectedCount.toLocaleString()}행을 확인했습니다
          </label>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={!confirmChecked || applying}
              className="h-9 bg-[#2348ff] px-4 font-black text-white disabled:opacity-50"
            >
              {(() => {
                if (!applying) return "적용";
                if (applyProgress)
                  return `적용 중… ${applyProgress.done.toLocaleString()} / ${applyProgress.total.toLocaleString()}행`;
                return "적용 중…";
              })()}
            </button>
            <button
              type="button"
              onClick={cancelPreview}
              disabled={applying}
              className="h-9 border border-gray-400 bg-white px-4 font-bold disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 목표관리 대학 컷(goal_university_cuts) — CONFIGS.goalUniversityCuts 의
// ListSummary 진입점과 그 3블록.
//
//   H-1 현황 요약        GoalCutsOverviewBlock
//   H-2 입결 유도 백필    GoalCutsBackfillPanel
//   H-3 엑셀 일괄 왕복    GoalCutsBulkXlsxPanel
//
// serverPaginate 탭이므로 세 블록 모두 props 의 rows 를 쓰지 않는다 —
// AdminTable 이 들고 있는 건 현재 페이지 10행뿐이라 그걸로 집계하면
// 전부 틀린 수치가 나온다(AdmissionResultsBulkXlsxPanel 과 같은 이유).
// 필요한 데이터는 각 블록이 직접 PostgREST 상한(1,000행)에 맞춰
// .range() 청크 반복으로 읽는다.
// =====================================================================

const GOAL_CUTS_TABLE = "goal_university_cuts";
// sql/83_goal_admin_options_rls.sql 이 만든 (대학, 학과) 단위 집계 뷰.
// has_normal/has_special/has_jungsi 플래그를 준다.
const GOAL_CUTS_OPTIONS_VIEW = "goal_university_options";
// PostgREST 기본 응답 상한과 맞춘 읽기 청크.
const GOAL_CUTS_READ_CHUNK = 1000;
// upsert/update 배치 크기. 백필 최대 산출이 13,000행대라 27회 요청이 된다.
const GOAL_CUTS_APPLY_CHUNK = 500;

const GOAL_CUTS_WARNING_GROUPS = [
  {
    key: "jungsiLooksLikeGrade",
    label: "🔴 정시 컷에 9 이하 값 — 내신 등급 혼입 의심",
    tone: "danger",
    types: ["jungsiLooksLikeGrade"],
  },
  {
    key: "naesinCutTooHigh",
    label: "수시 컷이 8등급 이상",
    tone: "warning",
    types: ["naesinCutTooHigh"],
  },
  {
    key: "cutMissing",
    label: "컷 값이 비어 있음(온보딩 422)",
    tone: "warning",
    types: ["cutMissing"],
  },
  {
    key: "unknownSource",
    label: "출처를 알 수 없어 '수기 입력'으로 강등 — 이후 백필에서 갱신 안 됨",
    tone: "warning",
    types: ["unknownSource"],
  },
  {
    key: "inactiveRow",
    label: "노출 꺼짐(온보딩 목록에서 사라짐)",
    tone: "neutral",
    types: ["inactiveRow"],
  },
];

const GOAL_CUTS_TONE_CLASS = {
  danger: "border-red-300 bg-red-50 text-red-700",
  warning: "border-amber-400 bg-amber-50 text-amber-700",
  neutral: "border-gray-300 bg-gray-50 text-gray-600",
};

async function goalCutsCount(applyFilters?) {
  let query = supabase
    .from(GOAL_CUTS_TABLE)
    .select("id", { count: "exact", head: true });
  if (applyFilters) query = applyFilters(query);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// id 오름차순으로 청크 반복해 전량을 읽는다. order 없이 .range() 만 반복하면
// PostgREST 가 매 요청마다 정렬을 보장하지 않아 페이지 경계에서 행이 중복·
// 누락된다(admissionResults 쪽과 같은 논리).
async function fetchAllGoalCutRows(columns, onProgress?) {
  const total = await goalCutsCount();
  const all: Record<string, unknown>[] = [];
  for (let from = 0; from < total; from += GOAL_CUTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(GOAL_CUTS_TABLE)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    // columns가 호출부마다 다른 동적 문자열이라 supabase-js가 컬럼을 정적으로
    // 못 읽어 data를 GenericStringError[]로 잡는다(런타임 값은 평범한 행 객체 배열).
    all.push(...(data as unknown as Record<string, unknown>[]));
    onProgress?.({ done: all.length, total });
  }
  return all;
}

// 엑셀 업로드 검증용. id → 그 행의 현재 cut_type 을 통째로 읽어 Map 으로
// 돌려준다 — idNotFound 와 cutTypeChanged 를 **같은 조회 결과**로 판정한다.
// 캐시하지 않는다: 그 사이 다른 관리자가 지운 id 를 놓치지 않기 위해서다.
async function fetchGoalCutIdCutTypeMap(onProgress) {
  const rows = await fetchAllGoalCutRows("id, cut_type", onProgress);
  return new Map<number, string>(
    rows.map((r) => [r.id as number, r.cut_type as string]),
  );
}

// goal_university_options 뷰 전량. (대학, 학과) 단위로 이미 접혀 있어
// 조합 약 6,600건이면 한 번의 청크 반복으로 충분하다. 뷰에는 id 가 없어
// 정렬 축을 university_key + department_key 로 잡는다(이 둘이 뷰의
// group by 축이라 조합이 유일하다).
async function fetchGoalUniversityOptionRows() {
  const { count, error: countError } = await supabase
    .from(GOAL_CUTS_OPTIONS_VIEW)
    .select("university_key", { count: "exact", head: true });
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  const all: {
    university_key: unknown;
    university_name: unknown;
    department_key: unknown;
    department_name: unknown;
    has_normal: unknown;
    has_special: unknown;
    has_jungsi: unknown;
  }[] = [];
  for (let from = 0; from < total; from += GOAL_CUTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(GOAL_CUTS_OPTIONS_VIEW)
      .select(
        "university_key, university_name, department_key, department_name, has_normal, has_special, has_jungsi",
      )
      .order("university_key", { ascending: true })
      .order("department_key", { ascending: true })
      .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
  }
  return all;
}

// H-2 백필 — 소스 조회 + 순수 집계는 src/lib/goal/goalCutBackfill.js 로
// 옮겼다(scripts/run-goal-cuts-backfill.mjs 와 로직을 공유한다). 이 파일은
// 위 import 로 그 함수들을 그대로 쓴다.

// 산출 payload 를 기존 행과 대조한다. 순수 함수다.
// (블록 주석 금지 — 위 computeGoalCutBackfill 머리말의 회귀 가드 설명 참고.)
//
// 반환:
//   overlapCount   기존 행과 자연키가 겹치는 산출 행 수
//   manualCount / inactiveCount / notedCount  보존 술어별 건수(중복 가능)
//   preservedKeys  보존 대상 conflictKey 집합(= 산출에서 제외할 대상)
//   orphanIds      이번 산출에 없는 기존 유도 행(source=admission_results,
//                  is_active=true)의 id. source='manual' 은 절대 대상이 아니다.
//   nameAxisKeys   🔴 goal_university_cuts_name_key(partial UNIQUE, where
//                  is_active)와 충돌해 청크 전체를 23505 로 죽일 산출 행.
//                  key 축에서는 안 걸리는데 name 축에서만 걸리는 경우다 —
//                  기존 행의 key 와 name 이 다를 때 생긴다(dev 실측으로
//                  409/23505 재현 확인). 어드민은 key := name 을 강제하므로
//                  정상 운영에서는 0이지만, 나면 청크 500행이 통째로
//                  날아가므로 미리보기에서 걸러 낸다.
// fetchAllGoalCutRows("id, cut_type, university_key, university_name,
// department_key, department_name, source, is_active, note")가 넘겨주는 행 셰이프.
type GoalCutExistingRow = {
  id: number;
  cut_type: string;
  university_key: string;
  university_name: string;
  department_key: string;
  department_name: string;
  source: string;
  is_active: boolean;
  note?: string | null;
};

function analyzeGoalCutBackfillAgainstExisting(
  payloads: GoalCutBackfillPayload[],
  existingRows: GoalCutExistingRow[] | null | undefined,
) {
  const existingByConflictKey = new Map<string, GoalCutExistingRow>();
  const activeConflictKeyByNameKey = new Map<string, string>();
  (existingRows || []).forEach((row) => {
    const conflictKey = goalCutConflictKey(
      row.cut_type,
      row.university_key,
      row.department_key,
    );
    existingByConflictKey.set(conflictKey, row);
    if (row.is_active) {
      const nameKey = goalCutConflictKey(
        row.cut_type,
        row.university_name,
        row.department_name,
      );
      if (!activeConflictKeyByNameKey.has(nameKey)) {
        activeConflictKeyByNameKey.set(nameKey, conflictKey);
      }
    }
  });

  let overlapCount = 0;
  let manualCount = 0;
  let inactiveCount = 0;
  let notedCount = 0;
  const preservedKeys = new Set<string>();
  const nameAxisKeys = new Set<string>();
  const producedKeys = new Set<string>();

  payloads.forEach((p) => {
    const conflictKey = goalCutConflictKey(
      p.cut_type,
      p.university_key,
      p.department_key,
    );
    producedKeys.add(conflictKey);

    const existing = existingByConflictKey.get(conflictKey);
    if (existing) {
      overlapCount += 1;
      let preserved = false;
      if (existing.source === "manual") {
        manualCount += 1;
        preserved = true;
      }
      if (existing.is_active === false) {
        inactiveCount += 1;
        preserved = true;
      }
      if (String(existing.note ?? "").trim() !== "") {
        notedCount += 1;
        preserved = true;
      }
      if (preserved) preservedKeys.add(conflictKey);
    }

    // key := name 이므로 payload 의 nameKey 는 conflictKey 와 같은 문자열이다.
    // 기존 활성 행이 같은 name 축을 다른 key 축으로 점유하고 있으면 23505 다.
    const holder = activeConflictKeyByNameKey.get(conflictKey);
    if (holder && holder !== conflictKey) nameAxisKeys.add(conflictKey);
  });

  const orphanIds = (existingRows || [])
    .filter(
      (row) =>
        row.source === "admission_results" &&
        row.is_active === true &&
        !producedKeys.has(
          goalCutConflictKey(
            row.cut_type,
            row.university_key,
            row.department_key,
          ),
        ),
    )
    .map((row) => row.id);

  return {
    overlapCount,
    manualCount,
    inactiveCount,
    notedCount,
    preservedKeys,
    nameAxisKeys,
    orphanIds,
  };
}

// ---------------------------------------------------------------------
// H-1 현황 요약
// ---------------------------------------------------------------------

function GoalCutsOverviewBlock({ refreshToken, mutationSeq }) {
  const [summary, setSummary] = useState<{
    total: number;
    active: number;
    normal: number;
    special: number;
    jungsi: number;
    missing: number;
    comboTotal: number;
    comboNoJungsi: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) refreshToken/mutationSeq는 effect 안에서 읽지 않는 트리거 전용 카운터 — 부모가 변이 후 값을 올려 재조회를 강제한다.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // head:true 카운트(본문 0바이트) 6회 + 뷰 전량 1회.
      const [total, active, normal, special, jungsi, missing] =
        await Promise.all([
          goalCutsCount(),
          goalCutsCount((q) => q.eq("is_active", true)),
          goalCutsCount((q) => q.eq("cut_type", "normal")),
          goalCutsCount((q) => q.eq("cut_type", "special")),
          goalCutsCount((q) => q.eq("cut_type", "jungsi")),
          goalCutsCount((q) => q.is("avg_cut", null)),
        ]);
      const options = await fetchGoalUniversityOptionRows();
      const comboTotal = options.length;
      const comboNoJungsi = options.filter((o) => !o.has_jungsi).length;
      if (!cancelled) {
        setSummary({
          total,
          active,
          normal,
          special,
          jungsi,
          missing,
          comboTotal,
          comboNoJungsi,
        });
      }
    })()
      // 실패해도 화면을 막지 않는다 — 참고 지표일 뿐이다.
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, mutationSeq]);

  if (loading && !summary) {
    return (
      <div className="bg-white p-4 text-sm shadow-sm">
        <div className="font-black">현황 요약</div>
        <p className="mt-2 text-xs text-gray-500">불러오는 중…</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="bg-white p-4 text-sm shadow-sm">
        <div className="font-black">현황 요약</div>
        <p className="mt-2 text-xs text-gray-500">
          현황을 불러오지 못했습니다(목록 사용에는 영향 없습니다).
        </p>
      </div>
    );
  }

  const n = (v) => v.toLocaleString();
  return (
    <div className="bg-white p-4 text-sm shadow-sm">
      <div className="font-black">현황 요약</div>
      <p className="mt-2 text-xs font-bold text-gray-700">
        전체 {n(summary.total)}건 · 노출 {n(summary.active)}건 · 수시 일반{" "}
        {n(summary.normal)}건 · 수시 특목 {n(summary.special)}건 · 정시{" "}
        {n(summary.jungsi)}건 · 컷 미확보 {n(summary.missing)}건
      </p>
      {/* 🟠(품질 지표)이지 🔴(블로커)가 아니다 — 정시 컷이 없어도 그 조합은
          온보딩 목록에 뜨고 학생은 고를 수 있다. 다만 그 학생의 정시 확률
          2종이 계속 미산출로 남고, 나중에 컷을 채워도 재계산되지 않는다
          (base_* 는 온보딩 이후 불변). */}
      <p className="mt-2 rounded-sm border border-amber-400 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-700">
        🟠 정시 컷 없는 (대학, 학과) 조합: {n(summary.comboNoJungsi)}건 / 전체{" "}
        {n(summary.comboTotal)}조합 — 이 조합을 고른 학생은 정시 확률 2종이 계속
        미산출입니다.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------
// H-2 입결 유도 백필
// ---------------------------------------------------------------------

function GoalCutsBackfillPanel({ onReload }) {
  const [yearMode, setYearMode] = useState<GoalBackfillYearMode>("prefer2026");
  const [preserveMode, setPreserveMode] = useState("preserve"); // preserve | overwrite
  const [orphanMode, setOrphanMode] = useState("keep"); // keep | deactivate
  const [sourceProgress, setSourceProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [computing, setComputing] = useState(false);
  const [preview, setPreview] = useState<{
    stats: GoalCutBackfillStats;
    analysis: ReturnType<typeof analyzeGoalCutBackfillAgainstExisting>;
    applyPayloads: GoalCutBackfillPayload[];
    sourceRowCount: number;
  } | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const busy = Boolean(sourceProgress || computing || applying);

  // 옵션이 바뀌면 미리보기를 버린다 — 산출값(N)이 확인 게이트 문구와
  // 적용 대상 양쪽의 근거라, 옵션과 어긋난 미리보기를 남겨 두면
  // "확인한 N행"과 "실제 반영되는 N행"이 달라진다.
  function resetPreview() {
    setPreview(null);
    setConfirmChecked(false);
  }

  async function handleCompute() {
    if (busy) return;
    setComputing(true);
    setPreview(null);
    setConfirmChecked(false);
    try {
      setSourceProgress({ done: 0, total: 0 });
      const sourceRows = await fetchBackfillSourceRows(
        supabase,
        yearMode,
        (p) => setSourceProgress(p),
      );
      setSourceProgress(null);
      const { payloads, stats } = computeGoalCutBackfill(sourceRows, yearMode);
      const existingRows = await fetchAllGoalCutRows(
        "id, cut_type, university_key, university_name, department_key, department_name, source, is_active, note",
      );
      const analysis = analyzeGoalCutBackfillAgainstExisting(
        payloads,
        // fetchAllGoalCutRows는 컬럼 문자열이 동적이라 범용 Record[]를 반환한다 —
        // 위 select 목록이 실제로 GoalCutExistingRow 셰이프임을 호출부에서 보증한다.
        existingRows as unknown as GoalCutExistingRow[],
      );
      const applyPayloads = payloads.filter((p) => {
        const key = goalCutConflictKey(
          p.cut_type,
          p.university_key,
          p.department_key,
        );
        if (analysis.nameAxisKeys.has(key)) return false;
        if (preserveMode === "preserve" && analysis.preservedKeys.has(key))
          return false;
        return true;
      });
      setPreview({
        stats,
        analysis,
        applyPayloads,
        sourceRowCount: sourceRows.length,
      });
    } catch (err) {
      setPreview(null);
      alert(`미리보기 계산 실패: ${err.message}`);
    } finally {
      setSourceProgress(null);
      setComputing(false);
    }
  }

  async function handleApply() {
    if (!preview || !confirmChecked || applying) return;
    const rowsToApply = preview.applyPayloads;
    const orphanIds =
      orphanMode === "deactivate" ? preview.analysis.orphanIds : [];
    const total = rowsToApply.length + orphanIds.length;
    if (total === 0) {
      alert("반영할 행이 없습니다.");
      return;
    }
    setApplying(true);
    let done = 0;
    setApplyProgress({ done, total });

    try {
      for (let i = 0; i < rowsToApply.length; i += GOAL_CUTS_APPLY_CHUNK) {
        const chunk = rowsToApply.slice(i, i + GOAL_CUTS_APPLY_CHUNK);
        // onConflict 는 goal_university_cuts_key(평범한 3컬럼 UNIQUE btree)를
        // 가리킨다 — dev 실측으로 신규 201 / 재실행 200 · id 보존 · is_active
        // 와 note 보존까지 확인했다.
        const { error } = await supabase.from(GOAL_CUTS_TABLE).upsert(chunk, {
          onConflict: "cut_type,university_key,department_key",
        });
        if (error) {
          throw new Error(
            `컷 반영 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`,
          );
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
      for (let i = 0; i < orphanIds.length; i += GOAL_CUTS_APPLY_CHUNK) {
        const chunk = orphanIds.slice(i, i + GOAL_CUTS_APPLY_CHUNK);
        // 삭제하지 않는다 — 되돌릴 수 있어야 한다.
        const { error } = await supabase
          .from(GOAL_CUTS_TABLE)
          .update({ is_active: false })
          .in("id", chunk);
        if (error) {
          throw new Error(
            `고아 유도 행 노출 끄기 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`,
          );
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
    } catch (err) {
      setApplying(false);
      setApplyProgress(null);
      alert(
        `백필 적용 실패 — 이미 반영된 청크는 되돌려지지 않습니다(청크 단위 배치라 단일 트랜잭션이 아님). ${err.message}`,
      );
      onReload?.();
      return;
    }

    setApplying(false);
    setApplyProgress(null);
    setPreview(null);
    setConfirmChecked(false);
    onReload?.();
    alert(
      `입결 유도 컷 ${rowsToApply.length.toLocaleString()}행을 반영했습니다.` +
        (orphanIds.length
          ? ` 고아 유도 행 ${orphanIds.length.toLocaleString()}건의 노출을 껐습니다.`
          : ""),
    );
  }

  const stats = preview?.stats;
  const analysis = preview?.analysis;
  const affectedCount =
    (preview?.applyPayloads.length ?? 0) +
    (orphanMode === "deactivate" ? (analysis?.orphanIds.length ?? 0) : 0);

  return (
    <div className="bg-white p-4 text-sm shadow-sm">
      <div className="font-black">입결정보에서 수시 컷 일괄 생성</div>
      <p className="mt-2 text-xs leading-5 text-gray-600">
        입결정보(admission_results)의 70% 컷 등급에서 수시 컷을 유도해 이 표에
        채웁니다. 정시 컷은 원본 데이터가 없어 생성되지 않습니다 — 수기 또는
        엑셀로 입력해 주세요.
      </p>

      <div className="mt-3 space-y-2 rounded-sm border border-gray-200 bg-[#fafafa] p-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-32 shrink-0 font-black">기준 연도</span>
          {GOAL_BACKFILL_YEAR_MODES.map((mode) => (
            <label
              key={mode.value}
              className="flex items-center gap-1 font-bold"
            >
              <input
                type="radio"
                name="goalCutsBackfillYear"
                checked={yearMode === mode.value}
                disabled={busy}
                onChange={() => {
                  setYearMode(mode.value);
                  resetPreview();
                }}
              />
              {mode.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-32 shrink-0 font-black">기존 행 처리</span>
          {[
            { value: "preserve", label: "관리자가 손댄 행은 보존" },
            { value: "overwrite", label: "전부 덮어쓰기" },
          ].map((mode) => (
            <label
              key={mode.value}
              className="flex items-center gap-1 font-bold"
            >
              <input
                type="radio"
                name="goalCutsBackfillPreserve"
                checked={preserveMode === mode.value}
                disabled={busy}
                onChange={() => {
                  setPreserveMode(mode.value);
                  resetPreview();
                }}
              />
              {mode.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-32 shrink-0 font-black">
            이번 산출에 없는 기존 유도 행
          </span>
          {[
            { value: "keep", label: "그대로 둔다" },
            { value: "deactivate", label: "노출을 끈다(is_active=false)" },
          ].map((mode) => (
            <label
              key={mode.value}
              className="flex items-center gap-1 font-bold"
            >
              <input
                type="radio"
                name="goalCutsBackfillOrphan"
                checked={orphanMode === mode.value}
                disabled={busy}
                onChange={() => {
                  setOrphanMode(mode.value);
                  resetPreview();
                }}
              />
              {mode.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={handleCompute}
          disabled={busy}
          className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sourceProgress
            ? `입결 읽는 중… ${sourceProgress.done.toLocaleString()} / ${sourceProgress.total.toLocaleString()}행`
            : computing
              ? "계산 중…"
              : "미리보기 계산"}
        </button>
      </div>

      {preview &&
        // preview는 위 && 로 non-null 확정이지만 stats/analysis는 preview?.stats
        // 로 뽑아 둔 밖의 alias라 타입이 좁혀지지 않는다 — 이 서브트리 안에서만
        // 좁혀진 지역 변수로 다시 감싼다(로직 변경 없음, 값은 preview.stats/analysis 그대로).
        (() => {
          const stats = preview.stats;
          const analysis = preview.analysis;
          return (
            <div className="mt-3 rounded-sm border border-[#2348ff] bg-[#eef2ff] p-4 text-xs">
              <p className="font-black text-[#2348ff]">
                생성 대상: 대학 {stats.universityCount.toLocaleString()}개 ·
                학과 조합 {stats.pairCount.toLocaleString()}개 · 총{" "}
                {stats.totalRows.toLocaleString()}행 (수시 일반{" "}
                {stats.normalCount.toLocaleString()} / 수시 특목{" "}
                {stats.specialCount.toLocaleString()})
              </p>
              <p className="mt-1 text-gray-700">
                소스 {preview.sourceRowCount.toLocaleString()}행 · 기준 연도
                내역: 2026 기준 {stats.year2026Pairs.toLocaleString()}조합 ·
                2025 폴백 {stats.year2025Pairs.toLocaleString()}조합
              </p>
              <p className="mt-1 text-gray-700">
                제외: (*) 접미 {stats.excludedStarPairs.toLocaleString()}조합 ·
                빈 학과명 {stats.excludedEmptyPairs.toLocaleString()}조합 ·
                교과·종합 없음 {stats.excludedNoTrackPairs.toLocaleString()}조합
                (현재 데이터 기준 전부 0이 정상입니다)
              </p>
              <p className="mt-1 text-gray-700">
                중복 병합: {stats.mergedCount.toLocaleString()}건
              </p>

              <p className="mt-2 font-bold text-gray-700">
                컷 값 분포 — min {stats.distribution.min ?? "-"} · p25{" "}
                {stats.distribution.p25 ?? "-"} · median{" "}
                {stats.distribution.median ?? "-"} · p75{" "}
                {stats.distribution.p75 ?? "-"} · max{" "}
                {stats.distribution.max ?? "-"} (전부 내신 등급 1~9 스케일이어야
                합니다)
              </p>

              <div className="mt-2 rounded-sm border border-gray-300 bg-white p-2">
                <p className="font-black">
                  기존 행과 겹침: {analysis.overlapCount.toLocaleString()}행
                </p>
                <ul className="mt-1 space-y-0.5 text-gray-700">
                  <li>
                    ├ 수기 입력(source=manual){" "}
                    {analysis.manualCount.toLocaleString()}행
                  </li>
                  <li>
                    ├ 노출이 꺼져 있음(is_active=false){" "}
                    {analysis.inactiveCount.toLocaleString()}행
                  </li>
                  <li>
                    └ 운영 메모가 있음(note&lt;&gt;&apos;&apos;){" "}
                    {analysis.notedCount.toLocaleString()}행
                  </li>
                </ul>
                <p className="mt-1 text-gray-700">
                  {preserveMode === "preserve"
                    ? `→ 보존 대상 ${analysis.preservedKeys.size.toLocaleString()}행을 이번 반영에서 제외합니다.`
                    : "→ 전부 덮어쓰기 — 보존 술어를 적용하지 않습니다."}
                </p>
                <p className="mt-1 text-gray-700">
                  이번 산출에 없는 기존 유도 행(source=admission_results):{" "}
                  {analysis.orphanIds.length.toLocaleString()}행
                  {orphanMode === "deactivate"
                    ? " → 노출을 끕니다"
                    : " → 그대로 둡니다"}
                </p>
              </div>

              {analysis.nameAxisKeys.size > 0 && (
                <p className="mt-2 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
                  🔴 {analysis.nameAxisKeys.size.toLocaleString()}행이 기존 활성
                  행과 (컷 종류, 대학명, 학과명)은 같은데 key 컬럼이 달라 유일성
                  인덱스 goal_university_cuts_name_key 와 충돌합니다. 그대로
                  보내면 청크 500행이 통째로 실패하므로 이번 반영에서
                  제외했습니다 — 해당 기존 행을 목록에서 찾아 정리해 주세요.
                </p>
              )}

              {preserveMode === "overwrite" && (
                <p className="mt-2 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
                  노출이 꺼진 {analysis.inactiveCount.toLocaleString()}행이 다시
                  켜지지는 않지만, 컷 값·출처·기준 연도는 전부 덮어써집니다.
                </p>
              )}

              {stats.samples.length > 0 && (
                <ScrollArea axis="x" className="mt-3">
                  <p className="font-black">
                    상위 {stats.samples.length}행 샘플
                  </p>
                  <table className="mt-1 w-full min-w-150 border-collapse text-left">
                    <thead>
                      <tr className="border-b border-gray-300 font-black">
                        <th className="py-1 pr-2">대학</th>
                        <th className="py-1 pr-2">학과</th>
                        <th className="py-1 pr-2">종류</th>
                        <th className="py-1 pr-2">컷</th>
                        <th className="py-1 pr-2">연도</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.samples.map((s) => (
                        <tr
                          key={`${s.cut_type}-${s.university_key}-${s.department_key}`}
                          className="border-b border-gray-200"
                        >
                          <td className="py-1 pr-2">{s.university_name}</td>
                          <td className="py-1 pr-2">{s.department_name}</td>
                          <td className="py-1 pr-2">
                            {s.cut_type === "normal"
                              ? "수시 일반"
                              : "수시 특목"}
                          </td>
                          <td className="py-1 pr-2">{s.avg_cut}등급</td>
                          <td className="py-1 pr-2">{s.source_year}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}

              <p className="mt-3 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
                ⚠ 되돌릴 수 없는 작업입니다 — {affectedCount.toLocaleString()}
                행이 생성·갱신됩니다.
              </p>

              <label className="mt-2 flex items-center gap-2 font-bold">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                />
                영향받는 {affectedCount.toLocaleString()}행을 확인했습니다
              </label>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!confirmChecked || applying}
                  className="h-9 bg-[#2348ff] px-4 font-black text-white disabled:opacity-50"
                >
                  {(() => {
                    if (!applying) return "적용";
                    if (applyProgress)
                      return `적용 중… ${applyProgress.done.toLocaleString()} / ${applyProgress.total.toLocaleString()}행`;
                    return "적용 중…";
                  })()}
                </button>
                <button
                  type="button"
                  onClick={resetPreview}
                  disabled={applying}
                  className="h-9 border border-gray-400 bg-white px-4 font-bold disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

// ---------------------------------------------------------------------
// H-3 엑셀 일괄 왕복
// ---------------------------------------------------------------------

function GoalCutsBulkXlsxPanel({ onReload }) {
  // 다운로드 버튼은 하나뿐이다(2026-08-07 사용자 지시: "엑셀 다운로드
  // 버튼이 여러 개다, 우리가 개발한 걸로 통일해라"). 범위는 라디오로 고른다.
  const [downloadScope, setDownloadScope] = useState("all"); // all | jungsiTemplate
  const [totalRowCount, setTotalRowCount] = useState<number | null>(null);
  const [fetchProgress, setFetchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [idMapProgress, setIdMapProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [applyProgress, setApplyProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [exportTruncatedCells, setExportTruncatedCells] = useState<
    ReturnType<typeof exportGoalUniversityCutRowsToXlsx>["truncatedCells"]
  >([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<ReturnType<
    typeof parseGoalUniversityCutRowsFromXlsx
  > | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    goalCutsCount()
      .then((count) => {
        if (!cancelled) setTotalRowCount(count);
      })
      .catch(() => {
        // 버튼 라벨용 참고 수치라 실패해도 화면을 막지 않는다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = Boolean(fetchProgress || idMapProgress || applying);

  async function handleDownload() {
    if (busy) return;
    try {
      setFetchProgress({ done: 0, total: totalRowCount ?? 0 });
      let rows: Record<string, unknown>[];
      let fileNamePrefix: string;
      if (downloadScope === "jungsiTemplate") {
        // 정시 컷 없는 (대학, 학과)를 id 빈 정시 템플릿 행으로 내려준다.
        // 🔴 대학명·학과명은 수시 컷 행의 문자열을 **그대로 복사**한다 —
        // 관리자가 손으로 타이핑하면 goalRepo.fetchUniversityCut 의 완전일치
        // 조회가 깨져 그 학생의 정시 확률이 영원히 미산출로 남는다.
        const options = await fetchGoalUniversityOptionRows();
        rows = options
          .filter((o) => !o.has_jungsi)
          .map((o) => ({
            id: "",
            cut_type: "jungsi",
            university_name: o.university_name,
            department_name: o.department_name,
            avg_cut: "",
            source: "manual",
            source_year: "",
            is_active: true,
            note: "",
          }));
        fileNamePrefix = "목표관리_정시컷_템플릿";
      } else {
        rows = await fetchAllGoalCutRows(
          "id, cut_type, university_name, department_name, avg_cut, source, source_year, is_active, note",
          (p) => setFetchProgress(p),
        );
        fileNamePrefix = "목표관리_대학컷_전체";
      }
      const { workbook, truncatedCells } =
        exportGoalUniversityCutRowsToXlsx(rows);
      setExportTruncatedCells(truncatedCells);
      const today = new Date();
      const fileName = `${fileNamePrefix}_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`;
      if (typeof document !== "undefined") {
        triggerXlsxDownload(workbook, fileName);
      }
    } catch (err) {
      alert(`엑셀 다운로드 실패: ${err.message}`);
    } finally {
      setFetchProgress(null);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 선택해도 change 가 발생하게 리셋
    if (!file) return;

    setParseErrors([]);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});

    try {
      const buffer = await file.arrayBuffer();
      setIdMapProgress({ done: 0, total: totalRowCount ?? 0 });
      // idNotFound 와 cutTypeChanged 를 같은 조회 결과로 판정한다.
      const idMap = await fetchGoalCutIdCutTypeMap((p) => setIdMapProgress(p));
      setIdMapProgress(null);

      const workbook = XLSX.read(buffer, { type: "array" });
      setParseResult(parseGoalUniversityCutRowsFromXlsx(workbook, idMap));
    } catch (err) {
      setIdMapProgress(null);
      setParseErrors([
        `파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`,
      ]);
    }
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function cancelPreview() {
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
  }

  async function handleApply() {
    if (!parseResult || !confirmChecked || applying) return;
    setApplying(true);

    // id 유무로 이미 갈라진 payload 를 그대로 배치에 나눠 보낸다. 두 배치는
    // 컬럼 구성이 달라(update 만 id 를 가짐) 같은 요청에 섞지 않는다 —
    // PostgREST 가 배열 안 객체들의 키 집합이 다르면 누락 키를 일괄
    // default/null 로 해석한다.
    const insertRows = parseResult.rows.filter((row) => !("id" in row));
    const updateRows = parseResult.rows.filter((row) => "id" in row);
    const total = insertRows.length + updateRows.length;
    let done = 0;
    setApplyProgress({ done, total });

    try {
      for (let i = 0; i < insertRows.length; i += GOAL_CUTS_APPLY_CHUNK) {
        const chunk = insertRows.slice(i, i + GOAL_CUTS_APPLY_CHUNK);
        const { error } = await supabase.from(GOAL_CUTS_TABLE).insert(chunk);
        if (error) {
          throw new Error(
            `신규 등록 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`,
          );
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
      for (let i = 0; i < updateRows.length; i += GOAL_CUTS_APPLY_CHUNK) {
        const chunk = updateRows.slice(i, i + GOAL_CUTS_APPLY_CHUNK);
        const { error } = await supabase
          .from(GOAL_CUTS_TABLE)
          .upsert(chunk, { onConflict: "id" });
        if (error) {
          throw new Error(
            `수정 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`,
          );
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
    } catch (err) {
      setApplying(false);
      setApplyProgress(null);
      alert(
        `엑셀 적용 실패 — 이미 반영된 청크는 되돌려지지 않습니다(청크 단위 배치라 단일 트랜잭션이 아님). ${err.message}`,
      );
      onReload?.();
      return;
    }

    const { summary } = parseResult;
    setApplying(false);
    setApplyProgress(null);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
    goalCutsCount()
      .then((count) => setTotalRowCount(count))
      .catch(() => {});
    onReload?.();
    alert(
      `엑셀 적용 완료 — 신규 ${summary.willInsert}건 · 수정 ${summary.willUpdate}건 · 거부 ${summary.willSkip}건.`,
    );
  }

  const affectedCount = parseResult
    ? parseResult.summary.willInsert + parseResult.summary.willUpdate
    : 0;

  return (
    <div className="bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-black">엑셀 일괄 관리</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fetchProgress
              ? `읽는 중… ${fetchProgress.done.toLocaleString()} / ${fetchProgress.total.toLocaleString()}행`
              : downloadScope === "jungsiTemplate"
                ? "엑셀 다운로드 (정시 컷 템플릿)"
                : `엑셀 다운로드 (전체 ${totalRowCount === null ? "-" : totalRowCount.toLocaleString()}행)`}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {idMapProgress
              ? `업로드 검증 준비 중… ${idMapProgress.done.toLocaleString()} / ${idMapProgress.total.toLocaleString()}행`
              : "엑셀 업로드"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            aria-label="목표관리 대학 컷 xlsx 파일 선택"
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-black">다운로드 범위</span>
        {[
          { value: "all", label: "전체" },
          { value: "jungsiTemplate", label: "정시 컷 없는 조합(정시 템플릿)" },
        ].map((scope) => (
          <label
            key={scope.value}
            className="flex items-center gap-1 font-bold"
          >
            <input
              type="radio"
              name="goalCutsDownloadScope"
              checked={downloadScope === scope.value}
              disabled={busy}
              onChange={() => setDownloadScope(scope.value)}
            />
            {scope.label}
          </label>
        ))}
      </div>

      {exportTruncatedCells.length > 0 && (
        <div className="mt-3 rounded-sm border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <p>
            {exportTruncatedCells.length}개 셀이 문자 수 한도(32,767자)를 넘어
            잘린 채로 다운로드됐습니다. 이 파일을 그대로 재업로드하면 해당 행은
            자동으로 거부됩니다(데이터 손상 아님).
          </p>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {withDedupedKeys(parseErrors).map(({ item: message, key }) => (
            <p key={key}>{message}</p>
          ))}
        </div>
      )}

      {parseResult && (
        <div className="mt-3 rounded-sm border border-[#2348ff] bg-[#eef2ff] p-4 text-xs">
          <p className="font-black text-[#2348ff]">
            신규 {parseResult.summary.willInsert}건 · 수정{" "}
            {parseResult.summary.willUpdate}건 · 거부{" "}
            {parseResult.summary.willSkip}건 · 경고{" "}
            {Object.values(parseResult.summary.warningCounts || {}).reduce(
              (sum, n) => sum + n,
              0,
            )}
            건
          </p>

          {parseResult.errors.length > 0 && (
            <div className="mt-3 rounded-sm border border-red-300 bg-red-50 p-2">
              <p className="font-black text-red-600">
                거부된 행 {parseResult.errors.length}건(적용 대상에서 완전히
                제외됩니다)
              </p>
              <ul className="mt-1 space-y-1">
                {withDedupedKeys(
                  parseResult.errors,
                  (err) =>
                    `${err.row}-${err.universityName}-${err.departmentName}-${err.reason}`,
                ).map(({ item: err, key }) => (
                  <li key={key} className="text-red-700">
                    행 {err.row + 1} ·{" "}
                    {String(err.universityName || "(대학명 없음)")} ·{" "}
                    {String(err.departmentName || "(학과명 없음)")} —{" "}
                    {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 건수는 lib 이 준 warningCounts 에서 합산한다 — UI 는 reason
              문자열을 파싱하지 않고 type 으로만 분기·집계한다. */}
          {GOAL_CUTS_WARNING_GROUPS.map((group) => {
            const groupCount = group.types.reduce(
              (sum, t) => sum + (parseResult.summary.warningCounts?.[t] || 0),
              0,
            );
            if (groupCount === 0) return null;
            const items = parseResult.warnings.filter((w) =>
              group.types.includes(w.type),
            );
            const isOpen = Boolean(expandedGroups[group.key]);
            return (
              <div
                key={group.key}
                className={`mt-3 rounded-sm border p-2 ${GOAL_CUTS_TONE_CLASS[group.tone]}`}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between text-left font-black"
                >
                  <span>
                    {group.label} — {groupCount}건
                  </span>
                  <span>{isOpen ? "접기" : "자세히 보기"}</span>
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1 font-normal">
                    {withDedupedKeys(
                      items,
                      (w) =>
                        `${w.row}-${w.universityName}-${w.departmentName}-${w.column}-${w.reason}`,
                    ).map(({ item: w, key }) => (
                      <li key={key}>
                        행 {w.row + 1} ·{" "}
                        {String(w.universityName || "(대학명 없음)")} ·{" "}
                        {String(w.departmentName || "(학과명 없음)")}
                        {w.column ? ` · ${w.column}` : ""} — {w.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <p className="mt-3 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
            되돌릴 수 없는 작업입니다 — 최대 {affectedCount}행이 일괄
            반영됩니다.
          </p>

          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            영향받는 {affectedCount}행을 확인했습니다
          </label>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={!confirmChecked || applying}
              className="h-9 bg-[#2348ff] px-4 font-black text-white disabled:opacity-50"
            >
              {(() => {
                if (!applying) return "적용";
                if (applyProgress)
                  return `적용 중… ${applyProgress.done.toLocaleString()} / ${applyProgress.total.toLocaleString()}행`;
                return "적용 중…";
              })()}
            </button>
            <button
              type="button"
              onClick={cancelPreview}
              disabled={applying}
              className="h-9 border border-gray-400 bg-white px-4 font-bold disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// LIST_SUMMARY_REGISTRY.goalCutsListSummary(config.listSummaryKey="goalCutsListSummary")의
// 진입점. 그 레지스트리가 모듈 초기화 시점에 이 참조를 평가하므로 **반드시
// function 선언문이어야 한다**(const 화살표 함수로 쓰면 TDZ ReferenceError 로
// 어드민 전체가 죽는다).
//
// props 는 { rows, onReload, mutationSeq } 지만 rows 는 쓰지 않는다 —
// serverPaginate 탭이라 현재 페이지 10행뿐이다.
function GoalCutsListSummary({ onReload, mutationSeq }) {
  // 백필·엑셀 적용 후 H-1 현황 요약도 같이 갱신되게 하는 토큰.
  const [refreshToken, setRefreshToken] = useState(0);
  function handleReload() {
    setRefreshToken((t) => t + 1);
    onReload?.();
  }
  return (
    <div className="mb-6 space-y-4">
      {/* 갱신 신호가 둘이다 — 이 컴포넌트 안의 백필·엑셀 적용(refreshToken)과
          목록의 등록·수정·삭제(mutationSeq, Admin()이 내려 준다). 둘 중 무엇이
          바뀌어도 집계를 다시 읽어야 화면 숫자가 DB와 어긋나지 않는다. */}
      <GoalCutsOverviewBlock
        refreshToken={refreshToken}
        mutationSeq={mutationSeq}
      />
      <GoalCutsBackfillPanel onReload={handleReload} />
      <GoalCutsBulkXlsxPanel onReload={handleReload} />
    </div>
  );
}

function AcceptanceRateSummary({ rows }) {
  const active = (rows || []).filter((row) => row.is_active);
  if (active.length === 0) return null;

  const average =
    active.reduce((sum, row) => sum + Number(row.rate || 0), 0) / active.length;

  return (
    <div className="mb-6 grid grid-cols-2 bg-white text-center text-sm shadow-sm">
      <div className="border p-4">
        <div className="font-black">노출 연도 수</div>
        <div className="mt-2 font-bold">{active.length}개년</div>
      </div>
      <div className="border p-4">
        <div className="font-black">홈페이지 표시값</div>
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
        <div className="font-black">판매금액 합계</div>
        <div className="mt-2 font-bold">{sale.toLocaleString()}원</div>
      </div>
      <div className="border p-4">
        <div className="font-black">감면액 합계</div>
        <div className="mt-2 font-bold">{discount.toLocaleString()}원</div>
      </div>
      <div className="border p-4">
        <div className="font-black">실 납부금액 합계</div>
        <div className="mt-2 font-bold text-blue-600">
          {paid.toLocaleString()}원
        </div>
      </div>
      <div className="border p-4">
        <div className="font-black">환불금액 합계</div>
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
export function AdminSectionRoute({ section }: { section: string }) {
  const activeKey = section;
  const navigate = useNavigate();
  const location = useLocation();
  // 다른 섹션에서 navigateWithPrefill로 건너온 1회성 등록 프리필(§4-3-C-4 원클릭
  // 컷 만들기). react-router의 location.state로 나른다 — 예전에는 같은 컴포넌트
  // 인스턴스 안에서 setActiveKey 다음에 setPendingCreateDefaults를 같은 배치로
  // 불러 순서만 보장하면 됐지만, 지금은 탭 전환이 실제 라우트 전환(다른 컴포넌트
  // 인스턴스로 마운트)이라 이동 전 인스턴스의 state를 그대로 넘길 수 없다.
  const initialPrefill = location.state?.prefillCreateDefaults ?? null;
  const [mode, setMode] = useState(initialPrefill ? "create" : "list");
  const [editingRow, setEditingRow] = useState<AdminRow | null>(null);
  // 목록 셀 [수정]으로 진입할 때 폼이 마운트되자마자 열 섹션 키. null이면
  // 기존 ✏️ 경로(폼 화면부터). AdminForm의 initialSection/origin으로만 쓰인다.
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  // 다른 탭에서 넘겨 온 신규 등록 프리필. pendingSection과 같은 성격이지만
  // 결정적으로 다른 점이 하나 있다 — changeTab이 이 값을 지우지 않는다.
  // 공급자(학생 상세의 "이 조합의 컷 만들기")가 navigateWithPrefill로 탭을 옮긴 뒤
  // 폼을 여는 구조라, 여기서 리셋하면 프리필이 통째로 사라진다.
  // 대신 소비 직후(취소·저장) 와 수동 [등록] 클릭 시 비운다 — 1회성 값이다.
  // 기본값 null이라 이 state를 쓰지 않는 기존 44개 탭은 동작이 바뀌지 않는다.
  const [pendingCreateDefaults, setPendingCreateDefaults] =
    useState<Partial<AdminRow> | null>(initialPrefill);
  // location.state는 History API의 history.state에 실려 새로고침 후에도 남는다 —
  // 마운트 시 1회 소비한 뒤 지워서, 이 섹션에서 새로고침해도 프리필이 재적용되지
  // 않게 한다(등록 폼이 반복해서 다시 뜨는 걸 막는다). 마운트 시점 값만 봐야 하는
  // 1회성 효과라 initialPrefill/navigate/location을 deps에 넣지 않는다 — 넣으면
  // 정리 직후(state: null) 자기 자신이 다시 걸려 무한 반복하거나, 이후 같은
  // 섹션 안에서의 navigate 호출에도 재실행된다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 위 설명 참고 — 마운트 1회성 효과.
  useEffect(() => {
    if (!initialPrefill) return;
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 목록 CRUD(등록·수정·삭제) 성공 횟수. ListSummary가 "자기 집계를 다시 읽어야
  // 하는 시점"을 아는 유일한 신호다 — loadRows()는 목록 rows만 새로 받고
  // ListSummary가 스스로 던지는 집계 쿼리(예: GoalCutsOverviewBlock의 head
  // 카운트 6종)는 건드리지 않아서, 행을 지워도 상단 요약이 옛 숫자를 그대로
  // 보여 준다. page/keyword 변경으로는 올라가지 않으므로 페이지 이동마다
  // 집계를 다시 던지는 낭비도 없다.
  const [mutationSeq, setMutationSeq] = useState(0);
  // 관리 열 ⚙️(메타 전용 모달)이 열려 있는 행. null이면 닫힘 — mode는
  // 'list'로 그대로 두고 오버레이만 뜬다(목록 셀 [수정]과 같은 1뎁스 UX).
  const [metaEditRow, setMetaEditRow] = useState<AdminRow | null>(null);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [keyword, setKeyword] = useState("");
  // 서버 페이지네이션 탭에서 실제로 서버로 나가는 검색어. keyword는 타이핑마다
  // 바뀌므로 그대로 쓰면 글자당 한 번씩 조회가 나간다 — 디바운스한 값만 넘긴다.
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  // 서버 페이지네이션 탭의 전체 건수(select count). 전량 로드 탭은 rows.length가
  // 곧 전체라 이 값을 쓰지 않는다.
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  // CSV 청크 내보내기 진행 상태. null이면 진행 중 아님.
  const [exporting, setExporting] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // 개인정보 반출 게이트 — 모달 상태를 이 훅이 들고, gate 를 아래 트리에 그린다.
  const { requestAccess, gate } = useSensitiveActionGate();

  // 목록 상단 드롭다운 필터의 선택값(QA 227). 메뉴를 옮기면 아래 effect 가 비운다 —
  // 종목 목록이 섹션마다 달라 이전 선택이 남으면 결과가 통째로 0건이 된다.
  const [listFilterValue, setListFilterValue] = useState("");

  const config = CONFIGS[activeKey];
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
    const base =
      key && activeListFilter
        ? rows.filter(
            (row) => String(row[key] ?? "").trim() === activeListFilter,
          )
        : rows;

    const q = keyword.trim().toLowerCase();
    if (!q) return base;
    return base.filter((row) => searchable(row).includes(q));
  }, [
    rows,
    keyword,
    config.serverPaginate,
    config.listFilter?.key,
    activeListFilter,
  ]);

  // 목록 조회 쿼리(필터 + 검색 + 정렬)를 한 곳에서 만든다 — loadRows와 CSV 청크
  // 내보내기가 같은 조건을 봐야 "화면에서 본 것"과 "받은 파일"이 어긋나지 않는다.
  // 범위(.range)와 count는 호출부가 붙인다.
  // exactOptionalPropertyTypes: 호출부(loadRows)가 `count: paginate ? "exact" : undefined`로
  // undefined를 명시적으로 넘기므로 undefined도 프로퍼티 타입에 포함한다.
  function buildListQuery({ count }: { count?: "exact" | undefined } = {}) {
    // 목록만 조인 뷰에서 읽는 섹션이 있다(config.listTable, QA 272). 쓰기 경로는
    // 아래 saveRow/deleteRow 가 그대로 config.table 을 쓴다 — 조인 뷰는 쓰기가 안 된다.
    let query = supabase
      .from(config.listTable || config.table)
      .select("*", count ? { count } : undefined);

    if (config.fixedCategories) {
      query = query.in("category", config.fixedCategories);
    }

    if (config.fixedValues) {
      for (const [key, value] of Object.entries(config.fixedValues)) {
        query = query.eq(key, value);
      }
    }

    // 서버 검색은 서버 페이지네이션 탭에만 있다. 그 외 탭은 전량을 들고 있으므로
    // 예전처럼 filteredRows가 클라이언트에서 거른다.
    if (config.serverPaginate && searchTerm && config.searchColumns?.length) {
      // PostgREST or()는 콤마로 조건을, 괄호로 그룹을 끊는다. 검색어에 그 문자가
      // 들어오면 구문 자체가 깨지고, %·_ 는 ilike 와일드카드로 새는 값이다.
      const safe = searchTerm.replace(/[,()%_\\*]/g, " ").trim();
      if (safe) {
        query = query.or(
          config.searchColumns
            .map((column) => `${column}.ilike.%${safe}%`)
            .join(","),
        );
      }
    }

    const orderColumn = config.order || "created_at";

    if (Array.isArray(config.orderBy)) {
      // 테이블별 정렬 오버라이드 — 선언한 설정에만 적용되고 다른 탭은 아래 기본 분기를 그대로 탄다
      for (const [column, ascending] of config.orderBy) {
        query = query.order(column, { ascending });
      }
    } else if (config.fixedCategories) {
      query = query
        .order("is_pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
    } else {
      query = query.order(orderColumn, {
        ascending: orderColumn === "sort_order",
      });
    }

    return query;
  }

  async function loadRows() {
    setLoading(true);

    if (config.custom || config.comingSoon) {
      setRows([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    // 서버 페이지네이션 탭(입결 43,170행)은 현재 페이지 PAGE_SIZE행만 받는다.
    // 예전에는 모든 탭이 select('*')로 전량을 끌어와 PostgREST 기본 1,000행
    // 상한에 걸렸고(그래서 43k행 중 1,000행만 보였다), PAGE_SIZE는 그렇게 받아온
    // 배열을 화면에서 자르는 클라이언트 슬라이스일 뿐이었다.
    const paginate = Boolean(config.serverPaginate);
    let query = buildListQuery({ count: paginate ? "exact" : undefined });

    if (paginate) {
      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);
    }

    const { data, error, count } = await query;

    setLoading(false);

    if (error) {
      reportAdminError(`${config.title} 조회 실패`, error);
      setRows([]);
      setTotalCount(0);
      return;
    }

    const hiddenPageSlugs = [
      "admission-susi",
      "admission-jungsi",
      "admission-essay",
      "winning-faq",
    ];

    const nextRows =
      activeKey === "pageContents"
        ? (data || []).filter((row) => !hiddenPageSlugs.includes(row.slug))
        : data || [];

    setRows(nextRows);
    setTotalCount(paginate ? (count ?? 0) : nextRows.length);
  }

  // 탭 전환. 이제 activeKey는 다른 <Route>로의 실제 이동이다 — 이동한 순간 이
  // 컴포넌트는 언마운트되고 목적지 섹션의 인스턴스가 새로 마운트되므로,
  // 예전처럼 mode/editingRow/pendingSection/keyword/searchTerm/page를 손으로
  // 하나하나 리셋할 필요가 없다(각 useState 초기값이 그 일을 대신한다).
  function changeTab(key: string) {
    navigate(`/admin/${key}`);
  }

  // "이 조합의 컷 만들기"(§4-3-C-4) 전용 — 다른 섹션으로 이동하면서 그 섹션의
  // 등록 폼을 프리필값과 함께 바로 연다. 일반 changeTab과 분리한 이유: 프리필값은
  // location.state로 실어야 목적지 인스턴스(마운트 시점)가 읽을 수 있다 — 지금
  // 인스턴스의 setState는 이동과 동시에 버려진다.
  function navigateWithPrefill(
    key: string,
    prefillCreateDefaults: Record<string, unknown>,
  ) {
    navigate(`/admin/${key}`, { state: { prefillCreateDefaults } });
  }

  // 검색어 디바운스. 확정되는 순간 1페이지로 되돌린다 — 5페이지를 보다 검색하면
  // 결과가 5페이지에 못 미쳐 빈 목록이 뜬다. 두 setState를 같은 타이머 안에서
  // 부르므로 렌더는 1회, 따라서 조회도 1회다.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(keyword.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [keyword]);

  // 조회 트리거. 서버 페이지네이션 탭만 page/searchTerm 변화에 반응한다 —
  // 그 외 탭은 아래 두 값이 상수라 예전처럼 탭 전환 시 1회만 조회한다.
  const serverPage = config.serverPaginate ? page : 0;
  const serverTerm = config.serverPaginate ? searchTerm : "";

  // 실제 조회 트리거는 activeKey/serverPage/serverTerm 세 값이고, loadRows는 그 시점의
  // 클로저를 그대로 쓴다(useEffectEvent로 감싸 매 렌더 새로 생성되는 loadRows를 deps에서 뺀다).
  // 트리거 값을 인자로 넘겨 exhaustive-deps가 이 effect의 실사용 의존성으로 인식하게 한다.
  const onRowsTriggerChange = useEffectEvent(
    (
      _activeKey: typeof activeKey,
      _serverPage: number,
      _serverTerm: string,
    ) => {
      loadRows();
    },
  );

  useEffect(() => {
    onRowsTriggerChange(activeKey, serverPage, serverTerm);
  }, [activeKey, serverPage, serverTerm]);

  // 삭제 등으로 총 건수가 줄어 현재 페이지가 범위를 벗어나면 마지막 페이지로 당긴다.
  useEffect(() => {
    if (!config.serverPaginate || totalCount === 0) return;
    const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page > lastPage) setPage(lastPage);
  }, [config.serverPaginate, totalCount, page]);

  // uploadImage는 컴포넌트 상태에 의존하지 않는 순수 함수라 모듈 스코프로 뺐다 — PremiumBookAdmin의
  // 제네릭 개별 페이지 편집(AdminForm onUpload)에서도 그대로 재사용한다. 정의는 파일 하단, Admin() 선언
  // 직전 참고.

  function createRow() {
    setEditingRow(null);
    setPendingSection(null);
    // 목록의 [등록] 버튼으로 들어온 신규 등록은 항상 백지에서 시작한다 —
    // 남아 있던 프리필이 묻어 들어가면 안 된다.
    setPendingCreateDefaults(null);
    setMode("create");
  }

  function editRow(row) {
    setEditingRow(row);
    setPendingSection(null);
    setMode("edit");
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
    if (config.confirmBeforeSave && !window.confirm(config.confirmBeforeSave)) {
      return;
    }

    const payload = config.formToPayload
      ? config.formToPayload(form)
      : { ...form };

    if (
      config.fixedCategories &&
      !config.fixedCategories.includes(payload.category)
    ) {
      alert("수시 또는 정시 구분을 선택해 주세요.");
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

    // QA 행337 — sort_order를 특정 값으로 지정해 저장하면 그 값(과 그 뒤로 이어지는
    // 연속 구간)을 이미 쓰고 있는 다른 행들을 +1씩 밀어 "정확히 그 자리에 꽂힌다"는
    // 기대를 만족시킨다. getNextSortOrder(formFields.tsx)는 신규 등록 시 max+1만
    // 계산해 이 재배열을 대신하지 않는다. sort_order 필드가 없는 섹션(대다수
    // custom:true 포함)은 손대지 않는다 — 클라이언트 처리만, DB 함수/마이그레이션 없음.
    const hasSortOrderField = config.fields?.some(
      (field) => field.key === "sort_order",
    );
    if (hasSortOrderField && Number.isFinite(Number(payload.sort_order))) {
      const targetSortOrder = Number(payload.sort_order);
      let conflictQuery = supabase
        .from(config.table)
        .select("id, sort_order")
        .gte("sort_order", targetSortOrder)
        .order("sort_order", { ascending: true });
      if (mode !== "create" && editingRow) {
        conflictQuery = conflictQuery.neq("id", editingRow.id);
      }
      const { data: conflictRows, error: conflictError } = await conflictQuery;
      if (conflictError) {
        reportAdminError("순서 재배열 조회 실패", conflictError);
        return;
      }

      // 지정값부터 빈틈없이 이어지는 구간만 민다(1,2,3,5 중 2를 지정하면 2·3만
      // 밀고 5는 그대로 둔다 — 이미 3과 5 사이가 비어 있어 충돌하지 않는다).
      const shiftTargets: { id: string; sort_order: number }[] = [];
      let expected = targetSortOrder;
      for (const conflictRow of conflictRows || []) {
        if (Number(conflictRow.sort_order) !== expected) break;
        shiftTargets.push(conflictRow);
        expected += 1;
      }

      // 충돌 최소화를 위해 큰 값부터 역순으로 민다.
      for (const shiftRow of shiftTargets.slice().reverse()) {
        const { error: shiftError } = await supabase
          .from(config.table)
          .update({ sort_order: Number(shiftRow.sort_order) + 1 })
          .eq("id", shiftRow.id);
        if (shiftError) {
          reportAdminError("순서 재배열 실패", shiftError);
          return;
        }
      }
    }

    let savedRow = null;

    if (mode === "create") {
      const { data, error } = await supabase
        .from(config.table)
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        reportAdminError("등록 실패", error, buildFieldLabels(config));
        return;
      }

      savedRow = data;
    } else {
      const { data, error } = await supabase
        .from(config.table)
        .update(payload)
        // mode !== 'create'인 이 분기는 editRow/openMetaEditFromRow(setMode('edit'))와
        // openRowSection(mode 'list' 유지, 섹션 모달 오버레이)이 전부 setEditingRow(row)를
        // 먼저 호출하는 계약 위에서만 도달한다 — editingRow는 항상 채워져 있다.
        .eq("id", editingRow!.id)
        .select("*")
        .single();

      if (error) {
        reportAdminError("수정 실패", error, buildFieldLabels(config));
        return;
      }

      savedRow = data;
    }

    if (shouldRequestWinningEmbedding(config, savedRow)) {
      requestWinningEmbedding(savedRow);
    }

    alert(
      !shouldRequestWinningEmbedding(config, savedRow)
        ? "저장 완료"
        : "저장 완료. 임베딩은 자동 생성 중입니다.",
    );
    setMode("list");
    setEditingRow(null);
    setPendingSection(null);
    setPendingCreateDefaults(null);
    setMutationSeq((seq) => seq + 1);
    await loadRows();
  }

  async function deleteRow(row) {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    const { error } = await supabase
      .from(config.table)
      .delete()
      .eq("id", row.id);

    if (error) {
      reportAdminError("삭제 실패", error, buildFieldLabels(config));
      return;
    }

    // 고아 방지 스펙 3: row가 참조하던 banners 이미지(image/multiImage/multiFile)를
    // 함께 지운다. blockEditor 본문 이미지는 collectBannerPaths가 애초에 보지
    // 않는다(주간 GC 몫). best-effort라 실패해도 행 삭제 자체는 이미 끝난 뒤다.
    const referencedPaths = collectBannerPaths(
      row,
      config.fields || config.columns,
    );
    if (referencedPaths.size > 0) removeBannerPaths(referencedPaths);

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
    if (!window.confirm("환불을 완료 처리하시겠습니까?")) return;

    const accessToken = await getFreshSupabaseAccessTokenOrSignOut();

    const response = await fetch("/api/complete-refund", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refundRequestId: row.id }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      // 토스 에러 메시지를 그대로 보여준다(팀 리드 지시) — reportAdminError의
      // WC 코드 매핑을 거치면 "요청을 처리하지 못했습니다"류 일반 문구로
      // 뭉개져 카드사·계좌 거부 사유(예: 이미 취소된 결제, 잔액 부족)가
      // 안 보인다. 여기는 admin 전용 화면이라 원문 노출 위험이 낮다.
      console.error("환불 완료 처리 실패:", result);
      alert(
        `환불 완료 처리 실패: ${result?.error || `HTTP ${response.status}`}`,
      );
      return;
    }

    alert("환불 완료 처리되었습니다.");
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

    const { error } = await supabase
      .from(config.table)
      .update(payload)
      .eq("id", row.id)
      .select("*")
      .single();

    if (error) {
      reportAdminError("수정 실패", error, buildFieldLabels(config));
      return false;
    }

    alert("저장 완료");
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

    requestAccess({
      action: "download",
      resourceKey: activeKey,
      title: `${config.title} 다운로드`,
      description: `${rowCount.toLocaleString()}건의 개인정보가 CSV 파일로 저장됩니다.`,
      rowCount,
      onGranted: downloadExcel,
    });
  }

  async function downloadExcel() {
    const filename = `${config.title}_${new Date().toISOString().slice(0, 10)}.csv`;

    // 전량 로드 탭은 화면 rows가 곧 전체다 — 기존 경로 그대로.
    if (!config.serverPaginate) {
      downloadCsv(filename, filteredRows, config.columns);
      return;
    }

    // 서버 페이지네이션 탭은 rows가 현재 페이지 10행뿐이라 그대로 쓰면 10행짜리
    // 파일이 나온다. 목록과 같은 조건(buildListQuery)으로 서버에서 EXPORT_CHUNK행씩
    // 끊어 받아, 청크마다 CSV 줄로 접어 모은다 — 43k행 행 객체를 한꺼번에 메모리에
    // 쌓지 않고, await 사이마다 진행률이 화면에 갱신된다.
    if (exporting) return;

    if (totalCount === 0) {
      alert("내보낼 데이터가 없습니다.");
      return;
    }

    const proceed = window.confirm(
      `${totalCount.toLocaleString()}건을 CSV로 내려받습니다.\n` +
        `${EXPORT_CHUNK.toLocaleString()}건씩 나눠 받으므로 건수가 많으면 수십 초가 걸리고, ` +
        `그동안 이 화면을 닫거나 다른 메뉴로 이동하면 안 됩니다.\n\n계속할까요?`,
    );

    if (!proceed) return;

    setExporting({ done: 0, total: totalCount });

    const parts: string[] = [];
    let done = 0;

    for (let from = 0; from < totalCount; from += EXPORT_CHUNK) {
      const { data, error } = await buildListQuery().range(
        from,
        from + EXPORT_CHUNK - 1,
      );

      if (error) {
        setExporting(null);
        reportAdminError("CSV 내보내기 실패", error);
        return;
      }

      // 빈 청크는 그 사이에 행이 지워졌다는 뜻 — 더 받아봐야 소용없다.
      if (!data || data.length === 0) break;

      parts.push(csvBody(data, config.columns));
      done += data.length;
      setExporting({ done, total: totalCount });
    }

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
      ) : mode === "list" ? (
        config.comingSoon ? (
          <div className="bg-white p-10 shadow-sm">
            <h1 className="text-2xl font-black text-[#111827]">
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
              <div className="mb-4 flex gap-2">
                {config.tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => changeTab(tab.key)}
                    className={`h-9 border px-5 text-sm font-black transition ${
                      activeKey === tab.key
                        ? "border-[#2348ff] bg-[#2348ff] text-white"
                        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            <div className="mb-6 bg-white px-6 py-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {!config.hideReset && (
                    <button
                      type="button"
                      onClick={loadRows}
                      className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
                    >
                      <RefreshCw size={14} />
                      초기화
                    </button>
                  )}

                  {(config.excel ||
                    ["members", "refunds"].includes(activeKey)) && (
                    <button
                      type="button"
                      onClick={handleDownloadClick}
                      disabled={Boolean(exporting)}
                      className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download size={14} />
                      {exporting
                        ? `내보내는 중 ${Math.floor((exporting.done / Math.max(1, exporting.total)) * 100)}%`
                        : "엑셀 다운로드"}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {config.listFilter && listFilterOptions.length > 0 && (
                    <select
                      value={activeListFilter}
                      onChange={(e) => {
                        setListFilterValue(e.target.value);
                        setPage(1);
                      }}
                      className="h-9 border border-gray-400 px-3 text-sm font-bold outline-hidden"
                    >
                      <option value="">{config.listFilter.allLabel}</option>
                      {listFilterOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={config.searchPlaceholder}
                    className="h-9 w-[320px] border border-gray-400 px-3 text-sm outline-hidden"
                  />
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1 border border-l-0 border-gray-500 bg-white px-4 text-sm font-bold"
                  >
                    <Search size={14} />
                    검색
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-black">{config.title}</h1>
                  {config.homepage && (
                    <div className="mt-1 space-y-1">
                      <p className="text-sm font-bold text-red-500">
                        이 메뉴에서 저장한 내용은 실제 홈페이지에 반영됩니다.
                      </p>

                      {config.guideText && (
                        <p className="whitespace-pre-line text-sm font-black leading-6 text-red-600">
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
                  <button
                    type="button"
                    onClick={createRow}
                    className="inline-flex h-9 items-center gap-1 bg-[#2348ff] px-4 text-sm font-black text-white shrink-0 whitespace-nowrap"
                  >
                    <Plus size={14} />
                    등록
                  </button>
                )}
              </div>

              {/* rowCapWarning은 "전량 로드가 1,000행 상한에 잘렸다"는 경고라
                      config.serverPaginate 탭에는 선언하지 않는다 — 그쪽은 .range()로
                      PAGE_SIZE행만 받고 전체 건수를 count로 따로 받으므로 상한 자체에
                      닿지 않는다. */}
              {config.rowCapWarning && rows.length >= 1000 && (
                <p className="mt-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm font-black leading-6 text-red-600">
                  조회된 건수가 1,000건에 도달했습니다 — Supabase 기본 조회
                  상한으로 오래된 신청 건이 목록에서 빠졌을 수 있습니다. 전체
                  건수가 아닙니다.
                </p>
              )}

              {exporting && (
                <p className="mt-4 rounded-sm border border-[#c7d2fe] bg-[#eef2ff] px-4 py-3 text-sm font-black leading-6 text-[#2348ff]">
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

            {loading ? (
              <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
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
                mode={mode}
                row={editingRow}
                origin="list"
                initialSection={pendingSection}
                onCancel={() => {
                  setEditingRow(null);
                  setPendingSection(null);
                }}
                onSave={saveRow}
                onUpload={uploadImage}
              />
            )}
          </>
        )
      ) : (
        <AdminForm
          config={config}
          mode={mode}
          row={editingRow}
          // 폼 화면 진입(editRow/createRow)은 항상 pendingSection이 null이다 —
          // 목록 [수정] 직행(openRowSection)은 이제 mode를 'list'로 둔 채 위
          // 목록 분기의 오버레이 AdminForm으로 렌더된다.
          origin="form"
          initialSection={null}
          createDefaults={pendingCreateDefaults}
          onCancel={() => {
            setMode("list");
            setEditingRow(null);
            setPendingSection(null);
            setPendingCreateDefaults(null);
          }}
          onSave={saveRow}
          onUpload={uploadImage}
        />
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
  const navigate = useNavigate();
  // 사이드바 하이라이트용 activeKey — 라우팅 매칭(어느 config를 쓸지 결정하는 것)에는
  // 관여하지 않는다. 그건 App.jsx의 개별 <Route path={key}> 매칭이 이미 끝낸 일이고,
  // 여기서는 그 결과인 URL을 보고 "지금 어느 메뉴가 눌려 있어 보여야 하는가"만 고른다.
  const activeKey =
    location.pathname.replace(/^\/admin\/?/, "") || ADMIN_DEFAULT_SECTION_KEY;

  function changeTab(key: string) {
    navigate(`/admin/${key}`);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace("/");
  }

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-[#111827]">
      <AdminSidebar activeKey={activeKey} setActiveKey={changeTab} />
      <AdminTopbar onLogout={logout} />

      <main className="ml-[224px] pt-[56px]">
        <div className="min-h-[calc(100vh-56px)] px-7 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
