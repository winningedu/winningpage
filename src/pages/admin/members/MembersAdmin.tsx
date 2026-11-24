import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, EyeOff, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card as UiCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { site } from "@/config/site";
import { ApiError } from "@/lib/http/client";
import { formatPhoneInput } from "@/lib/phoneVerification";
import { ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";
import {
  fetchMember,
  fetchMemberLinks,
  fetchMemberMessages,
  fetchMemberOrders,
  fetchMemberServices,
  fetchMembers,
  fetchTenantOptions,
  type LinkedPerson,
  type MessageLogRow,
  memberKeys,
  type OrderRow,
  type ProfileRow,
  type ProgramAccessRow,
  patchMember,
  putMemberTenant,
  sendMemberMessage,
} from "@/pages/admin/members/api";
import { AdminTable } from "@/pages/admin/shared/AdminEngine";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import {
  toastError,
  toastSuccess,
  toastWarning,
} from "@/pages/admin/shared/adminToast";
import { downloadCsv, searchable } from "@/pages/admin/shared/csvExport";
import {
  ActionButton,
  Select,
  Textarea,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { useSensitiveActionGate } from "@/pages/admin/shared/SensitiveActionGate";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import { useUnsavedGuard } from "@/pages/admin/shared/useUnsavedGuard";
import MoveStudentForm, {
  type MoveTarget,
} from "@/pages/admin/tenants/MoveStudentForm";

// ---------------------------------------------------------------------------
// 회원 관리(members) — 목록 + 고객 상세.
//
// QA 182 의 「고객조회상담」 메인메뉴를 별도로 만들지 않고 이 화면에 통합한다
// (사용자 확정 2026-08-22). 근거 자료는 QA 140·179 에 첨부된 참조 HTML
// (「위닝에듀 Admin · 고객조회」 — 두 파일은 바이트 단위로 동일)과 기획자
// 와이어프레임 두 가지다.
//
// 탭은 최종적으로 6개다: 고객상세정보 / 이용서비스 / 결제내역 / 상담 /
// 알림톡·문자 / 서비스이용내역(활동로그). 이 파일은 그중 **앞의 세 개**만
// 구현한다 — 나머지 셋은 선행 작업이 있다:
//   · 상담          : 상담 원장 테이블이 아직 없다(수기 등록 화면).
//   · 알림톡·문자   : 발송 로그 테이블 + aligo 다중 템플릿 일반화가 먼저다
//                     (api/_lib/messaging/aligo.ts 는 인증번호 단일 템플릿 전용이고
//                      발송 이력을 남기지 않는다).
//   · 서비스이용내역: 기획자가 와이어프레임에 "어디서-누가-무슨 행동을 했는지
//                     로직이 다 정해져야 한다"고 미확정으로 남겨둔 항목이다.
// 탭 정의(TABS)에는 여섯 개를 모두 두고 미구현분은 안내만 띄운다 — 나중에
// 붙일 자리를 화면에서 먼저 보이게 해 기획자·클라이언트와 합을 맞추기 위해서다.
//
// 제네릭 CRUD 를 쓰지 않는 이유: 이 화면은 profiles 한 테이블이 아니라
// parent_child_links / program_access / orders 를 함께 읽고, 개인정보 마스킹과
// 탭 전환이 필요하다. AdminForm 은 모든 필드를 자유 편집으로 열어버려 맞지 않는다.
// 목록만 AdminTable 을 재사용한다(MentorApplicationsAdmin 과 같은 방식).
//
// 목록, 상세, 탭은 각각 /admin/members 아래 주소를 가진다(새로고침과 뒤로가기가 그대로 동작).
// ---------------------------------------------------------------------------

interface MembersAdminProps {
  config: {
    title: string;
    searchPlaceholder: string;
    // 목록 렌더(AdminTable)와 QA 268 다운로드가 함께 읽는다 — 이 파일이 실제로
    // 읽는 필드만 좁히고 나머지는 인덱스 시그니처로 열어두는 이 파일의 관례를 따른다.
    columns: { key: string; label: string; type?: string | undefined }[];
    [key: string]: unknown;
  };
}

const MEMBER_TYPE_LABEL: Record<string, string> = {
  student: "학생",
  parent: "학부모",
  mentor: "멘토",
  teacher: "선생님",
};

// 가입유형 필터 — 와이어프레임의 "전체 / 학생 / 학부모" 그대로다. mentor 는
// 별도 화면(멘토 신청 내역)이 있어 필터 칩에는 넣지 않지만, '전체'에는 나온다.
const MEMBER_TYPE_FILTERS = [
  { value: "", label: "전체" },
  { value: "student", label: "학생" },
  { value: "parent", label: "학부모" },
];

const TABS = [
  { key: "profile", label: "고객 상세 정보" },
  { key: "services", label: "이용서비스" },
  { key: "pay", label: "결제내역" },
  {
    key: "consult",
    label: "상담",
    pending: "상담 원장 테이블 도입 후 열립니다.",
  },
  { key: "msg", label: "알림톡·문자" },
  {
    key: "usage",
    label: "서비스이용내역",
    pending: "수집 항목·경로 확정 후 열립니다(기획 확인 대기).",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// 참조 HTML 의 결제 상태 문자열. orders.status CHECK 값과 1:1 이다.
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "결제대기",
  paid: "결제완료",
  waiting_deposit: "입금대기",
  failed: "결제실패",
  canceled: "취소",
  refunded: "환불완료",
};

const ACCESS_STATUS_LABEL: Record<string, string> = {
  inactive: "미활성",
  active: "이용중",
  expired: "만료",
  suspended: "정지",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ko-KR");
}

function formatMoney(value?: number | null) {
  if (value == null) return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

// 개인정보 마스킹 — 참조 HTML 의 "🔒 개인정보 마스킹" 토글이 요구하는 표기다
// (기본 마스킹, 버튼으로 해제). 연락처는 가운데 자리를, 이메일은 로컬파트
// 뒷부분을 가린다. 표시만 가리는 것이고 조회 자체를 막지는 않는다 — 조회
// 차단은 RLS(20260822000011)가 fn_admin_can('members','view')로 한다.
function maskPhone(value?: string | null) {
  if (!value) return "-";
  const digits = String(value).replace(/[^0-9]/g, "");
  if (digits.length < 7) return "***";
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}

function maskEmail(value?: string | null) {
  if (!value) return "-";
  const [local, domain] = String(value).split("@");
  if (!domain || !local) return "***";
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"*".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

const MEMBERS_PATH = "/admin/members";

// 목록에서 상세로 올 때 목록 주소의 검색 조건을 state 로 실어 와, 「목록으로」가 같은 필터의 목록을 연다.
interface DetailLocationState {
  listSearch?: string;
}

function listPathOf(state: unknown): string {
  const search = (state as DetailLocationState | null)?.listSearch ?? "";
  return `${MEMBERS_PATH}${search}`;
}

export default function MembersAdmin({ config }: MembersAdminProps) {
  return (
    <Routes>
      <Route index element={<MemberList config={config} />} />
      <Route path=":id/:tab?" element={<MemberDetailRoute config={config} />} />
      <Route path="*" element={<Navigate to={MEMBERS_PATH} replace />} />
    </Routes>
  );
}

function MemberList({ config }: MembersAdminProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // 검색어, 가입유형, 페이지는 주소에 둔다 — 상세에서 돌아와도 같은 목록이 열린다.
  const keyword = searchParams.get("q") ?? "";
  const memberType = searchParams.get("type") ?? "";
  const page = Math.max(
    1,
    Number.parseInt(searchParams.get("page") ?? "", 10) || 1,
  );

  function setParam(key: string, value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  function setPage(updater: number | ((prev: number) => number)) {
    const next = typeof updater === "function" ? updater(page) : updater;
    setParam("page", next > 1 ? String(next) : "");
  }

  // 개인정보 반출 게이트 (QA 268 다운로드).
  const { requestAccess, gate } = useSensitiveActionGate();

  // 이용서비스(QA G4)와 소속 이름은 서버가 목록 행에 얹어 보낸다(service_labels, tenant_name).
  const list = useQuery({
    queryKey: memberKeys.list,
    queryFn: ({ signal }) => fetchMembers(signal),
  });
  const rows = list.data?.items ?? [];

  useEffect(() => {
    if (list.error) reportAdminError(`${config.title} 조회 실패`, list.error);
  }, [list.error, config.title]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (memberType && String(row.member_type || "") !== memberType) {
        return false;
      }
      if (!q) return true;
      return searchable(row).includes(q);
    });
  }, [rows, keyword, memberType]);

  // QA 268 — 회원 목록 다운로드. 게이트를 통과한 뒤에만 실행된다.
  //
  // 목록 화면은 휴대폰을 maskedPhone 으로 가려 보여주지만, 이 파일은 **가리지 않은
  // 원본**을 내보낸다. 게이트(비밀번호 재확인 + 사유 + 로그)를 세운 이유가 바로
  // "권한 있는 사람이 필요할 때 원본을 받게 하되 그 사실을 남긴다"이므로, 통과한
  // 다음에도 마스킹된 파일을 주면 요구가 반쪽이 된다.
  function exportMembers() {
    const columns = config.columns.map((column) =>
      column.type === "maskedPhone" ? { ...column, type: undefined } : column,
    );

    downloadCsv(
      `${config.title}_${ymdIn(new Date(), browserTimeZone())}.csv`,
      filteredRows as unknown as Record<string, unknown>[],
      columns,
    );
  }

  function requestExport() {
    if (filteredRows.length === 0) {
      toastWarning("내보낼 데이터가 없습니다.");
      return;
    }

    requestAccess({
      action: "download",
      resourceKey: "members",
      title: "회원 목록 다운로드",
      description: `회원 ${filteredRows.length.toLocaleString()}건의 개인정보(이름·이메일·연락처)가 CSV 파일로 저장됩니다.`,
      rowCount: filteredRows.length,
      onGranted: exportMembers,
    });
  }

  return (
    <div>
      {gate}

      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => list.refetch()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              초기화
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={requestExport}
            >
              <Download size={14} aria-hidden="true" />
              엑셀 다운로드
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={memberType}
              onChange={(value) => setParam("type", value)}
              aria-label="회원구분"
            >
              {MEMBER_TYPE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <div className="flex items-center">
              <Input
                value={keyword}
                onChange={(e) => setParam("q", e.target.value)}
                placeholder={config.searchPlaceholder}
                aria-label="회원 검색"
                className="h-9 w-80 font-medium"
              />
            </div>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-semibold">{config.title}</h1>
      </div>

      {list.isPending ? (
        <div className="bg-white p-6 shadow-sm">
          <AdminTableSkeleton
            columns={config.columns.length}
            label="회원 목록을 불러오는 중"
          />
        </div>
      ) : (
        <AdminTable
          config={config}
          rows={filteredRows}
          page={page}
          setPage={setPage}
          onEdit={(row: ProfileRow) =>
            navigate(`${MEMBERS_PATH}/${row.id}`, {
              state: { listSearch: location.search },
            })
          }
          onDelete={() => {}}
        />
      )}
    </div>
  );
}

function MemberDetailRoute({ config }: MembersAdminProps) {
  const { id = "", tab } = useParams();
  const location = useLocation();
  const member = useQuery({
    queryKey: memberKeys.detail(id),
    queryFn: ({ signal }) => fetchMember(id, signal),
  });

  useEffect(() => {
    if (
      member.error &&
      !(member.error instanceof ApiError && member.error.status === 404)
    )
      reportAdminError(`${config.title} 조회 실패`, member.error);
  }, [member.error, config.title]);

  if (tab && !TABS.some((item) => item.key === tab)) {
    return (
      <Navigate to={`${MEMBERS_PATH}/${id}`} replace state={location.state} />
    );
  }

  if (member.isPending) {
    return <AdminDetailSkeleton rows={8} label="회원 정보를 불러오는 중" />;
  }

  if (member.isError) {
    const notFound =
      member.error instanceof ApiError && member.error.status === 404;
    return (
      <div className="bg-white p-12 text-center text-sm font-medium text-muted-foreground shadow-sm">
        <p>
          {notFound
            ? "회원을 찾을 수 없습니다."
            : "회원 정보를 불러오지 못했습니다."}
        </p>
        <Link
          to={listPathOf(location.state)}
          className="mt-4 inline-block font-semibold text-foreground underline"
        >
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <MemberDetail
      key={member.data.id}
      config={config}
      member={member.data}
      tab={(tab ?? "profile") as TabKey}
    />
  );
}

function MemberDetail({
  config,
  member,
  tab,
}: MembersAdminProps & { member: ProfileRow; tab: TabKey }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [unmasked, setUnmasked] = useState(false);

  // 개인정보 반출 게이트 (QA 269 마스킹 해제).
  const { requestAccess, gate } = useSensitiveActionGate();

  // 탭마다 자기 데이터만 받는다. 한 탭이 실패해도 나머지 탭은 그대로 열린다.
  const links = useQuery({
    queryKey: memberKeys.links(member.id),
    queryFn: ({ signal }) => fetchMemberLinks(member.id, signal),
    enabled: tab === "profile",
  });
  const services = useQuery({
    queryKey: memberKeys.services(member.id),
    queryFn: ({ signal }) => fetchMemberServices(member.id, signal),
    enabled: tab === "services",
  });
  const orders = useQuery({
    queryKey: memberKeys.orders(member.id),
    queryFn: ({ signal }) => fetchMemberOrders(member.id, signal),
    enabled: tab === "pay",
  });
  const messages = useQuery({
    queryKey: memberKeys.messages(member.id),
    queryFn: ({ signal }) => fetchMemberMessages(member.id, signal),
    enabled: tab === "msg",
  });
  const activeQuery =
    tab === "profile"
      ? links
      : tab === "services"
        ? services
        : tab === "pay"
          ? orders
          : tab === "msg"
            ? messages
            : null;
  const detailLoading = activeQuery?.isPending ?? false;
  const activeError = activeQuery?.error ?? null;
  const detailError = activeError
    ? "일부 데이터를 불러오지 못했습니다. 아래 항목이 비어 있을 수 있습니다."
    : "";

  useEffect(() => {
    if (activeError)
      reportAdminError("일부 데이터를 불러오지 못했습니다", activeError);
  }, [activeError]);

  // 소속(테넌트) 목록 — 상세의 소속 배정 드롭다운이 쓴다. 실패하면 소속 없음만 남는다.
  const tenantOptions = useQuery({
    queryKey: memberKeys.tenantOptions,
    queryFn: ({ signal }) => fetchTenantOptions(signal),
  });
  const tenants = tenantOptions.data?.items ?? [];

  useEffect(() => {
    if (tenantOptions.error)
      reportAdminError("소속 목록 조회 실패", tenantOptions.error);
  }, [tenantOptions.error]);

  const [draft, setDraft] = useState("");
  // 회원구분(QA 186) — dev 가 제네릭 폼 필드로 추가했는데 이 화면이 custom 으로
  // 바뀌면서 그 폼이 사라졌다. 목록에 값만 뜨고 고칠 데가 없으면 요구가 반쪽이라
  // 여기서 인라인으로 편집한다. 고정 목록이 아니라 자유 텍스트다(DB CHECK 없음).
  const [categoryDraft, setCategoryDraft] = useState(
    member.member_category || "",
  );
  // 학부모 핸드폰(guardian_phone) — 회원구분과 마찬가지로 이 화면이 custom 으로
  // 바뀌며 제네릭 편집 폼이 없어져서 인라인으로 직접 편집한다. SMS 인증 없이
  // 어드민이 바로 고쳐 쓰는 값이다(연락·복구 채널 승격).
  const [guardianPhoneDraft, setGuardianPhoneDraft] = useState(
    member.guardian_phone || "",
  );
  // 소속(테넌트) 배정/해제(2026-09-22, WC072) — categoryDraft 와 같은 인라인
  // 편집 패턴. 값은 tenants.id(uuid) 또는 빈 문자열(소속 없음)이다.
  const [tenantDraft, setTenantDraft] = useState(member.tenant_id || "");
  // 스쿨멘토 학생의 기관 이동 폼(사 결정 r4 4번). 열려 있으면 대상 기관을 담는다.
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moveDirty, setMoveDirty] = useState(false);

  // 고친 폼이 있으면 이 회원 화면을 나갈 때 묻는다. 같은 회원의 탭 이동은 막지 않는다.
  const dirty =
    categoryDraft.trim() !== (member.member_category ?? "") ||
    guardianPhoneDraft.trim() !== (member.guardian_phone ?? "") ||
    moveDirty;
  useUnsavedGuard(
    dirty,
    (next) =>
      next.pathname === `${MEMBERS_PATH}/${member.id}` ||
      next.pathname.startsWith(`${MEMBERS_PATH}/${member.id}/`),
  );

  // 저장 결과를 상세와 목록 캐시에 바로 반영한다(재조회 없이).
  function syncMember(updated: ProfileRow) {
    queryClient.setQueryData<ProfileRow>(
      memberKeys.detail(updated.id),
      (old) => (old ? { ...old, ...updated } : updated),
    );
    queryClient.setQueryData<{ items: ProfileRow[] }>(memberKeys.list, (old) =>
      old
        ? {
            items: old.items.map((row) =>
              row.id === updated.id ? { ...row, ...updated } : row,
            ),
          }
        : old,
    );
  }

  // QA 269 — 마스킹 해제도 같은 게이트를 탄다. 다시 가리는 방향(해제 → 마스킹)은
  // 개인정보가 나가는 동작이 아니라 그냥 통과시킨다.
  function toggleMasking() {
    if (unmasked) {
      setUnmasked(false);
      return;
    }

    requestAccess({
      action: "unmask",
      resourceKey: "members",
      title: "개인정보 마스킹 해제",
      description: `${member.name || "이 회원"}의 연락처·이메일 원본이 화면에 표시됩니다.`,
      targetId: member.id,
      onGranted: () => setUnmasked(true),
    });
  }

  const phoneOf = (row?: ProfileRow | null) =>
    unmasked ? row?.phone || "-" : maskPhone(row?.phone);
  const emailOf = (row?: ProfileRow | null) =>
    unmasked ? row?.email || "-" : maskEmail(row?.email);
  // 자유 문구 발송 — 알림톡이 아니라 SMS/LMS 다(알림톡은 승인 템플릿 본문만
  // 보낼 수 있다). 90바이트를 넘으면 서버가 LMS 로 올려 보내고 단가가 3배
  // 이상이라, 아래 폼이 바이트 수를 실시간으로 보여준다.
  const sendMutation = useMutation({
    mutationFn: (text: string) => sendMemberMessage(member.id, text),
    onSuccess: async (result) => {
      setDraft("");
      await queryClient.invalidateQueries({
        queryKey: memberKeys.messages(member.id),
      });
      toastSuccess(`발송했습니다 (${result.channel}).`);
    },
    onError: (error) => reportAdminError("발송 실패", error),
  });

  function sendMessage() {
    if (sendMutation.isPending) return;

    const text = draft.trim();
    if (!text) {
      toastWarning("보낼 내용을 입력해 주세요.");
      return;
    }

    sendMutation.mutate(text);
  }

  // 회원구분과 학부모 핸드폰은 각자 그 필드만 PATCH 로 보낸다.
  const saveCategory = useMutation({
    mutationFn: (next: string | null) =>
      patchMember(member.id, { member_category: next }),
    onSuccess: (updated) => {
      syncMember(updated);
      toastSuccess("회원구분을 저장했습니다.");
    },
    onError: (error) => reportAdminError("회원구분 저장 실패", error),
  });
  const saveGuardian = useMutation({
    mutationFn: (next: string | null) =>
      patchMember(member.id, { guardian_phone: next }),
    onSuccess: (updated) => {
      syncMember(updated);
      toastSuccess("학부모 핸드폰을 저장했습니다.");
    },
    onError: (error) => reportAdminError("학부모 핸드폰 저장 실패", error),
  });

  function saveMemberCategory() {
    if (saveCategory.isPending) return;
    saveCategory.mutate(categoryDraft.trim() || null);
  }

  function saveGuardianPhone() {
    if (saveGuardian.isPending) return;
    saveGuardian.mutate(guardianPhoneDraft.trim() || null);
  }

  // 소속 배정/해제(2026-09-22, WC072) — categoryDraft/guardianPhoneDraft 와
  // 같은 인라인 저장 패턴이지만, profiles.tenant_id 는 서버의 전용 소속 저장 API 로만 바꾼다
  // (fn_profiles_lock_tenant 트리거, WC070). 오류 문구는 서버가 한국어로 보낸다.
  const saveTenantMutation = useMutation({
    mutationFn: (tenantId: string | null) =>
      putMemberTenant(member.id, tenantId),
    onSuccess: (updated) => {
      syncMember(updated);
      toastSuccess("소속을 저장했습니다.");
    },
    onError: (error) =>
      error instanceof ApiError
        ? toastError(error.detail)
        : reportAdminError("소속 저장 실패", error),
  });

  function saveTenant() {
    if (saveTenantMutation.isPending) return;

    const nextId = tenantDraft || null;

    // 저장된 member_type 원본 기준이다.
    const isEnrollmentStudent =
      site.features.studentEnrollment &&
      String(member.member_type || "") === "student";
    // 스쿨멘토의 학생은 소속만 비우면 학적이 옛 기관에 남는다. 기타 기관으로 옮겨 학적을 정리한다.
    // 위닝은 소속 없음이 개인 회원이라, 서버가 올해 학적을 같이 지운다(아래 저장 API 그대로).
    if (isEnrollmentStudent && site.key === "schoolmentor" && !nextId) {
      toastWarning(
        "학생은 소속 없음으로 바꿀 수 없어요. 「기타」로 옮겨 주세요.",
      );
      return;
    }

    // 학생은 소속만이 아니라 학적도 옮겨야 새 기관 콘솔에 보인다. 학년과 반을 받는 이동 폼으로 보낸다.
    // 학생이 아니거나 소속 없음(위닝)이면 아래 저장 API 그대로다.
    const target = nextId
      ? tenants.find((tenant) => tenant.id === nextId)
      : undefined;
    if (isEnrollmentStudent && target && nextId !== member.tenant_id) {
      setMoveTarget({
        id: target.id,
        name: target.name,
        orgType: target.org_type,
        isCatchAll: target.is_catch_all,
      });
      return;
    }

    saveTenantMutation.mutate(nextId);
  }

  // 이동 API 가 학적까지 옮긴 뒤 상세와 목록을 다시 읽는다. school_name 은 서버가 정한다.
  function onStudentMoved() {
    setMoveTarget(null);
    queryClient.invalidateQueries({ queryKey: memberKeys.detail(member.id) });
    queryClient.invalidateQueries({ queryKey: memberKeys.list });
    toastSuccess("학생을 옮겼습니다.");
  }

  // 결제 요약 3종 — 참조 HTML 의 "이번 달 결제 / 미납액 / 누적 결제액".
  // 미납액은 아직 결제가 끝나지 않은 주문(pending·waiting_deposit)의 합으로
  // 잡는다. 취소·실패·환불은 받을 돈이 아니므로 제외한다.
  const orderRows = orders.data?.items ?? [];
  const paySummary = useMemo(() => {
    const now = new Date();
    let thisMonth = 0;
    let unpaid = 0;
    let total = 0;

    for (const order of orderRows) {
      const amount = Number(order.amount || 0);
      if (order.status === "paid") {
        total += amount;
        const paidAt = order.paid_at ? new Date(order.paid_at) : null;
        if (
          paidAt &&
          paidAt.getFullYear() === now.getFullYear() &&
          paidAt.getMonth() === now.getMonth()
        ) {
          thisMonth += amount;
        }
      } else if (
        order.status === "pending" ||
        order.status === "waiting_deposit"
      ) {
        unpaid += amount;
      }
    }

    return { thisMonth, unpaid, total };
  }, [orderRows]);

  const base = `${MEMBERS_PATH}/${member.id}`;
  const activeTab = TABS.find((t) => t.key === tab);
  // 저장된 member_type 원본 기준이다.
  const isParent = String(member.member_type || "") === "parent";

  return (
    <div>
      {gate}

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          {config.title} 상세
        </h1>
        <div className="flex items-center gap-2">
          <ActionButton variant="light" onClick={toggleMasking}>
            {unmasked ? (
              <EyeOff size={14} aria-hidden="true" />
            ) : (
              <Eye size={14} aria-hidden="true" />
            )}
            {unmasked ? "개인정보 마스킹" : "마스킹 해제"}
          </ActionButton>
          <ActionButton
            variant="light"
            onClick={() => navigate(listPathOf(location.state))}
          >
            목록으로
          </ActionButton>
        </div>
      </div>

      {/* 요약 헤더 — 참조 HTML 의 상단 프로필 블록 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 bg-white px-6 py-5 shadow-sm">
        <div>
          <div className="text-lg font-semibold">{member.name || "-"}</div>
          <div className="text-xs font-medium text-muted-foreground">
            {member.username || "-"}
          </div>
        </div>
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">유형 </span>
          {MEMBER_TYPE_LABEL[String(member.member_type || "")] ||
            member.member_type ||
            "-"}
        </div>
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">학교 </span>
          {member.school_name || "-"}
        </div>
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">연락처 </span>
          {phoneOf(member)}
        </div>
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">가입일 </span>
          {formatDate(member.created_at)}
        </div>
      </div>

      {/* 탭 */}
      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate(value === "profile" ? base : `${base}/${value}`, {
            replace: true,
            state: location.state,
          })
        }
      >
        <TabsList
          variant="line"
          className="mb-2 group-data-horizontal/tabs:h-auto flex-wrap"
        >
          {TABS.map((item) => (
            <TabsTrigger key={item.key} value={item.key} className="px-4">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {detailError && (
          <div
            role="alert"
            className="mb-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-medium text-[#7A4A12]"
          >
            {detailError}
          </div>
        )}

        <TabsContent value={tab}>
          {detailLoading ? (
            <AdminDetailSkeleton rows={6} label="탭 내용을 불러오는 중" />
          ) : activeTab && "pending" in activeTab && activeTab.pending ? (
            <div className="bg-white p-10 shadow-sm">
              <h2 className="text-lg font-semibold">{activeTab.label}</h2>
              <div className="mt-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-medium text-[#7A4A12]">
                {activeTab.pending}
              </div>
            </div>
          ) : tab === "profile" ? (
            <ProfilePane
              profile={member}
              isParent={isParent}
              links={links.data?.items ?? []}
              unmasked={unmasked}
              phoneOf={phoneOf}
              emailOf={emailOf}
              categoryDraft={categoryDraft}
              setCategoryDraft={setCategoryDraft}
              onSaveCategory={saveMemberCategory}
              savingCategory={saveCategory.isPending}
              guardianPhoneDraft={guardianPhoneDraft}
              setGuardianPhoneDraft={setGuardianPhoneDraft}
              onSaveGuardianPhone={saveGuardianPhone}
              savingGuardianPhone={saveGuardian.isPending}
              tenants={tenants}
              tenantDraft={tenantDraft}
              setTenantDraft={setTenantDraft}
              onSaveTenant={saveTenant}
              savingTenant={saveTenantMutation.isPending}
              moveForm={
                moveTarget ? (
                  <MoveStudentForm
                    key={moveTarget.id}
                    profileId={member.id}
                    tenant={moveTarget}
                    onMoved={onStudentMoved}
                    onDirtyChange={setMoveDirty}
                    onCancel={() => {
                      setMoveTarget(null);
                      setTenantDraft(member.tenant_id || "");
                    }}
                  />
                ) : null
              }
            />
          ) : tab === "services" ? (
            <ServicesPane accesses={services.data?.items ?? []} />
          ) : tab === "msg" ? (
            <MessagePane
              messages={messages.data?.items ?? []}
              draft={draft}
              setDraft={setDraft}
              onSend={sendMessage}
              sending={sendMutation.isPending}
            />
          ) : (
            <PayPane
              orders={orderRows}
              summary={paySummary}
              viewerId={member.id}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 탭 본문
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] border-b last:border-b-0">
      <div className="bg-muted px-5 py-3 text-sm font-semibold">{label}</div>
      <div className="whitespace-pre-line px-5 py-3 text-sm">{value}</div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <UiCard size="sm" className="mb-6 gap-0 py-0">
      <div className="border-b bg-muted px-5 py-3 text-sm font-semibold">
        {title}
      </div>
      {children}
    </UiCard>
  );
}

function ProfilePane({
  profile,
  isParent,
  links,
  unmasked,
  phoneOf,
  emailOf,
  categoryDraft,
  setCategoryDraft,
  onSaveCategory,
  savingCategory,
  guardianPhoneDraft,
  setGuardianPhoneDraft,
  onSaveGuardianPhone,
  savingGuardianPhone,
  tenants,
  tenantDraft,
  setTenantDraft,
  onSaveTenant,
  savingTenant,
  moveForm,
}: {
  profile: ProfileRow;
  isParent: boolean;
  links: LinkedPerson[];
  unmasked: boolean;
  phoneOf: (row?: ProfileRow | null) => string;
  emailOf: (row?: ProfileRow | null) => string;
  categoryDraft: string;
  setCategoryDraft: (value: string) => void;
  onSaveCategory: () => void;
  savingCategory: boolean;
  guardianPhoneDraft: string;
  setGuardianPhoneDraft: (value: string) => void;
  onSaveGuardianPhone: () => void;
  savingGuardianPhone: boolean;
  tenants: { id: string; name: string }[];
  tenantDraft: string;
  setTenantDraft: (value: string) => void;
  onSaveTenant: () => void;
  savingTenant: boolean;
  moveForm: ReactNode;
}) {
  const address = [profile.address, profile.address_detail]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Card title="기본 정보">
        <Row
          label="회원유형"
          value={
            MEMBER_TYPE_LABEL[String(profile.member_type || "")] ||
            profile.member_type ||
            "-"
          }
        />
        <Row label="아이디" value={profile.username || "-"} />
        <Row label="이름" value={profile.name || "-"} />
        <Row label="성별" value={profile.gender || "-"} />
        <Row label="생년월일" value={profile.birth_date || "-"} />
        {/* 소속(2026-09-22, org_code 자유 입력 → tenants FK 배정/해제 전환).
            client 쪽 권한 체크는 두지 않는다 — 회원구분/학부모 핸드폰 인라인
            편집(saveMemberCategory/saveGuardianPhone)과 같은 원칙으로, 쓰기는
            fn_admin_set_profile_tenant RPC 가 fn_admin_can('members','edit')
            로 서버에서 게이트한다(WC072). 조회 전용 관리자가 눌러도 화면이
            숨겨져 있지 않을 뿐 저장은 실패 alert 로 막힌다. */}
        <Row
          label="소속"
          value={
            <>
              <div className="flex items-center gap-2">
                <span className="max-w-[13.75rem]">
                  <Select
                    value={tenantDraft}
                    onChange={setTenantDraft}
                    aria-label="소속"
                  >
                    <option value="">소속 없음</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </Select>
                </span>
                <ActionButton onClick={onSaveTenant} disabled={savingTenant}>
                  {savingTenant ? "저장 중..." : "저장"}
                </ActionButton>
              </div>
              {moveForm}
            </>
          }
        />
        <Row label="가입일" value={formatDateTime(profile.created_at)} />
        <Row
          label="계정 상태"
          value={profile.is_active === false ? "비활성" : "활성"}
        />
      </Card>

      <Card title="연락처">
        <Row label="이메일" value={emailOf(profile)} />
        <Row label="휴대전화" value={phoneOf(profile)} />
        <Row
          label="유선전화"
          value={
            unmasked ? profile.landline || "-" : maskPhone(profile.landline)
          }
        />
        {/* 학부모 핸드폰(guardian_phone) — 학생 계정의 연락·복구 채널로 승격된
            값이라 조회뿐 아니라 운영자가 직접 고칠 수 있어야 한다. 다른 연락처
            항목과 같은 마스킹 게이트를 타되, 해제 상태에서만 편집 인풋을 연다
            (마스킹된 값을 보며 고치는 건 의미가 없다). 저장은 회원구분과 같은
            방식 — SMS 인증 없이 profiles 를 바로 update 한다. */}
        <Row
          label="학부모 핸드폰"
          value={
            unmasked ? (
              <div className="flex items-center gap-2">
                <TextInput
                  value={guardianPhoneDraft}
                  onChange={(value) =>
                    setGuardianPhoneDraft(formatPhoneInput(value))
                  }
                  placeholder="010-0000-0000"
                  aria-label="학부모 핸드폰"
                  className="max-w-[13.75rem]"
                />
                <ActionButton
                  onClick={onSaveGuardianPhone}
                  disabled={savingGuardianPhone}
                >
                  {savingGuardianPhone ? "저장 중..." : "저장"}
                </ActionButton>
              </div>
            ) : (
              maskPhone(profile.guardian_phone)
            )
          }
        />
        <Row label="주소" value={address || "-"} />
        <Row label="지역" value={profile.region || "-"} />
      </Card>

      <Card title="학교">
        <Row label="학교명" value={profile.school_name || "-"} />
        <Row label="학교구분" value={profile.school_type || "-"} />
      </Card>

      {/* 와이어프레임: 학생 상세엔 「연결 학부모」, 학부모 상세엔 「연결 학생1·2」 */}
      <Card title={isParent ? "연결 학생" : "연결 학부모"}>
        {links.length === 0 ? (
          <Row label="연결 없음" value="승인·대기 중인 연결이 없습니다." />
        ) : (
          links.map((link, index) => (
            <div key={link.linkId}>
              <Row
                label={`${isParent ? "학생" : "학부모"}${links.length > 1 ? ` ${index + 1}` : ""}`}
                value={`${link.profile?.name || "(프로필 없음)"}${
                  link.status === "pending" ? " · 승인 대기" : ""
                }`}
              />
              <Row label="이메일" value={emailOf(link.profile)} />
              <Row label="연락처" value={phoneOf(link.profile)} />
            </div>
          ))
        )}
      </Card>

      {/* 참조 HTML 의 「이용 동의 현황」 */}
      <Card title="이용 동의 현황">
        <Row
          label="서비스 이용약관"
          value={profile.terms_service_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="개인정보 수집·이용 (필수)"
          value={profile.privacy_required_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="개인정보 수집·이용 (선택)"
          value={profile.privacy_optional_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="마케팅 정보 수신"
          value={profile.marketing_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="이벤트·프로모션 안내"
          value={profile.ads_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="문자 수신"
          value={profile.sms_agreed ? "동의완료" : "미동의"}
        />
      </Card>

      <Card title="운영 메모">
        <Row label="메모" value={profile.memo || "-"} />
        <Row
          label="회원 ID"
          value={<span className="font-mono text-xs">{profile.id}</span>}
        />
      </Card>
    </>
  );
}

function ServicesPane({ accesses }: { accesses: ProgramAccessRow[] }) {
  if (accesses.length === 0) {
    return (
      <div className="bg-white p-12 text-center text-sm font-medium text-muted-foreground shadow-sm">
        이용 중이거나 보유한 서비스가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {accesses.map((access) => {
        // starts_at/expires_at 이 정본이고 access_* 는 미러다(program_access
        // 컬럼 주석). 정본이 비어 있을 때만 미러를 보조로 쓴다.
        const startsAt = access.starts_at || access.access_started_at;
        const expiresAt = access.expires_at || access.access_expires_at;

        return (
          <UiCard key={access.id} size="sm" className="gap-0 p-5">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">
                {access.program_key}
              </div>
              <Badge variant="outline">
                {ACCESS_STATUS_LABEL[String(access.access_status || "")] ||
                  access.access_status ||
                  "-"}
              </Badge>
            </div>

            <div className="mt-3 text-sm text-muted-foreground">
              {startsAt || expiresAt
                ? `${formatDate(startsAt)} ~ ${expiresAt ? formatDate(expiresAt) : "무기한"}`
                : "기간 정보 없음"}
            </div>

            <div className="mt-1 text-sm text-muted-foreground">
              결제 {access.payment_status || "-"} ·{" "}
              {formatMoney(access.paid_amount)}
            </div>
          </UiCard>
        );
      })}
    </div>
  );
}

// viewerId — 지금 보고 있는 회원. 이 도메인은 **학부모가 학생의 서비스를 결제**하고
// (orders_user_id_is_parent_check: CHECK (user_id = parent_profile_id)) 그 주문이
// 누구를 위한 것인지는 student_profile_id 가 들고 있다. 그래서 같은 주문이 학부모
// 상세에도, 학생 상세에도 나온다 — 어느 쪽으로 보고 있는지를 「구분」열로 드러내지
// 않으면 "내가 결제한 것"과 "나를 위해 결제된 것"이 구별되지 않는다.
// (매출/결제 관리 와이어프레임도 같은 이유로 결제자와 이용 학생을 따로 두고 있다.)
function PayPane({
  orders,
  summary,
  viewerId,
}: {
  orders: OrderRow[];
  summary: { thisMonth: number; unpaid: number; total: number };
  viewerId: string;
}) {
  return (
    <>
      {/* 참조 HTML 의 요약 3카드 */}
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        {[
          { label: "이번 달 결제", value: summary.thisMonth },
          { label: "미납액", value: summary.unpaid },
          { label: "누적 결제액", value: summary.total },
        ].map((item) => (
          <UiCard key={item.label} size="sm" className="gap-0 p-5">
            <div className="text-sm font-medium text-muted-foreground">
              {item.label}
            </div>
            <div className="mt-2 text-xl font-semibold">
              {formatMoney(item.value)}
            </div>
          </UiCard>
        ))}
      </div>

      <div className="bg-white shadow-sm">
        <Table className="min-w-215">
          <TableHeader>
            <TableRow className="bg-muted hover:bg-transparent">
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                주문번호
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                승인 일시
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                상품
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                구분
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                결제 수단
              </TableHead>
              <TableHead
                scope="col"
                className="text-right px-4 py-3 font-semibold whitespace-normal"
              >
                결제 금액
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                상태
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  결제 내역이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="px-4 py-3 font-mono text-xs">
                    {order.id}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {formatDateTime(order.paid_at || order.created_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal">
                    {order.order_name || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {order.parent_profile_id === viewerId
                      ? order.student_profile_id === viewerId
                        ? "본인 결제"
                        : "결제자"
                      : "이용자"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {order.method || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    {formatMoney(order.amount)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {ORDER_STATUS_LABEL[String(order.status || "")] ||
                      order.status ||
                      "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 알림톡·문자 탭
//
// 이력은 alimtalk_send_logs 한 표에서 온다 — 크론이 보낸 리포트 알림톡과
// 운영자가 보낸 문자가 같은 표에 쌓인다. 그래야 "이 회원에게 무엇이 나갔나"를
// 한 화면에서 답할 수 있다.
//
// 발송은 알림톡이 아니라 SMS/LMS 다(알림톡은 승인 템플릿 본문만 가능).
// 참조 HTML 의 "90byte 초과 시 자동으로 LMS(장문)로 전환됩니다" 안내가 그 얘기다.
// ---------------------------------------------------------------------------

/** EUC-KR 기준 바이트, 한글/전각 2, 그 외 1. api/_lib/messaging/aligo.ts 의 규칙과 같다. */
function smsBytes(text: string): number {
  let bytes = 0;
  for (const ch of text) bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes;
}

const TEMPLATE_LABEL: Record<string, string> = {
  dailyReport: "일간 보고서",
  weeklyReport: "주간 리포트",
  monthlyReport: "월간 리포트",
  signupCoupon: "회원가입 축하",
  manualMessage: "직접 발송",
};

function MessagePane({
  messages,
  draft,
  setDraft,
  onSend,
  sending,
}: {
  messages: MessageLogRow[];
  draft: string;
  setDraft: (value: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const bytes = smsBytes(draft);
  const isLong = bytes > 90;

  return (
    <>
      <div className="mb-4 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">새 메시지 보내기</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          자유 문구는 문자로 나갑니다. 알림톡은 카카오 승인을 받은 템플릿 본문만
          보낼 수 있습니다.
        </p>

        <div className="mt-4">
          <Textarea
            value={draft}
            onChange={setDraft}
            rows={4}
            aria-label="메시지 내용"
          />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span
            className={`text-xs font-medium ${isLong ? "text-primary" : "text-muted-foreground"}`}
          >
            {bytes} / 90 byte
            {isLong &&
              " — 90byte를 넘어 LMS(장문)로 전환됩니다. 단가가 3배 이상입니다."}
          </span>
          <ActionButton onClick={onSend} disabled={sending}>
            {sending ? "보내는 중..." : "발송"}
          </ActionButton>
        </div>
      </div>

      <div className="bg-white shadow-sm">
        <Table className="min-w-215">
          <TableHeader>
            <TableRow className="bg-muted hover:bg-transparent">
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                발송 일시
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                채널
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                종류
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                메시지 내용
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-3 font-semibold whitespace-normal"
              >
                상태
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  발송 이력이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              messages.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="px-4 py-3">
                    {formatDateTime(row.sent_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3">{row.channel}</TableCell>
                  <TableCell className="px-4 py-3">
                    {TEMPLATE_LABEL[row.template_key] || row.template_key}
                  </TableCell>
                  {/* 본문이 길어 표를 밀지 않도록 줄바꿈은 살리되 폭을 제한한다. */}
                  <TableCell className="max-w-105 px-4 py-3 whitespace-pre-line text-foreground">
                    {row.message}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {row.status === "sent" ? (
                      "발송 완료"
                    ) : (
                      <span
                        className="text-primary"
                        title={row.provider_message || undefined}
                      >
                        실패
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
