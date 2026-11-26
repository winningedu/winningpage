import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Eye, RotateCcw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addDaysYMD,
  CONDITION_MULTIPLIER,
  getSchoolCutType,
  VIRTUAL_DAY_NAMES,
} from "@/lib/goal/calc/index.js";
import { ApiError } from "@/lib/http/client";
import { ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";
import { PAGE_SIZE } from "@/pages/admin/shared/AdminEngine";
import AdminPagination from "@/pages/admin/shared/AdminPagination";
import { AdminTableFrame } from "@/pages/admin/shared/AdminTableFrame";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import { toastSuccess } from "@/pages/admin/shared/adminToast";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";
import { formatValue } from "@/pages/admin/shared/csvExport";
import {
  ActionButton,
  Field,
  GOAL_CUT_SOURCE_OPTIONS,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import { listResendCandidates, type ResendKind } from "./reportResendOptions";
import {
  fetchGoalStudentDetail,
  fetchGoalStudentRecords,
  fetchGoalStudents,
  type GoalStudentFilter,
  goalStudentKeys,
  resendGoalReport,
  resetGoalStudent,
} from "./studentsApi";

// 이 파일 로컬 전용 타입(새 전역 타입 파일 없음). goal_students/goal_student_state는
// 파생·원자료 컬럼이 매우 많은 넓은 테이블/뷰라 실제로 읽는 필드만 명시하고
// 나머지(rate_*/base_*/cum_* 등 GOAL_GAUGE_ROWS·GOAL_CUT_SLOTS가 동적으로 읽는
// 파생 컬럼)는 인덱스 시그니처로 연다.
export interface GoalStudentRow {
  profile_id: string;
  grade?: string | null;
  school_type?: string | null;
  status?: string | null;
  ideal_university?: string | null;
  ideal_department?: string | null;
  min_university?: string | null;
  min_department?: string | null;
  current_mogo?: number | string | null;
  current_score?: number | string | null;
  converted_grade?: number | string | null;
  remain_naesin?: number | string | null;
  remain_mogo?: number | string | null;
  last_naesin_exam?: string | null;
  last_mogo_exam?: string | null;
  week_ideal?: number | string | null;
  week_min?: number | string | null;
  naesin_scores?: { priorNaesinGrade?: number | string | null } | null;
  mock_exam_scores?: unknown;
  study_schedule?: Record<
    string,
    { ideal?: number | string | null; min?: number | string | null } | undefined
  > | null;
  onboarded_at?: string | null;
  actual_start_date?: string | null;
  [key: string]: unknown;
}

export interface GoalStateRow {
  profile_id: string;
  status?: string | null;
  record_count?: number | null;
  last_record_date?: string | null;
  onboarded_at?: string | null;
  ideal_susi?: number | null;
  ideal_jungsi?: number | null;
  min_susi?: number | null;
  min_jungsi?: number | null;
  [key: string]: unknown;
}

export interface GoalProfileRow {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

// 목록 1행 — 뷰(goal_student_state) + goal_students/profiles 조인 결과를 이
// 컴포넌트가 클라이언트에서 합성한다(loadList 참고).
export interface GoalListRow extends GoalStateRow {
  student: GoalStudentRow | null;
  profile: GoalProfileRow | null;
}

export interface GoalProbabilityLogRow {
  // goal_probability_logs.id는 identity 정수 PK다(생성 타입 대조 결과).
  id: number;
  created_at?: string | null;
  reason?: string | null;
  ideal_susi?: number | null;
  ideal_jungsi?: number | null;
  min_susi?: number | null;
  min_jungsi?: number | null;
  source_record_id?: string | number | null;
  [key: string]: unknown;
}

export interface GoalDailyRecordRow {
  // goal_daily_records.id도 identity 정수 PK다(생성 타입 대조 결과).
  id: number;
  record_index?: number | null;
  record_date?: string | null;
  submitted_on?: string | null;
  virtual_day_index?: number | null;
  study_hours?: number | string | null;
  target_ideal_hours?: number | string | null;
  target_min_hours?: number | string | null;
  body_condition?: string | null;
  tasks?: string[] | null;
  memo?: string | null;
  delta_ideal_susi?: number | null;
  delta_ideal_jungsi?: number | null;
  delta_min_susi?: number | null;
  delta_min_jungsi?: number | null;
  [key: string]: unknown;
}

export interface GoalUniversityCutRow {
  avg_cut?: number | null;
  source?: string | null;
  source_year?: number | string | null;
  updated_at?: string | null;
}

interface GoalCutSlot {
  key: string;
  label: string;
  snapshotKey: string;
  side: "ideal" | "min";
  axis: "naesin" | "jungsi";
}

interface GoalDescribedCutSlot extends GoalCutSlot {
  cutType: string;
  university: string;
  department: string;
}

interface GoalGaugeRowDef {
  label: string;
  base: string;
  cum: string;
  now: string;
  rate: string;
}

interface GoalRiskFlag {
  key: string;
  tone: "red" | "orange" | "gray";
  label: string;
}

// customComponentKey="goalStudents" config — admin-shared-configs 배치의 CONFIGS
// shape과 맞물리지만, 이 컴포넌트가 실제로 읽는 필드만 로컬로 추론한다.
interface GoalStudentsAdminConfig {
  title: string;
  searchPlaceholder?: string;
  [key: string]: unknown;
}

// goal_students.status. sql/55 의 CHECK 제약과 동일 집합.
// awaiting_cuts = 온보딩은 제출했으나 컷이 없어 확률이 산출되지 않은 상태.
const GOAL_STUDENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "진행중" },
  { value: "awaiting_cuts", label: "컷 대기" },
  { value: "paused", label: "정지" },
];

// ===========================================================================
// 목표관리 학생 현황 (docs/figma-goal/goal-admin-spec.md §4-3)
//
// custom: true + customComponentKey 라 공용 목록·폼·검색·페이지네이션이 전부
// 비활성화된다(loadRows 조기 반환 + custom 삼항). 검색·필터·페이지네이션·상세를
// 이 블록 안에서 전부 그린다.
//
// 🔴 쓰기 UI 0개(§3-D6 / §3-D7). 이 블록 안에 supabase 의 insert/update/delete/
//    upsert 호출이 단 하나도 없어야 한다. DB 쪽도 goal_students /
//    goal_daily_records / goal_probability_logs 의 어드민 정책이 for select 로
//    좁혀져 있어(sql/83_goal_admin_options_rls.sql) 시도해도 통과하지 않는다.
// 🔴 CSV/엑셀 내보내기 경로를 만들지 않는다(§3-D6). downloadCsv 계열을 호출하지 말 것.
// 🔴 계산 엔진(src/lib/goal/calc/**)은 import 만 한다 — 한 글자도 고치지 않는다.
// ===========================================================================

// 목록 필터 버튼. key 가 'all' 이 아니면 전부 **서버 술어**로 나간다 —
// 클라이언트 필터와 서버 페이지네이션을 섞으면 페이지 경계가 무너진다(§4-3-B).
// 검색 선행 조회(profiles)의 상한. goal_student_state 에는 이름·연락처가 없어
// id 집합을 먼저 얻어야 하는데, 그 조회가 잘리면 초과분 학생이 결과에서 조용히
// 사라진다. 상한에 닿으면 화면에 절단 사실을 띄운다(searchTruncated).
const PROFILE_SEARCH_LIMIT = 500;
const SEARCH_DEBOUNCE_MS = 300;
const MS_PER_DAY = 86400000;
// 온보딩 리셋 성공 토스트가 읽히도록 새로고침을 늦추는 시간.
const RELOAD_DELAY_MS = 2000;

const GOAL_STUDENT_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "awaiting_cuts", label: "컷 대기" },
  { key: "noSubmitToday", label: "오늘 미제출" },
  { key: "noRecord", label: "기록 없음" },
  { key: "paused", label: "정지" },
];

// 상세 상단 안내에 쓰는 컷 4종의 표시 순서/라벨. api/_lib/goal/repo.ts:37 CUT_KEYS 와 같은 순서다.
const GOAL_CUT_SLOTS: GoalCutSlot[] = [
  {
    key: "idealNaesin",
    label: "상한 내신",
    snapshotKey: "ideal_naesin_cut",
    side: "ideal",
    axis: "naesin",
  },
  {
    key: "idealJungsi",
    label: "상한 정시",
    snapshotKey: "ideal_jungsi_cut",
    side: "ideal",
    axis: "jungsi",
  },
  {
    key: "minNaesin",
    label: "하한 내신",
    snapshotKey: "min_naesin_cut",
    side: "min",
    axis: "naesin",
  },
  {
    key: "minJungsi",
    label: "하한 정시",
    snapshotKey: "min_jungsi_cut",
    side: "min",
    axis: "jungsi",
  },
];

// 게이지 분해(§4-3-C-2) 4행. 뷰가 base / cum / 최종값을 한 행에 나란히 갖고 있다.
const GOAL_GAUGE_ROWS: GoalGaugeRowDef[] = [
  {
    label: "상한 수시",
    base: "base_ideal_susi",
    cum: "cum_ideal_susi",
    now: "ideal_susi",
    rate: "rate_ideal_susi",
  },
  {
    label: "상한 정시",
    base: "base_ideal_jungsi",
    cum: "cum_ideal_jungsi",
    now: "ideal_jungsi",
    rate: "rate_ideal_jungsi",
  },
  {
    label: "하한 수시",
    base: "base_min_susi",
    cum: "cum_min_susi",
    now: "min_susi",
    rate: "rate_min_susi",
  },
  {
    label: "하한 정시",
    base: "base_min_jungsi",
    cum: "cum_min_jungsi",
    now: "min_jungsi",
    rate: "rate_min_jungsi",
  },
];

const GOAL_WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function goalOptionLabel(
  options: { value: string; label: string }[],
  value: string | null | undefined,
) {
  const matched = options.find((option) => option.value === value);
  return matched ? matched.label : value || "-";
}

function goalTrim(value: unknown) {
  return String(value ?? "").trim();
}

function goalNum(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// 🔴 null 과 0 은 다른 상태다. base_* 가 null 이면 뷰의 최종값도 null 이고
//    (sql/55 의 case when ... is null then null 가드) 그건 "컷 미확보로 미산출"이다.
//    0 은 "확률 0%"다. 같은 회색 텍스트로 뭉개면 관리자가 컷 누락을 결함으로 신고한다.
function GoalProb({
  value,
  digits = 2,
  suffix = "%",
}: {
  value: unknown;
  digits?: number;
  suffix?: string;
}) {
  const parsed = goalNum(value);
  if (parsed === null)
    return <span className="font-medium text-muted-foreground">미산출</span>;
  return (
    <span>
      {parsed.toFixed(digits)}
      {suffix}
    </span>
  );
}

// exactOptionalPropertyTypes: 호출부의 row.status가 string | null | undefined라
// undefined도 프로퍼티 타입에 명시한다(값 자체는 기존과 동일하게 optional 취급).
function GoalStatusBadge({ status }: { status?: string | null | undefined }) {
  const tone =
    status === "awaiting_cuts"
      ? "border-[#B88737]/40 bg-[#FFF8E8] text-[#7A4A12]"
      : status === "paused"
        ? "border-border bg-muted text-gray-600"
        : "border-primary/30 bg-primary/10 text-primary";

  return (
    <Badge variant="outline" className={tone}>
      {goalOptionLabel(GOAL_STUDENT_STATUS_OPTIONS, status)}
    </Badge>
  );
}

function GoalRiskBadge({
  tone,
  children,
}: {
  tone: string;
  children: ReactNode;
}) {
  const cls =
    tone === "red"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : tone === "orange"
        ? "border-[#B88737]/40 bg-[#FFF8E8] text-[#7A4A12]"
        : "border-border bg-muted text-gray-600";

  return (
    <Badge variant="outline" className={`text-[0.6875rem] ${cls}`}>
      {children}
    </Badge>
  );
}

// 안내 문구 카드. 진단 힌트(§4-3-C-1 / §4-3-C-5)와 상태 안내(§4-3-C-3)가 공유한다.
function GoalNotice({
  tone = "info",
  children,
}: {
  tone?: string;
  children: ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : tone === "warn"
        ? "border-[#B88737]/40 bg-[#FFF8E8] text-[#7A4A12]"
        : "border-border bg-muted/50 text-gray-600";

  return (
    <div className={`border px-4 py-3 text-sm font-medium leading-6 ${cls}`}>
      {children}
    </div>
  );
}

// riskFlags 4종(§4-3-B). 전부 goal_student_state 한 행에서 나온다 — 목록용 추가 쿼리 0회.
// 원본 target/api/student.mjs:571-575 의 '공부시간 감소'(최근 7일 vs 이전 7일)는
// goal_daily_records 가 0행이고 daily-record API 도 미배포라 지금 산출할 수 없다.
// 정의만 남기고 켜지 않는다(§4-3-B 각주).
function buildGoalRiskFlags(row: GoalListRow, todayYMD: string) {
  const flags: GoalRiskFlag[] = [];
  const last = row.last_record_date || null;
  const weekAgo = addDaysYMD(todayYMD, -7);

  if (row.status === "awaiting_cuts")
    flags.push({ key: "awaiting", tone: "orange", label: "컷 대기" });
  if (Number(row.record_count || 0) === 0)
    flags.push({ key: "noRecord", tone: "red", label: "기록 없음" });
  // last 가 null 이면 두 비교 모두 false 다 — 그 상태는 '기록 없음' 이 이미 표현한다.
  if (last && last < todayYMD)
    flags.push({ key: "today", tone: "gray", label: "오늘 미제출" });
  if (last && last < weekAgo)
    flags.push({ key: "week", tone: "red", label: "최근 7일 기록 없음" });

  return flags;
}

// 온보딩 시점 컷 스냅샷 4칸 중 null 인 것 = 빠진 컷.
// api/_lib/goal/repo.ts:270-278 listMissingCuts 와 같은 규칙이지만 그 모듈은
// service_role 클라이언트를 끌고 오므로(supabaseAdmin.js) 브라우저 번들로 import 하지 않는다.
function listGoalMissingCutSlots(student: GoalStudentRow | null) {
  if (!student) return [];
  return GOAL_CUT_SLOTS.filter(
    (slot) => goalNum(student[slot.snapshotKey]) === null,
  );
}

// 빠진 컷 1칸을 "컷 관리 탭에서 만들어야 할 행" 으로 번역한다.
// 내신 컷의 cut_type 은 학교 유형에서 유도한다 — DB에 저장하지 않고 매번 파생하는 것이
// 계산 엔진의 규약이다(primitives.js:43-47 getSchoolCutType, import 만 한다).
function describeGoalCutSlot(
  slot: GoalCutSlot,
  student: GoalStudentRow | null | undefined,
): GoalDescribedCutSlot {
  const naesinType = getSchoolCutType(student?.school_type);
  return {
    ...slot,
    cutType: slot.axis === "naesin" ? naesinType : "jungsi",
    university: goalTrim(
      slot.side === "ideal"
        ? student?.ideal_university
        : student?.min_university,
    ),
    department: goalTrim(
      slot.side === "ideal"
        ? student?.ideal_department
        : student?.min_department,
    ),
  };
}

function goalDiffDays(fromYMD: unknown, toYMD: unknown) {
  if (!fromYMD || !toYMD) return 0;
  const a = Date.parse(`${String(fromYMD).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toYMD).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_PER_DAY);
}

function goalSigned(value: unknown, digits = 4) {
  const parsed = goalNum(value);
  if (parsed === null) return "-";
  return `${parsed >= 0 ? "+" : ""}${parsed.toFixed(digits)}`;
}

function GoalDetailRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8.75rem_1fr] border-b border-border last:border-b-0">
      <div className="bg-muted/50 px-4 py-2.5 text-xs font-semibold text-gray-600">
        {label}
      </div>
      <div className="whitespace-pre-line px-4 py-2.5 text-sm font-medium">
        {children}
      </div>
    </div>
  );
}

function GoalCard({
  title,
  right,
  children,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-5 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-5 py-3">
        <span className="text-sm font-semibold">{title}</span>
        {right}
      </div>
      <div>{children}</div>
    </div>
  );
}

interface GoalStudentsAdminProps {
  config: GoalStudentsAdminConfig;
  // AdminSectionRoute(Admin.tsx)가 넘기는 콜백 계약(§4-3-C-4 원클릭 컷 만들기) — 옵션이며
  // 미제공 시 canCreateCut이 false가 되어 버튼 자체를 렌더하지 않는다. "이동 + 프리필"을
  // 한 호출로 묶는다 — 라우팅 계층 전환(react-router v8) 이후 이동은 실제 <Route>
  // 전환(다른 컴포넌트 인스턴스로 마운트)이라, 이동과 프리필을 별개 호출 두 번으로
  // 나누면 두 번째 호출이 이미 사라진 인스턴스에 걸린다.
  onNavigateWithPrefill?: (
    key: string,
    payload: Record<string, unknown>,
  ) => void;
}

// 목록 상태(page, q, filter)는 URL 검색 파라미터에 둔다. 상세(/admin/goalStudents/:id)로 갔다가
// 뒤로가기나 "목록으로"로 돌아와도 같은 목록이 열린다.
const LIST_PATH = "/admin/goalStudents";

function parsePage(raw: string | null) {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function parseFilter(raw: string | null): GoalStudentFilter {
  const found = GOAL_STUDENT_FILTERS.find((item) => item.key === raw);
  return (found?.key ?? "all") as GoalStudentFilter;
}

// 기본값(1페이지, 전체, 검색어 없음)은 URL 에서 뺀다.
function patchParams(
  prev: URLSearchParams,
  patch: { page?: number; q?: string; filter?: string },
) {
  const next = new URLSearchParams(prev);
  const put = (key: string, value: string, isDefault: boolean) => {
    if (isDefault) next.delete(key);
    else next.set(key, value);
  };
  if (patch.page !== undefined)
    put("page", String(patch.page), patch.page <= 1);
  if (patch.q !== undefined) put("q", patch.q, patch.q === "");
  if (patch.filter !== undefined)
    put("filter", patch.filter, patch.filter === "all");
  return next;
}

export default function GoalStudentsAdmin({
  config,
  onNavigateWithPrefill,
}: GoalStudentsAdminProps) {
  const { id } = useParams();
  if (id) {
    return (
      <GoalStudentDetailRoute
        profileId={id}
        onNavigateWithPrefill={onNavigateWithPrefill}
      />
    );
  }
  return <GoalStudentsList config={config} />;
}

function GoalStudentDetailRoute({
  profileId,
  onNavigateWithPrefill,
}: {
  profileId: string;
  onNavigateWithPrefill: GoalStudentsAdminProps["onNavigateWithPrefill"];
}) {
  const navigate = useNavigate();
  // 상세로 올 때 목록의 검색 파라미터를 그대로 달고 왔으므로 돌아갈 때도 그대로 돌려준다.
  const { search } = useLocation();
  return (
    <GoalStudentDetail
      profileId={profileId}
      onBack={() => navigate({ pathname: LIST_PATH, search })}
      onNavigateWithPrefill={onNavigateWithPrefill}
    />
  );
}

function GoalStudentsList({ config }: { config: GoalStudentsAdminConfig }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get("page"));
  const term = searchParams.get("q") ?? "";
  const filter = parseFilter(searchParams.get("filter"));
  const [keyword, setKeyword] = useState(term);

  // 목록 전체에 한 번 쓰는 기준일이라 학생별 시간대를 쓸 수 없다. 보는 관리자의 브라우저 시간대 기준이다.
  const todayYMD = useMemo(() => ymdIn(new Date(), browserTimeZone()), []);

  // 검색 디바운스. 확정 시 1페이지로 되돌린다(공용 목록의 관행과 동일). 입력 중 기록이 쌓이지 않게 replace 다.
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = keyword.trim();
      if (trimmed === term) return;
      setSearchParams((prev) => patchParams(prev, { q: trimmed, page: 1 }), {
        replace: true,
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [keyword, term, setSearchParams]);

  // 뒤로가기로 q 가 바뀌면 입력칸도 맞춘다(입력 중 공백은 건드리지 않는다).
  useEffect(() => {
    setKeyword((current) => (current.trim() === term ? current : term));
  }, [term]);

  const params = { page, q: term, filter };
  const listQuery = useQuery({
    queryKey: goalStudentKeys.list(params),
    queryFn: ({ signal }) => fetchGoalStudents(params, signal),
  });
  useEffect(() => {
    if (listQuery.error) {
      reportAdminError(`${config.title} 조회 실패`, listQuery.error);
    }
  }, [listQuery.error, config.title]);

  const rows = listQuery.data?.items ?? [];
  const totalCount = listQuery.data?.total ?? 0;
  // 검색 선행 조회(profiles)가 상한에 닿았는가. 초과분 학생이 조용히 사라지므로 알린다.
  const searchTruncated = listQuery.data?.searchTruncated ?? false;
  const loading = listQuery.isPending;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const setPage = (next: number) =>
    setSearchParams((prev) => patchParams(prev, { page: next }));
  const changeFilter = (next: string) =>
    setSearchParams((prev) => patchParams(prev, { filter: next, page: 1 }));
  // 상세는 목록 파라미터를 달고 가서 돌아올 때 같은 목록이 열리게 한다.
  const openDetail = (profileId: string) =>
    navigate({
      pathname: `${LIST_PATH}/${profileId}`,
      search: searchParams.toString(),
    });

  return (
    <div>
      <div className="mb-5 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {GOAL_STUDENT_FILTERS.map((item) => (
              <Button
                key={item.key}
                type="button"
                variant={filter === item.key ? "default" : "outline"}
                size="lg"
                aria-pressed={filter === item.key}
                onClick={() => changeFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center">
            <TextInput
              value={keyword}
              onChange={setKeyword}
              {...(config.searchPlaceholder
                ? { placeholder: config.searchPlaceholder }
                : {})}
              aria-label="학생 이름 또는 연락처 검색"
              className="w-80"
            />
            <span className="inline-flex h-9 items-center gap-1 border border-l-0 border-border bg-white px-4 text-sm font-medium text-muted-foreground">
              <Search size={14} />
              이름·연락처
            </span>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-semibold">{config.title}</h1>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          읽기 전용 화면입니다. 학생 데이터는 어드민에서 수정할 수 없습니다 —
          확률은 온보딩 시점에 확정되고, 컷을 고쳐도 이미 온보딩한 학생의 값은
          바뀌지 않습니다. 유일한 예외는 학생상세의 "온보딩 리셋"
          버튼입니다(재입력 정정용, 명시적 확인 후에만 동작합니다).
        </p>
      </div>

      {searchTruncated && (
        <div className="mb-5">
          <GoalNotice tone="warn">
            검색어에 걸리는 회원이 {PROFILE_SEARCH_LIMIT}명을 넘습니다. 목록에는
            앞의 {PROFILE_SEARCH_LIMIT}명 안에서만 학생을 찾아 보여 주므로
            일부가 빠져 있을 수 있습니다 — 이름을 더 길게 입력하거나 연락처
            뒷자리로 좁혀 주세요.
          </GoalNotice>
        </div>
      )}

      {loading ? (
        <div className="bg-white p-6 shadow-sm">
          <AdminTableSkeleton columns={15} label="학생 목록을 불러오는 중" />
        </div>
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="mb-4 text-sm font-medium text-muted-foreground">
            전체{" "}
            <span className="text-primary">{totalCount.toLocaleString()}</span>
            명
          </div>

          <AdminTableFrame
            label="학생 목록"
            className="w-full min-w-325 text-sm"
          >
            <TableHeader>
              {/* 표 폭이 컨테이너보다 넓으면 가로 스크롤로 처리한다(§4-1 관행).
                    머리글이 줄바꿈되면 "상한 수 / 시" 처럼 끊겨 읽히므로 nowrap 을 건다. */}
              <TableRow className="hover:bg-transparent">
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  이름
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  연락처
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  학년
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  학교 유형
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  상한 목표
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  하한 목표
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  상태
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  상한 수시
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  상한 정시
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  하한 수시
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  하한 정시
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  기록 수
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  최근 기록일
                </TableHead>
                <TableHead
                  scope="col"
                  className="font-semibold whitespace-normal px-3 py-3"
                >
                  위험
                </TableHead>
                <TableHead
                  scope="col"
                  className="sticky right-0 border-l border-gray-200 bg-white font-semibold whitespace-normal w-20 px-3 py-3 text-center"
                >
                  관리
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={15}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {term || filter !== "all"
                      ? "조건에 맞는 학생이 없습니다."
                      : "온보딩을 마친 학생이 아직 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const flags = buildGoalRiskFlags(row, todayYMD);
                  return (
                    <TableRow key={row.profile_id}>
                      <TableCell className="whitespace-nowrap px-3 py-3 font-medium">
                        {row.profile?.name || "-"}
                      </TableCell>
                      {/* 목록은 마스킹, 상세는 원본, maskedPhone 선례와 같은 규칙(§3-D6) */}
                      <TableCell className="whitespace-nowrap px-3 py-3">
                        {formatValue(row.profile?.phone, "maskedPhone")}
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        {row.student?.grade || "-"}
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        {row.student?.school_type || "-"}
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        {row.student?.ideal_university || "-"}
                        <span className="block text-xs text-muted-foreground">
                          {row.student?.ideal_department || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        {row.student?.min_university || "-"}
                        <span className="block text-xs text-muted-foreground">
                          {row.student?.min_department || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        <GoalStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        <GoalProb value={row.ideal_susi} />
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        <GoalProb value={row.ideal_jungsi} />
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        <GoalProb value={row.min_susi} />
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        <GoalProb value={row.min_jungsi} />
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        {Number(row.record_count || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3">
                        {row.last_record_date || "-"}
                      </TableCell>
                      <TableCell className="whitespace-normal px-3 py-3">
                        <span className="flex flex-wrap gap-1">
                          {flags.length === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            flags.map((flag) => (
                              <GoalRiskBadge key={flag.key} tone={flag.tone}>
                                {flag.label}
                              </GoalRiskBadge>
                            ))
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="sticky right-0 border-l border-gray-100 bg-white whitespace-normal px-3 py-3 text-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => openDetail(row.profile_id)}
                          title="상세 보기"
                          aria-label="상세 보기"
                        >
                          <Eye aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </AdminTableFrame>

          <AdminPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

// 확률 로그 시계열. 차트 라이브러리 선례가 이 파일에 0건이라 SVG polyline 으로 직접 그린다.
// 정시 2선은 컷이 없으면 null 이라(sql/56_goal_jungsi_optional.sql) **끊어진 선**이 되어야 한다 —
// null 을 0 으로 접으면 "정시 확률이 0%로 떨어졌다"는 거짓 그림이 된다.
function GoalProbabilityChart({ logs }: { logs: GoalProbabilityLogRow[] }) {
  const series = [
    { key: "ideal_susi", label: "상한 수시", color: "#2348ff" },
    { key: "ideal_jungsi", label: "상한 정시", color: "#7c3aed" },
    { key: "min_susi", label: "하한 수시", color: "#0f9d58" },
    { key: "min_jungsi", label: "하한 정시", color: "#B88737" },
  ];

  const width = 640;
  const height = 220;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 22;

  if (logs.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm font-medium text-muted-foreground">
        확률 로그가 없습니다.
      </div>
    );
  }

  const stepX =
    logs.length <= 1 ? 0 : (width - padLeft - padRight) / (logs.length - 1);
  const toX = (index: number) => padLeft + stepX * index;
  const toY = (value: unknown) =>
    padTop + (height - padTop - padBottom) * (1 - Number(value) / 100);

  return (
    <div className="px-5 py-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="상한·하한 수시·정시 확률 추이 차트"
      >
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
            <text x={4} y={toY(tick) + 4} fontSize="10" fill="#9ca3af">
              {tick}
            </text>
          </g>
        ))}

        {series.map((item) => {
          // null 구간에서 선을 끊는다 — 연속된 non-null 묶음마다 polyline 을 하나씩 만든다.
          const segments: string[][] = [];
          let current: string[] = [];

          logs.forEach((log, index) => {
            const value = goalNum(log[item.key]);
            if (value === null) {
              if (current.length > 0) segments.push(current);
              current = [];
              return;
            }
            current.push(`${toX(index)},${toY(value)}`);
          });

          if (current.length > 0) segments.push(current);

          return (
            <g key={item.key}>
              {segments.map((points, index) => (
                <polyline
                  // biome-ignore lint/suspicious/noArrayIndexKey: 차트 렌더마다 좌표에서 새로 계산되는 선분 조각 — id 없고 재정렬 없음.
                  key={index}
                  points={points.join(" ")}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-4">
        {series.map((item) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600"
          >
            <span
              className="inline-block h-0.5 w-4"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const GOAL_RECORD_PAGE = 30;

// api/_routes/goal/admin/resend-report.ts 의 ResendReportResponse와 같은 모양이다(그
// 서버 타입은 api/ 전용 tsconfig 아래라 여기서 직접 import하지 않는다 — 대신
// 이 화면이 실제로 읽는 필드만 로컬로 좁게 선언한다).
export interface ResendReportResult {
  sent: number;
  failed: number;
  skipped: number;
  recipients: Array<{
    parentProfileId: string;
    phone: string;
    status: "sent" | "failed" | "skipped";
    reason?: string;
  }>;
}

interface GoalStudentDetailProps {
  profileId: string;
  onBack: () => void;
  // exactOptionalPropertyTypes: 호출부(위 686 부근)가 부모 prop(onNavigateWithPrefill?,
  // 값은 boolean이 아니라 함수 | undefined)을 그대로 전달하므로 undefined도 명시한다.
  onNavigateWithPrefill?:
    | ((key: string, payload: Record<string, unknown>) => void)
    | undefined;
}

// GoalStudentsAdmin.test.tsx가 학생 전환 시 재발송 상태 초기화를 profileId prop
// 교체(rerender)로 직접 검증할 수 있도록 named export한다(default export는
// GoalStudentsAdmin 그대로 유지).
export function GoalStudentDetail({
  profileId,
  onBack,
  onNavigateWithPrefill,
}: GoalStudentDetailProps) {
  const [recordLimit, setRecordLimit] = useState(GOAL_RECORD_PAGE);
  const detailQuery = useQuery({
    queryKey: goalStudentKeys.detail(profileId),
    queryFn: ({ signal }) => fetchGoalStudentDetail(profileId, signal),
  });
  // 더보기로 limit 이 바뀌어도 받아 둔 기록이 사라지지 않게 이전 값을 붙들고 있는다.
  const recordsQuery = useQuery({
    queryKey: goalStudentKeys.records(profileId, recordLimit),
    queryFn: ({ signal }) =>
      fetchGoalStudentRecords(profileId, recordLimit, signal),
    placeholderData: keepPreviousData,
  });
  const loading = detailQuery.isPending;
  const student: GoalStudentRow | null = detailQuery.data?.student ?? null;
  const state = detailQuery.data?.state ?? null;
  const profile = detailQuery.data?.profile ?? null;
  const cutRows: Record<string, GoalUniversityCutRow | null> =
    detailQuery.data?.cuts ?? {};
  const logs = detailQuery.data?.logs ?? [];
  const records = recordsQuery.data?.items ?? [];
  const recordTotal = recordsQuery.data?.total ?? 0;
  const [showRaw, setShowRaw] = useState(false);
  const [openMemo, setOpenMemo] = useState<Record<string, boolean>>({});
  // 온보딩 리셋(Q3) 진행 상태. 성공 시 목록 상태('컷 대기')까지 함께 갱신돼야
  // 하므로 페이지를 통째로 새로고침한다(list/detail 두 컴포넌트를 각각
  // 부분 갱신하는 것보다 안전하다 — GoalStudentsAdmin의 rows state는
  // mutationSeq 같은 재조회 트리거를 두지 않는다).
  const resetMutation = useMutation({ mutationFn: resetGoalStudent });
  // 성공 뒤에는 새로고침될 때까지 버튼을 잠근다.
  const resetting = resetMutation.isPending || resetMutation.isSuccess;
  const reloadTimerRef = useRef<number | undefined>(undefined);
  // 리셋 뒤 새로고침 예약은 화면을 벗어나면 취소한다.
  useEffect(() => () => window.clearTimeout(reloadTimerRef.current), []);

  // 리포트 알림톡 재발송(QA 2차 행70). 후보 목록·라벨은 서버 검증(2주 규칙)과
  // 같은 상수를 공유하는 순수 함수(reportResendOptions.ts)에 위임한다.
  const [resendKind, setResendKind] = useState<ResendKind>("daily");
  const resendCandidates = useMemo(
    () => listResendCandidates(resendKind),
    [resendKind],
  );
  const [resendPeriod, setResendPeriod] = useState(
    () => resendCandidates[0]?.periodKey || "",
  );
  const resendMutation = useMutation({ mutationFn: resendGoalReport });
  const resending = resendMutation.isPending;
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<ResendReportResult | null>(
    null,
  );

  // kind가 바뀌면 그 종류의 후보 중 최신 것으로 되돌린다(이전 kind의 periodKey를
  // 그대로 들고 있으면 형식이 안 맞아 서버가 400을 낸다).
  const firstResendCandidate = resendCandidates[0]?.periodKey || "";
  useEffect(() => {
    setResendPeriod(firstResendCandidate);
    setResendResult(null);
    setResendError(null);
  }, [firstResendCandidate]);

  // QA — 학생을 전환해도(같은 컴포넌트 인스턴스가 재사용되는 경우 포함) 이전
  // 학생의 재발송 결과가 다음 학생 화면에 남지 않게 한다. 위 kind 전환 effect는
  // firstResendCandidate가 바뀔 때만 도는데, kind가 그대로면 그 값이 학생이
  // 바뀌어도 동일해 초기화가 안 된다 — profileId 자체를 별도로 감시한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: profileId(스칼라) 하나로 "다른 학생으로 전환됐는가"만 판별한다(RefundRequestModal.tsx의 orderId와 같은 패턴).
  useEffect(() => {
    setResendResult(null);
    setResendError(null);
  }, [profileId]);

  async function handleResendReport() {
    if (!student?.profile_id || !resendPeriod) return;

    setResendError(null);
    setResendResult(null);

    try {
      const result = await resendMutation.mutateAsync({
        studentProfileId: student.profile_id,
        kind: resendKind,
        periodKey: resendPeriod,
      });
      setResendResult(result);
    } catch (error) {
      console.error("goal/admin/resend-report 실패:", error);
      setResendError(
        error instanceof Error ? error.message : "재발송에 실패했습니다.",
      );
    }
  }

  const _todayYMD = useMemo(() => ymdIn(new Date(), browserTimeZone()), []);

  async function handleResetOnboarding() {
    if (!student?.profile_id) return;

    const confirmed = await confirmAdmin({
      title: "이 학생을 온보딩 이전 상태로 되돌립니다.",
      description:
        "학생은 재접속 시 온보딩을 처음부터 다시 진행하게 됩니다. 학습 기록은 보존되지만 확률은 초기화됩니다. 계속하시겠습니까?",
      confirmLabel: "리셋",
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await resetMutation.mutateAsync(student.profile_id);

      toastSuccess(
        "온보딩 리셋이 완료되었습니다.",
        "학생은 재접속 시 온보딩부터 다시 진행합니다.",
      );
      // 목록 탭의 상태('컷 대기')까지 함께 반영해야 하므로 전체 새로고침한다.
      // 새로고침하면 토스트가 사라지므로 안내가 읽힐 시간을 잠시 둔다.
      reloadTimerRef.current = window.setTimeout(
        () => window.location.reload(),
        RELOAD_DELAY_MS,
      );
    } catch (error) {
      console.error("goal/admin/reset-student 실패:", error);
      reportAdminError("온보딩 리셋 실패", error);
    }
  }

  // 조회 실패는 안내 토스트로 알린다. 404 는 "행 없음" 화면이 안내하므로 토스트를 띄우지 않는다.
  const detailError = detailQuery.error;
  useEffect(() => {
    if (!detailError) return;
    if (detailError instanceof ApiError && detailError.status === 404) return;
    reportAdminError("학생 상세 조회 실패", detailError);
  }, [detailError]);

  // 원클릭 컷 만들기(§4-3-C-4). 공급자는 이 컴포넌트, 소비자는 AdminSectionRoute(Admin.tsx)
  // 최상단의 customComponentKey 렌더 분기(onNavigateWithPrefill 계약, 그 지점 참고) —
  // 이동과 프리필을 한 호출로 묶는다(navigateWithPrefill이 route state로 실어 나른다).
  // 함수일 때만 동작한다 — 클립보드 백업 경로는 두지 않는다(진입점 하나만 정본으로
  // 둔다). 미제공 시 버튼 자체를 렌더하지 않는다(canCreateCut).
  const canCreateCut = typeof onNavigateWithPrefill === "function";

  function createCutFromSlot(slot: GoalDescribedCutSlot) {
    if (!canCreateCut) return;
    onNavigateWithPrefill("goalUniversityCuts", {
      cut_type: slot.cutType,
      university_name: slot.university,
      department_name: slot.department,
    });
  }

  if (loading) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">학생 상세</h1>
          <ActionButton variant="light" onClick={onBack}>
            목록으로
          </ActionButton>
        </div>
        <AdminDetailSkeleton rows={8} label="학생 상세를 불러오는 중" />
      </div>
    );
  }

  if (!student) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">학생 상세</h1>
          <ActionButton variant="light" onClick={onBack}>
            목록으로
          </ActionButton>
        </div>
        <div className="bg-white p-12 text-center text-sm font-medium text-muted-foreground shadow-sm">
          학생 행을 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  const missingSlots = listGoalMissingCutSlots(student).map((slot) =>
    describeGoalCutSlot(slot, student),
  );
  const missingJungsiOnly = missingSlots.filter(
    (slot) => slot.axis === "jungsi",
  );
  const naesinCutType = getSchoolCutType(student.school_type);
  const currentMogo = goalNum(student.current_mogo);
  const remainNaesin = Number(student.remain_naesin || 0);
  const remainMogo = Number(student.remain_mogo || 0);
  // 고1 무내신 특례. 이번 브랜치에서 grade 는 학생이 실제로 고른 학년을 그대로 저장하고
  // (intake.js:703 `grade: inputGrade`), 특례 식별자는 naesin_scores.priorNaesinGrade 다.
  // 이 학생은 remain_naesin=10 / remain_mogo=14 가 정상값이라 데이터 결손이 아니다.
  const priorNaesinGrade =
    student.naesin_scores && typeof student.naesin_scores === "object"
      ? student.naesin_scores.priorNaesinGrade
      : null;

  const cumAllZero =
    state &&
    [
      "cum_ideal_susi",
      "cum_ideal_jungsi",
      "cum_min_susi",
      "cum_min_jungsi",
    ].every((key) => Number(state[key] || 0) === 0);

  const schedule =
    student.study_schedule && typeof student.study_schedule === "object"
      ? student.study_schedule
      : {};

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {profile?.name || "이름 없음"}{" "}
            <GoalStatusBadge status={state?.status || student.status} />
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {student.profile_id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton
            variant="danger"
            onClick={handleResetOnboarding}
            disabled={resetting}
          >
            <RotateCcw size={14} />
            {resetting ? "리셋 중…" : "온보딩 리셋"}
          </ActionButton>
          <ActionButton variant="light" onClick={onBack}>
            목록으로
          </ActionButton>
        </div>
      </div>

      {/* ── 진단 힌트 (§4-3-C-1) ───────────────────────────────────────── */}
      <div className="mb-5 space-y-2">
        {state?.status === "awaiting_cuts" && (
          <GoalNotice tone="danger">
            🔴 컷 미확보로 확률이 산출되지 않았습니다. 빠진 컷:{" "}
            <b>{missingSlots.map((slot) => slot.label).join(", ") || "없음"}</b>
            {canCreateCut && (
              <div className="mt-2 flex flex-wrap gap-2">
                {missingSlots.map((slot) => (
                  <Button
                    key={slot.key}
                    type="button"
                    variant="destructive"
                    onClick={() => createCutFromSlot(slot)}
                  >
                    {slot.label} 컷 만들기
                  </Button>
                ))}
              </div>
            )}
            <div className="mt-2 text-xs font-medium">
              ⓘ 빠진 컷을 만들어 준 뒤 <b>학생이 온보딩을 다시 제출하면</b>{" "}
              그대로 진행중으로 전환됩니다 — 관리자가 할 추가 작업은 없고,
              자동으로 되지도 않습니다. 학생에게 온보딩 재제출을 안내해 주세요.
            </div>
          </GoalNotice>
        )}

        {state?.status !== "awaiting_cuts" && missingJungsiOnly.length > 0 && (
          <GoalNotice tone="warn">
            🟠 정시 컷이 없어 <b>정시 확률 2종이 미산출</b>입니다(수시는 정상
            산출). 빠진 컷:{" "}
            <b>{missingJungsiOnly.map((slot) => slot.label).join(", ")}</b>
            {canCreateCut && (
              <div className="mt-2 flex flex-wrap gap-2">
                {missingJungsiOnly.map((slot) => (
                  <Button
                    key={slot.key}
                    type="button"
                    variant="outline"
                    onClick={() => createCutFromSlot(slot)}
                    className="border-[#B88737]/50 text-[#7A4A12]"
                  >
                    {slot.label} 컷 만들기
                  </Button>
                ))}
              </div>
            )}
            <div className="mt-2 text-xs font-medium">
              ⓘ 지금 정시 컷을 채워도{" "}
              <b>이 학생의 정시 확률은 영원히 미산출로 남습니다</b> — 확률
              기준값(base)은 온보딩 시점에 1회 산출되고 재계산 경로가 없습니다.
            </div>
          </GoalNotice>
        )}

        {currentMogo !== null && currentMogo <= 0 && (
          <GoalNotice tone="danger">
            🔴 모의고사 환산점수가 {currentMogo} 입니다(0 이하) — 정시 확률
            2종이 구조적으로 0이 됩니다. 영어 감점이 최대 −16 이라 종합 백분위가
            음수가 될 수 있습니다.
          </GoalNotice>
        )}

        {(remainNaesin >= 8 || remainMogo >= 11) && (
          <GoalNotice>
            ⓘ 남은 시험 회차가 많습니다(내신 {remainNaesin}/10, 모의{" "}
            {remainMogo}/14). 시간계수 때문에 우세 갈래에서도 확률이 깎입니다 —
            남은 회차가 전부 남았을 때 계수는 최저 0.55 입니다.
          </GoalNotice>
        )}

        {priorNaesinGrade ? (
          <GoalNotice>
            ⓘ 내신 회차가 전부 &lsquo;없음&rsquo;인 특례 학생입니다. 현재 성적은
            이전 단계 평균 등급(
            <b>{priorNaesinGrade}</b>)으로 대체됐고, 잔여 회차가 전부 남은
            값(내신 {remainNaesin}, 모의 {remainMogo})인 것이 정상입니다.{" "}
            <code>grade</code> 는 학생이 실제로 고른 학년입니다.
          </GoalNotice>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* ── C-1 좌측: 입력과 파생 ─────────────────────────────────── */}
        <div>
          <GoalCard title="기본">
            <GoalDetailRow label="이름">{profile?.name || "-"}</GoalDetailRow>
            {/* 상세는 원본 연락처를 그대로 보여준다(목록만 마스킹, §3-D6) */}
            <GoalDetailRow label="연락처">
              {profile?.phone || "-"}
            </GoalDetailRow>
            <GoalDetailRow label="이메일">
              {profile?.email || "-"}
            </GoalDetailRow>
            <GoalDetailRow label="학년">{student.grade || "-"}</GoalDetailRow>
            <GoalDetailRow label="학교 유형">
              {student.school_type || "-"}
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                내신 컷 종류: {naesinCutType}
              </span>
            </GoalDetailRow>
            <GoalDetailRow label="온보딩일">
              {formatValue(student.onboarded_at, "datetime")}
            </GoalDetailRow>
            <GoalDetailRow label="상태">
              <GoalStatusBadge status={state?.status || student.status} />
            </GoalDetailRow>
            <GoalDetailRow label="가상 날짜 원점">
              {student.actual_start_date || "-"}
            </GoalDetailRow>
          </GoalCard>

          <GoalCard title="목표">
            <GoalDetailRow label="상한 대학">
              {student.ideal_university || "-"}
            </GoalDetailRow>
            <GoalDetailRow label="상한 학과">
              {student.ideal_department || "-"}
            </GoalDetailRow>
            <GoalDetailRow label="하한 대학">
              {student.min_university || "-"}
            </GoalDetailRow>
            <GoalDetailRow label="하한 학과">
              {student.min_department || "-"}
            </GoalDetailRow>
          </GoalCard>

          <GoalCard title="성적 파생값">
            <GoalDetailRow label="현재 성적">
              {student.current_score ?? "-"}
            </GoalDetailRow>
            <GoalDetailRow label="변환 등급">
              {student.converted_grade ?? "-"}
            </GoalDetailRow>
            <GoalDetailRow label="모의 환산점수">
              {student.current_mogo ?? "-"}
            </GoalDetailRow>
          </GoalCard>

          <GoalCard title="시험 회차">
            <GoalDetailRow label="최근 내신">
              {student.last_naesin_exam || "-"}
            </GoalDetailRow>
            <GoalDetailRow label="잔여 내신">{remainNaesin} / 10</GoalDetailRow>
            <GoalDetailRow label="최근 모의">
              {student.last_mogo_exam || "-"}
            </GoalDetailRow>
            <GoalDetailRow label="잔여 모의">{remainMogo} / 14</GoalDetailRow>
          </GoalCard>

          <GoalCard title="학습 목표">
            <GoalDetailRow label="주간 이상">
              {student.week_ideal ?? "-"} 시간
            </GoalDetailRow>
            <GoalDetailRow label="주간 최소">
              {student.week_min ?? "-"} 시간
            </GoalDetailRow>
            <div className="px-4 py-3">
              <Table className="w-full min-w-100 text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead
                      scope="col"
                      className="font-semibold whitespace-normal px-2 py-2"
                    >
                      요일
                    </TableHead>
                    {GOAL_WEEKDAY_LABELS.map((label) => (
                      <TableHead
                        key={label}
                        scope="col"
                        className="font-semibold whitespace-normal px-2 py-2"
                      >
                        {label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="whitespace-normal px-2 py-2 font-semibold">
                      이상
                    </TableCell>
                    {VIRTUAL_DAY_NAMES.map((day) => (
                      <TableCell
                        key={day}
                        className="whitespace-normal px-2 py-2"
                      >
                        {schedule?.[day]?.ideal ?? "-"}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="whitespace-normal px-2 py-2 font-semibold">
                      최소
                    </TableCell>
                    {VIRTUAL_DAY_NAMES.map((day) => (
                      <TableCell
                        key={day}
                        className="whitespace-normal px-2 py-2"
                      >
                        {schedule?.[day]?.min ?? "-"}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                주간 합계는 월~토만 더합니다(일요일 제외).
              </p>
            </div>
          </GoalCard>

          {/* 성적 원자료 — 목록 미노출, 상세 접힘 기본(§3-D6) */}
          <GoalCard
            title="성적 원자료"
            right={
              <ActionButton
                variant="light"
                onClick={() => setShowRaw((prev) => !prev)}
              >
                {showRaw ? "접기" : "성적 원자료 펼치기"}
              </ActionButton>
            }
          >
            {showRaw ? (
              <div className="space-y-3 px-5 py-4">
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">
                    naesin_scores
                  </div>
                  <ScrollArea
                    axis="x"
                    className="border border-border bg-muted/50 p-3 text-xs"
                  >
                    <pre>
                      {JSON.stringify(student.naesin_scores ?? null, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">
                    mock_exam_scores
                  </div>
                  <ScrollArea
                    axis="x"
                    className="border border-border bg-muted/50 p-3 text-xs"
                  >
                    <pre>
                      {JSON.stringify(
                        student.mock_exam_scores ?? null,
                        null,
                        2,
                      )}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 text-xs font-medium text-muted-foreground">
                개인 성적 원자료입니다. 필요할 때만 펼쳐 주세요.
              </div>
            )}
          </GoalCard>
        </div>

        {/* ── C-2 우측: 게이지 분해 + C-3 컷 diff ────────────────────── */}
        <div>
          <GoalCard title="확률 분해 (base + Σdelta = 현재)">
            <Table className="w-full min-w-120 text-sm">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    항목
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    base
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    Σdelta
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    현재
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    rate(%/일)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {GOAL_GAUGE_ROWS.map((row) => (
                  <TableRow
                    key={row.label}
                    className="border-b border-border last:border-b-0"
                  >
                    <TableCell className="whitespace-normal px-4 py-2.5 font-semibold">
                      {row.label}
                    </TableCell>
                    <TableCell className="whitespace-normal px-4 py-2.5">
                      <GoalProb
                        value={state?.[row.base]}
                        digits={1}
                        suffix=""
                      />
                    </TableCell>
                    <TableCell className="whitespace-normal px-4 py-2.5">
                      {goalSigned(state?.[row.cum])}
                    </TableCell>
                    <TableCell className="whitespace-normal px-4 py-2.5 font-semibold">
                      <GoalProb value={state?.[row.now]} digits={4} />
                    </TableCell>
                    <TableCell className="whitespace-normal px-4 py-2.5 text-muted-foreground">
                      {goalNum(student[row.rate]) === null
                        ? "-"
                        : Number(student[row.rate]).toFixed(4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="border-t border-border px-5 py-3 text-xs font-medium leading-6 text-muted-foreground">
              rate = (100 − base) ÷ (기준일까지 남은 일수 + 학년 오프셋)입니다.
              base 가 95라면 rate 는 0.02%/일 수준이라 &ldquo;매일 제출하는데
              확률이 안 오른다&rdquo;는 문의의 1순위 답이 됩니다.
              {cumAllZero && (
                <div className="mt-1">
                  ※ 증분(Σdelta)이 전부 0입니다 — 일별 기록 API(
                  <code>api/goal/daily-record</code>) 미배포 상태에서는
                  정상입니다.
                </div>
              )}
            </div>
          </GoalCard>

          {/* ── C-3 컷 스냅샷 vs 현재 컷 diff ────────────────────────── */}
          <GoalCard title="컷 스냅샷 vs 현재 컷">
            <Table className="w-full min-w-136 text-sm">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    항목
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    온보딩 스냅샷
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    현재 컷
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    출처 / 연도 / 수정일
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="font-semibold whitespace-normal px-4 py-2.5 text-xs text-muted-foreground"
                  >
                    차이
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {GOAL_CUT_SLOTS.map((slot) => {
                  const described = describeGoalCutSlot(slot, student);
                  const snapshot = goalNum(student[slot.snapshotKey]);
                  const currentRow = cutRows[slot.key] || null;
                  const current = goalNum(currentRow?.avg_cut);
                  const changed =
                    snapshot !== null &&
                    current !== null &&
                    Math.abs(snapshot - current) > 1e-9;

                  return (
                    <TableRow
                      key={slot.key}
                      className="border-b border-border last:border-b-0"
                    >
                      <TableCell className="whitespace-normal px-4 py-2.5">
                        <span className="font-semibold">{slot.label}</span>
                        <span className="block text-xs font-medium text-muted-foreground">
                          {described.cutType} / {described.university || "-"} /{" "}
                          {described.department || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal px-4 py-2.5">
                        {snapshot === null ? (
                          <span className="font-medium text-muted-foreground">
                            미확보
                          </span>
                        ) : (
                          snapshot.toFixed(2)
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal px-4 py-2.5">
                        {current === null ? (
                          <span className="font-medium text-muted-foreground">
                            없음
                          </span>
                        ) : (
                          current.toFixed(2)
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal px-4 py-2.5 text-xs text-muted-foreground">
                        {currentRow
                          ? `${goalOptionLabel(GOAL_CUT_SOURCE_OPTIONS, currentRow.source)} / ${
                              currentRow.source_year ?? "-"
                            } / ${formatValue(currentRow.updated_at, "datetime")}`
                          : "-"}
                      </TableCell>
                      <TableCell className="whitespace-normal px-4 py-2.5">
                        {changed ? (
                          <GoalRiskBadge tone="orange">
                            {goalSigned(current - snapshot, 2)}
                          </GoalRiskBadge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="border-t border-border px-5 py-3">
              {state?.status === "awaiting_cuts" ? (
                <GoalNotice>
                  ⓘ 이 학생은 아직 확률이 산출되지 않았습니다.{" "}
                  <b>빠진 컷을 만들어 준 뒤 학생이 온보딩을 다시 제출하면</b>{" "}
                  그대로 진행중으로 전환됩니다 — 관리자가 할 추가 작업은 없고,
                  자동으로 되지도 않습니다.
                </GoalNotice>
              ) : (
                <GoalNotice>
                  ⓘ 컷이 바뀌어도{" "}
                  <b>이 학생의 확률은 온보딩 시점 컷으로 확정</b>돼 있어 바뀌지
                  않습니다. 이는 정상 동작입니다. 새 컷을 반영할 방법은 현재
                  없습니다 — 재온보딩은 409(<code>already_onboarded</code>)로
                  막혀 있고 학생 초기화 기능은 아직 없습니다.
                </GoalNotice>
              )}
            </div>
          </GoalCard>

          <GoalCard title={`확률 로그 (${logs.length.toLocaleString()}건)`}>
            {/* 0건일 때 차트를 그리지 않는다 — 아래 표가 이미 같은 빈 상태 문구를 낸다. */}
            {logs.length > 0 && <GoalProbabilityChart logs={logs} />}

            <div className="border-t border-border">
              <Table className="w-full min-w-136 text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead
                      scope="col"
                      className="font-semibold whitespace-normal px-4 py-2"
                    >
                      기록 시각
                    </TableHead>
                    <TableHead
                      scope="col"
                      className="font-semibold whitespace-normal px-4 py-2"
                    >
                      사유
                    </TableHead>
                    <TableHead
                      scope="col"
                      className="font-semibold whitespace-normal px-4 py-2"
                    >
                      상한 수시
                    </TableHead>
                    <TableHead
                      scope="col"
                      className="font-semibold whitespace-normal px-4 py-2"
                    >
                      상한 정시
                    </TableHead>
                    <TableHead
                      scope="col"
                      className="font-semibold whitespace-normal px-4 py-2"
                    >
                      하한 수시
                    </TableHead>
                    <TableHead
                      scope="col"
                      className="font-semibold whitespace-normal px-4 py-2"
                    >
                      하한 정시
                    </TableHead>
                    <TableHead
                      scope="col"
                      className="font-semibold whitespace-normal px-4 py-2"
                    >
                      기록 id
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-muted-foreground"
                      >
                        확률 로그가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-normal px-4 py-2">
                          {formatValue(log.created_at, "datetime")}
                        </TableCell>
                        <TableCell className="whitespace-normal px-4 py-2">
                          {log.reason}
                        </TableCell>
                        <TableCell className="whitespace-normal px-4 py-2">
                          <GoalProb value={log.ideal_susi} digits={4} />
                        </TableCell>
                        <TableCell className="whitespace-normal px-4 py-2">
                          <GoalProb value={log.ideal_jungsi} digits={4} />
                        </TableCell>
                        <TableCell className="whitespace-normal px-4 py-2">
                          <GoalProb value={log.min_susi} digits={4} />
                        </TableCell>
                        <TableCell className="whitespace-normal px-4 py-2">
                          <GoalProb value={log.min_jungsi} digits={4} />
                        </TableCell>
                        <TableCell className="whitespace-normal px-4 py-2 text-muted-foreground">
                          {log.source_record_id ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </GoalCard>
        </div>
      </div>

      {/* ── 리포트 알림톡 재발송(QA 2차 행70) ─────────────────────────── */}
      <GoalCard title="리포트 알림톡 다시 보내기">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-32">
            <Field label="종류">
              <Select
                value={resendKind}
                onChange={(value) => setResendKind(value as ResendKind)}
              >
                <option value="daily">일간</option>
                <option value="weekly">주간</option>
                <option value="monthly">월간</option>
              </Select>
            </Field>
          </div>

          <div className="w-56">
            <Field label="기간">
              <Select value={resendPeriod} onChange={setResendPeriod}>
                {resendCandidates.length === 0 ? (
                  <option value="">선택 가능한 기간이 없습니다</option>
                ) : (
                  resendCandidates.map((candidate) => (
                    <option
                      key={candidate.periodKey}
                      value={candidate.periodKey}
                    >
                      {candidate.periodKey} ({candidate.label})
                    </option>
                  ))
                )}
              </Select>
            </Field>
          </div>

          <ActionButton
            onClick={handleResendReport}
            disabled={resending || !resendPeriod}
          >
            {resending ? "발송 중…" : "다시 보내기"}
          </ActionButton>
        </div>

        {resendError && (
          <div
            role="alert"
            className="border-t border-border px-4 py-3 text-sm font-medium text-destructive"
          >
            {resendError}
          </div>
        )}

        {resendResult && (
          <div className="border-t border-border px-4 py-3 text-sm">
            <p className="font-semibold">
              성공 {resendResult.sent} · 실패 {resendResult.failed} · 스킵{" "}
              {resendResult.skipped}
            </p>
            {resendResult.recipients.length === 0 ? (
              <p className="mt-1 text-muted-foreground">
                연결된 학부모가 없어 보낼 대상이 없습니다.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs font-medium text-gray-600">
                {resendResult.recipients.map((recipient) => (
                  <li key={recipient.parentProfileId}>
                    {recipient.phone} —{" "}
                    <GoalRiskBadge
                      tone={
                        recipient.status === "sent"
                          ? "gray"
                          : recipient.status === "failed"
                            ? "red"
                            : "orange"
                      }
                    >
                      {recipient.status === "sent"
                        ? "발송 완료"
                        : recipient.status === "failed"
                          ? "발송 실패"
                          : "건너뜀"}
                    </GoalRiskBadge>
                    {recipient.reason ? ` (${recipient.reason})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </GoalCard>

      {/* ── C-5 하단: 일별 기록 타임라인 ──────────────────────────────── */}
      <GoalCard
        title={`일별 기록 (${recordTotal.toLocaleString()}건)`}
        right={
          recordTotal > records.length ? (
            <ActionButton
              variant="light"
              onClick={() => setRecordLimit((prev) => prev + GOAL_RECORD_PAGE)}
            >
              더보기
            </ActionButton>
          ) : null
        }
      >
        <Table className="w-full min-w-250 text-xs">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                #
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                가상 날짜
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                제출일
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                공부시간
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                목표(이상/최소)
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                컨디션
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                과목 태그
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                Δ상한수시
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                Δ상한정시
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                Δ하한수시
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                Δ하한정시
              </TableHead>
              <TableHead
                scope="col"
                className="font-semibold whitespace-normal px-3 py-2"
              >
                진단
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className="py-10 text-center text-muted-foreground"
                >
                  제출된 일별 기록이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => {
                const gap = goalDiffDays(
                  record.record_date,
                  record.submitted_on,
                );
                const hints: { key: string; tone: string; text: string }[] = [];

                if (
                  Number(record.target_ideal_hours || 0) === 0 ||
                  Number(record.target_min_hours || 0) === 0
                ) {
                  hints.push({
                    key: "target0",
                    tone: "orange",
                    text: '목표 시간이 0이라 "이미 다 채움"으로 취급돼 rate 가 만액 지급됩니다(일요일 구멍).',
                  });
                }
                if (Number(record.study_hours || 0) === 0) {
                  hints.push({
                    key: "study0",
                    tone: "red",
                    text: "0시간 기록이 존재합니다. v2는 이 경로를 daily-record API에서 차단하므로 이상 데이터입니다.",
                  });
                }
                if (Math.abs(gap) >= 2) {
                  hints.push({
                    key: "gap",
                    tone: "gray",
                    text: `가상 날짜와 실제 제출일이 ${Math.abs(gap)}일 차이납니다.`,
                  });
                }

                const memo = goalTrim(record.memo);

                return (
                  <TableRow
                    key={record.id}
                    className="border-b border-border align-top"
                  >
                    <TableCell className="whitespace-normal px-3 py-2">
                      {record.record_index}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {record.record_date}
                      <span className="block text-muted-foreground">
                        {GOAL_WEEKDAY_LABELS[record.virtual_day_index ?? -1] ||
                          ""}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {record.submitted_on}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {record.study_hours}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {record.target_ideal_hours} / {record.target_min_hours}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {record.body_condition ? (
                        <>
                          {record.body_condition}
                          <span className="block text-muted-foreground">
                            x
                            {CONDITION_MULTIPLIER[record.body_condition] ?? "?"}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          미입력(정상 배수 1.0 적용)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {(record.tasks || []).length === 0
                        ? "-"
                        : (record.tasks || []).join(", ")}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {goalSigned(record.delta_ideal_susi)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {goalSigned(record.delta_ideal_jungsi)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {goalSigned(record.delta_min_susi)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      {goalSigned(record.delta_min_jungsi)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-2">
                      <span className="flex flex-col gap-1">
                        {hints.length === 0 ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          hints.map((hint) => (
                            <GoalRiskBadge key={hint.key} tone={hint.tone}>
                              {hint.text}
                            </GoalRiskBadge>
                          ))
                        )}
                        {/* memo 는 학생 자유 서술이라 목록 미노출, 상세 접힘 기본(§3-D6) */}
                        {memo && (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              setOpenMemo((prev) => ({
                                ...prev,
                                [record.id]: !prev[record.id],
                              }))
                            }
                            className="self-start"
                          >
                            {openMemo[record.id] ? "메모 접기" : "메모 보기"}
                          </Button>
                        )}
                        {memo && openMemo[record.id] && (
                          <span className="whitespace-pre-line border border-border bg-muted/50 p-2 text-[0.6875rem] font-medium text-gray-600">
                            {memo}
                          </span>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </GoalCard>
    </div>
  );
}
