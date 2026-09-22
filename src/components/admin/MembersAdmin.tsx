import { Download, Eye, EyeOff, RefreshCw, Search } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useSensitiveActionGate } from "@/components/admin/SensitiveActionGate";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPhoneInput } from "@/lib/phoneVerification";
import { supabase } from "@/lib/supabase";
import { AdminTable } from "@/pages/admin/shared/AdminEngine";
import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import { downloadCsv, searchable } from "@/pages/admin/shared/csvExport";
import {
  ActionButton,
  Select,
  Textarea,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { useAdminDetailBack } from "@/pages/admin/shared/useAdminDetailBack";

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
//                     (api/_lib/aligo.ts 는 인증번호 단일 템플릿 전용이고
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
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  member_type?: string | null;
  role?: string | null;
  created_at?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  school_name?: string | null;
  school_type?: string | null;
  region?: string | null;
  address?: string | null;
  address_detail?: string | null;
  landline?: string | null;
  guardian_phone?: string | null;
  memo?: string | null;
  member_category?: string | null;
  // 2026-09-22 — org_code(자유 입력 text, 죽은 컬럼)를 tenants FK 로 대체.
  tenant_id?: string | null;
  // profiles 컬럼이 아니라 loadRows()가 tenants 를 묶어 얹는 파생 필드다
  // (service_labels 와 같은 방식).
  tenant_name?: string;
  // profiles 컬럼이 아니라 loadRows()가 program_access 를 묶어 얹는 파생 필드다.
  service_labels?: string;
  is_active?: boolean | null;
  terms_service_agreed?: boolean | null;
  privacy_required_agreed?: boolean | null;
  privacy_optional_agreed?: boolean | null;
  marketing_agreed?: boolean | null;
  ads_agreed?: boolean | null;
  sms_agreed?: boolean | null;
  [key: string]: unknown;
}

interface LinkedPerson {
  linkId: string;
  status: string;
  profile: ProfileRow | null;
}

interface ProgramAccessRow {
  id: string;
  program_key: string;
  payment_status?: string | null;
  access_status?: string | null;
  paid_amount?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  access_started_at?: string | null;
  access_expires_at?: string | null;
}

interface OrderRow {
  id: string;
  student_profile_id?: string | null;
  parent_profile_id?: string | null;
  status?: string | null;
  order_name?: string | null;
  amount?: number | null;
  list_amount?: number | null;
  discount_amount?: number | null;
  method?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
}

interface MessageLogRow {
  id: number;
  template_key: string;
  channel: string;
  subject?: string | null;
  message: string;
  status: string;
  provider_message?: string | null;
  sent_at: string;
}

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

export default function MembersAdmin({ config }: MembersAdminProps) {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [memberType, setMemberType] = useState("");
  const [page, setPage] = useState(1);
  // 소속(테넌트) 목록(2026-09-22) — 목록의 tenant_name 파생과 상세의 소속
  // 배정 드롭다운이 함께 쓴다. RLS 는 fn_admin_can('tenants','view') 라
  // 이 화면에 들어온 어드민이면 통과한다.
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);

  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [tab, setTab] = useState<TabKey>("profile");
  const [unmasked, setUnmasked] = useState(false);

  // QA 317 — 상세는 라우트가 아니라 state 라, 뒤로가기가 목록이 아닌 직전 메뉴로
  // 튄다. 상세를 열 때 히스토리 항목을 하나 쌓아 뒤로가기가 그걸 소비하게 한다.
  useAdminDetailBack(Boolean(selected), closeDetail);

  // 개인정보 반출 게이트 (QA 268 다운로드 · 269 마스킹 해제).
  const { requestAccess, gate } = useSensitiveActionGate();

  const [links, setLinks] = useState<LinkedPerson[]>([]);
  const [accesses, setAccesses] = useState<ProgramAccessRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [messages, setMessages] = useState<MessageLogRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // 회원구분(QA 186) — dev 가 제네릭 폼 필드로 추가했는데 이 화면이 custom 으로
  // 바뀌면서 그 폼이 사라졌다. 목록에 값만 뜨고 고칠 데가 없으면 요구가 반쪽이라
  // 여기서 인라인으로 편집한다. 고정 목록이 아니라 자유 텍스트다(DB CHECK 없음).
  const [categoryDraft, setCategoryDraft] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  // 학부모 핸드폰(guardian_phone) — 회원구분과 마찬가지로 이 화면이 custom 으로
  // 바뀌며 제네릭 편집 폼이 없어져서 인라인으로 직접 편집한다. SMS 인증 없이
  // 어드민이 바로 고쳐 쓰는 값이다(연락·복구 채널 승격).
  const [guardianPhoneDraft, setGuardianPhoneDraft] = useState("");
  const [savingGuardianPhone, setSavingGuardianPhone] = useState(false);
  // 소속(테넌트) 배정/해제(2026-09-22, WC072) — categoryDraft 와 같은 인라인
  // 편집 패턴. 값은 tenants.id(uuid) 또는 빈 문자열(소속 없음)이다. 쓰기는
  // 반드시 fn_admin_set_profile_tenant RPC 전용이다 — profiles.tenant_id 를
  // 직접 UPDATE 하면 fn_profiles_lock_tenant 트리거(WC070)가 막는다.
  const [tenantDraft, setTenantDraft] = useState("");
  const [savingTenant, setSavingTenant] = useState(false);

  async function loadRows() {
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert(`${config.title} 조회 실패: ${error.message}`);
      setLoading(false);
      setRows([]);
      return;
    }

    const profileRows = (data as ProfileRow[]) || [];

    // 이용서비스(QA G4) — program_access 를 한 번에 묶어 회원별 콤마 조인
    // 문자열로 얹는다. 목록 화면이 회원 수만큼 상세 쿼리를 날리지 않도록
    // profiles 조회와 별개로 딱 한 번만 조회한다. access_status='active'
    // 인 것만 "이용 중"으로 본다(inactive/expired/suspended 는 제외 —
    // program_access_access_status_check 의 4개 값 중 active 만 실제 이용).
    // program_key 라벨 맵이 저장소 어디에도 없어(program_key label map 미존재,
    // 2026-08-27 조사) 원문 키를 그대로 보여준다.
    const { data: accessRows, error: accessError } = await supabase
      .from("program_access")
      .select("id, program_key, access_status");

    if (accessError) {
      console.error(accessError);
    }

    const servicesById = new Map<string, string[]>();
    for (const row of accessRows || []) {
      if (row.access_status !== "active") continue;
      const list = servicesById.get(row.id) || [];
      list.push(row.program_key);
      servicesById.set(row.id, list);
    }

    // 소속(2026-09-22, org_code 자유 입력 대체) — service_labels 와 같은
    // 방식으로 한 번만 조회해 profiles.tenant_id → tenants.name 을 얹는다.
    const { data: tenantRows, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name")
      .order("name");

    if (tenantError) {
      console.error(tenantError);
    }

    const tenantList = tenantRows || [];
    setTenants(tenantList);
    const tenantNameById = new Map(
      tenantList.map((tenant) => [tenant.id, tenant.name]),
    );

    setRows(
      profileRows.map((row) => ({
        ...row,
        service_labels: (servicesById.get(row.id) || []).join(", "),
        tenant_name: row.tenant_id
          ? tenantNameById.get(row.tenant_id) || ""
          : "",
      })),
    );
    setLoading(false);
  }

  const onMountLoadRows = useEffectEvent(() => {
    loadRows();
  });

  useEffect(() => {
    onMountLoadRows();
  }, []);

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

  // 상세 부수 데이터. 세 갈래(연결관계·이용권·주문)를 한 번에 받되, 하나가
  // 실패해도 나머지는 그린다 — RLS 로 막힌 테이블이 있을 때 화면 전체가
  // 빈 채로 죽으면 원인을 못 찾는다(권한 체계 도입 직후라 특히 그렇다).
  async function loadDetail(profile: ProfileRow) {
    setDetailLoading(true);
    setDetailError("");

    const isParent = String(profile.member_type || "") === "parent";

    const [linkRes, accessRes, orderRes, msgRes] = await Promise.all([
      supabase
        .from("parent_child_links")
        .select("id, parent_id, student_id, status")
        .eq(isParent ? "parent_id" : "student_id", profile.id)
        .in("status", ["pending", "approved"]),
      supabase
        .from("program_access")
        .select(
          "id, program_key, payment_status, access_status, paid_amount, starts_at, expires_at, access_started_at, access_expires_at",
        )
        .eq("id", profile.id),
      // ⚠️ user_id 로 조회하면 학생 상세에서 결제내역이 항상 비어 보인다 —
      //   orders_user_id_is_parent_check(CHECK (user_id = parent_profile_id))가
      //   말하듯 **user_id 는 결제한 학부모**이고, 그 주문이 누구를 위한 것인지는
      //   student_profile_id 가 들고 있다. 두 축을 OR 로 걸어 학생 상세에서는
      //   "나를 위해 결제된 주문", 학부모 상세에서는 "내가 결제한 주문"이 나오게 한다.
      supabase
        .from("orders")
        .select(
          "id, status, order_name, amount, list_amount, discount_amount, method, paid_at, created_at, student_profile_id, parent_profile_id",
        )
        .or(
          `student_profile_id.eq.${profile.id},parent_profile_id.eq.${profile.id}`,
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("alimtalk_send_logs")
        .select(
          "id, template_key, channel, subject, message, status, provider_message, sent_at",
        )
        .eq("profile_id", profile.id)
        .order("sent_at", { ascending: false })
        .limit(100),
    ]);

    const errors = [
      linkRes.error,
      accessRes.error,
      orderRes.error,
      msgRes.error,
    ].filter(Boolean);
    if (errors.length > 0) {
      console.error(errors);
      setDetailError(
        errors
          .map((e) => e?.message)
          .filter(Boolean)
          .join(" / "),
      );
    }

    // 연결 상대의 프로필은 이미 받아둔 목록(rows)에서 찾는다 — 회원 전체를
    // 이미 들고 있으므로 추가 조회가 필요 없다.
    const counterpartIds = (linkRes.data || []).map((row) =>
      isParent ? row.student_id : row.parent_id,
    );
    const byId = new Map(rows.map((row) => [row.id, row]));

    setLinks(
      (linkRes.data || []).map((row, index) => ({
        linkId: row.id,
        status: row.status,
        profile: byId.get(counterpartIds[index] as string) || null,
      })),
    );
    setAccesses((accessRes.data as ProgramAccessRow[]) || []);
    setOrders((orderRes.data as OrderRow[]) || []);
    setMessages((msgRes.data as MessageLogRow[]) || []);
    setDetailLoading(false);
  }

  function openDetail(row: ProfileRow) {
    setSelected(row);
    setTab("profile");
    setUnmasked(false);
    setLinks([]);
    setAccesses([]);
    setOrders([]);
    setMessages([]);
    setDraft("");
    setCategoryDraft(row.member_category || "");
    setGuardianPhoneDraft(row.guardian_phone || "");
    setTenantDraft(row.tenant_id || "");
    loadDetail(row);
  }

  function closeDetail() {
    setSelected(null);
    setDetailError("");
  }

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
      `${config.title}_${new Date().toISOString().slice(0, 10)}.csv`,
      filteredRows as unknown as Record<string, unknown>[],
      columns,
    );
  }

  function requestExport() {
    if (filteredRows.length === 0) {
      alert("내보낼 데이터가 없습니다.");
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
      description: `${selected?.name || "이 회원"}의 연락처·이메일 원본이 화면에 표시됩니다.`,
      targetId: selected?.id,
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
  async function sendMessage() {
    if (!selected || sending) return;

    const text = draft.trim();
    if (!text) {
      alert("보낼 내용을 입력해 주세요.");
      return;
    }

    setSending(true);

    try {
      const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
      const response = await fetch("/api/admin/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        // phone 은 넘기지 않는다 — 마스킹 상태면 화면이 원문을 모른다.
        // 서버가 profileId 로 직접 읽는다.
        body: JSON.stringify({ profileId: selected.id, text }),
      });

      const result = await response.json().catch(async () => {
        const raw = await response.text().catch(() => "");
        return { detail: raw || `HTTP ${response.status}` };
      });

      if (!response.ok) {
        throw new Error(result?.detail || `HTTP ${response.status}`);
      }

      setDraft("");
      await loadDetail(selected);
      alert(`발송했습니다 (${result.channel}).`);
    } catch (error) {
      alert(`발송 실패: ${(error as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  async function saveMemberCategory() {
    if (!selected || savingCategory) return;
    setSavingCategory(true);

    const next = categoryDraft.trim() || null;
    const { error } = await supabase
      .from("profiles")
      .update({ member_category: next })
      .eq("id", selected.id);

    setSavingCategory(false);

    if (error) {
      alert(`회원구분 저장 실패: ${error.message}`);
      return;
    }

    // 목록과 상세가 같은 값을 보게 맞춰둔다(재조회 없이).
    setSelected({ ...selected, member_category: next });
    setRows((prev) =>
      prev.map((row) =>
        row.id === selected.id ? { ...row, member_category: next } : row,
      ),
    );
    alert("회원구분을 저장했습니다.");
  }

  async function saveGuardianPhone() {
    if (!selected || savingGuardianPhone) return;
    setSavingGuardianPhone(true);

    const next = guardianPhoneDraft.trim() || null;
    const { error } = await supabase
      .from("profiles")
      .update({ guardian_phone: next })
      .eq("id", selected.id);

    setSavingGuardianPhone(false);

    if (error) {
      alert(`학부모 핸드폰 저장 실패: ${error.message}`);
      return;
    }

    // 목록과 상세가 같은 값을 보게 맞춰둔다(재조회 없이).
    setSelected({ ...selected, guardian_phone: next });
    setRows((prev) =>
      prev.map((row) =>
        row.id === selected.id ? { ...row, guardian_phone: next } : row,
      ),
    );
    alert("학부모 핸드폰을 저장했습니다.");
  }

  // 소속 배정/해제(2026-09-22, WC072) — categoryDraft/guardianPhoneDraft 와
  // 같은 인라인 저장 패턴이지만, profiles.tenant_id 는 직접 update 할 수
  // 없어(fn_profiles_lock_tenant 트리거, WC070) RPC 를 부른다. p_tenant_id
  // 는 NULL 이면 해제다 — 생성 타입(database.types.ts)이 인자를 string 으로
  // 좁혀놔서(실제 SQL 시그니처는 nullable uuid) 그대로 두면 컴파일이 막힌다.
  async function saveTenant() {
    if (!selected || savingTenant) return;
    setSavingTenant(true);

    const nextId = tenantDraft || null;
    const { error } = await supabase.rpc("fn_admin_set_profile_tenant", {
      p_profile_id: selected.id,
      p_tenant_id: nextId as unknown as string,
    });

    setSavingTenant(false);

    if (error) {
      alert(`소속 저장 실패: ${error.message}`);
      return;
    }

    const nextName = nextId
      ? tenants.find((tenant) => tenant.id === nextId)?.name || ""
      : "";

    // 목록과 상세가 같은 값을 보게 맞춰둔다(재조회 없이).
    setSelected({ ...selected, tenant_id: nextId, tenant_name: nextName });
    setRows((prev) =>
      prev.map((row) =>
        row.id === selected.id
          ? { ...row, tenant_id: nextId, tenant_name: nextName }
          : row,
      ),
    );
    alert("소속을 저장했습니다.");
  }

  // 결제 요약 3종 — 참조 HTML 의 "이번 달 결제 / 미납액 / 누적 결제액".
  // 미납액은 아직 결제가 끝나지 않은 주문(pending·waiting_deposit)의 합으로
  // 잡는다. 취소·실패·환불은 받을 돈이 아니므로 제외한다.
  const paySummary = useMemo(() => {
    const now = new Date();
    let thisMonth = 0;
    let unpaid = 0;
    let total = 0;

    for (const order of orders) {
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
  }, [orders]);

  if (selected) {
    const isParent = String(selected.member_type || "") === "parent";
    const activeTab = TABS.find((t) => t.key === tab);

    return (
      <div>
        {gate}

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#111827]">
            {config.title} 상세
          </h1>
          <div className="flex items-center gap-2">
            <ActionButton variant="light" onClick={toggleMasking}>
              {unmasked ? <EyeOff size={14} /> : <Eye size={14} />}
              {unmasked ? "개인정보 마스킹" : "마스킹 해제"}
            </ActionButton>
            <ActionButton variant="light" onClick={closeDetail}>
              목록으로
            </ActionButton>
          </div>
        </div>

        {/* 요약 헤더 — 참조 HTML 의 상단 프로필 블록 */}
        <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 bg-white px-6 py-5 shadow-sm">
          <div>
            <div className="text-lg font-black">{selected.name || "-"}</div>
            <div className="text-xs font-bold text-gray-500">
              {selected.username || "-"}
            </div>
          </div>
          <div className="text-sm">
            <span className="font-black text-gray-500">유형 </span>
            {MEMBER_TYPE_LABEL[String(selected.member_type || "")] ||
              selected.member_type ||
              "-"}
          </div>
          <div className="text-sm">
            <span className="font-black text-gray-500">학교 </span>
            {selected.school_name || "-"}
          </div>
          <div className="text-sm">
            <span className="font-black text-gray-500">연락처 </span>
            {phoneOf(selected)}
          </div>
          <div className="text-sm">
            <span className="font-black text-gray-500">가입일 </span>
            {formatDate(selected.created_at)}
          </div>
        </div>

        {/* 탭 */}
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`h-9 border px-5 text-sm font-black transition ${
                tab === item.key
                  ? "border-[#2348ff] bg-[#2348ff] text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {detailError && (
          <div className="mb-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-bold text-[#7A4A12]">
            일부 데이터를 불러오지 못했습니다 — {detailError}
          </div>
        )}

        {detailLoading ? (
          <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
            데이터를 불러오는 중입니다.
          </div>
        ) : activeTab && "pending" in activeTab && activeTab.pending ? (
          <div className="bg-white p-10 shadow-sm">
            <h2 className="text-lg font-black">{activeTab.label}</h2>
            <div className="mt-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-bold text-[#7A4A12]">
              {activeTab.pending}
            </div>
          </div>
        ) : tab === "profile" ? (
          <ProfilePane
            profile={selected}
            isParent={isParent}
            links={links}
            unmasked={unmasked}
            phoneOf={phoneOf}
            emailOf={emailOf}
            categoryDraft={categoryDraft}
            setCategoryDraft={setCategoryDraft}
            onSaveCategory={saveMemberCategory}
            savingCategory={savingCategory}
            guardianPhoneDraft={guardianPhoneDraft}
            setGuardianPhoneDraft={setGuardianPhoneDraft}
            onSaveGuardianPhone={saveGuardianPhone}
            savingGuardianPhone={savingGuardianPhone}
            tenants={tenants}
            tenantDraft={tenantDraft}
            setTenantDraft={setTenantDraft}
            onSaveTenant={saveTenant}
            savingTenant={savingTenant}
          />
        ) : tab === "services" ? (
          <ServicesPane accesses={accesses} />
        ) : tab === "msg" ? (
          <MessagePane
            messages={messages}
            draft={draft}
            setDraft={setDraft}
            onSend={sendMessage}
            sending={sending}
          />
        ) : (
          <PayPane
            orders={orders}
            summary={paySummary}
            viewerId={selected.id}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {gate}

      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadRows}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <RefreshCw size={14} />
              초기화
            </button>

            <button
              type="button"
              onClick={requestExport}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <Download size={14} />
              엑셀 다운로드
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Select value={memberType} onChange={setMemberType}>
              {MEMBER_TYPE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <div className="flex items-center">
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
        </div>

        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
      </div>

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
          onEdit={openDetail}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 탭 본문
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4] last:border-b-0">
      <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">{label}</div>
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
    <div className="mb-6 bg-white shadow-sm">
      <div className="border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-sm font-black">
        {title}
      </div>
      {children}
    </div>
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
            <div className="flex items-center gap-2">
              <span className="max-w-[13.75rem]">
                <Select value={tenantDraft} onChange={setTenantDraft}>
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
      <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
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
          <div key={access.id} className="bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-base font-black">{access.program_key}</div>
              <span className="border border-gray-300 px-2 py-1 text-xs font-bold">
                {ACCESS_STATUS_LABEL[String(access.access_status || "")] ||
                  access.access_status ||
                  "-"}
              </span>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              {startsAt || expiresAt
                ? `${formatDate(startsAt)} ~ ${expiresAt ? formatDate(expiresAt) : "무기한"}`
                : "기간 정보 없음"}
            </div>

            <div className="mt-1 text-sm text-gray-600">
              결제 {access.payment_status || "-"} ·{" "}
              {formatMoney(access.paid_amount)}
            </div>
          </div>
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
          <div key={item.label} className="bg-white p-5 shadow-sm">
            <div className="text-sm font-black text-gray-500">{item.label}</div>
            <div className="mt-2 text-xl font-black">
              {formatMoney(item.value)}
            </div>
          </div>
        ))}
      </div>

      <ScrollArea axis="x" className="bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[#edf0f4] bg-[#fafafa] text-left">
              <th className="px-4 py-3 font-black">주문번호</th>
              <th className="px-4 py-3 font-black">승인 일시</th>
              <th className="px-4 py-3 font-black">상품</th>
              <th className="px-4 py-3 font-black">구분</th>
              <th className="px-4 py-3 font-black">결제 수단</th>
              <th className="px-4 py-3 text-right font-black">결제 금액</th>
              <th className="px-4 py-3 font-black">상태</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center font-bold text-gray-500"
                >
                  결제 내역이 없습니다.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-[#edf0f4]">
                  <td className="px-4 py-3 font-mono text-xs">{order.id}</td>
                  <td className="px-4 py-3">
                    {formatDateTime(order.paid_at || order.created_at)}
                  </td>
                  <td className="px-4 py-3">{order.order_name || "-"}</td>
                  <td className="px-4 py-3">
                    {order.parent_profile_id === viewerId
                      ? order.student_profile_id === viewerId
                        ? "본인 결제"
                        : "결제자"
                      : "이용자"}
                  </td>
                  <td className="px-4 py-3">{order.method || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(order.amount)}
                  </td>
                  <td className="px-4 py-3">
                    {ORDER_STATUS_LABEL[String(order.status || "")] ||
                      order.status ||
                      "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>
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

/** EUC-KR 기준 바이트 — 한글/전각 2, 그 외 1. api/_lib/aligo.ts 의 규칙과 같다. */
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
        <h2 className="text-lg font-black">새 메시지 보내기</h2>
        <p className="mt-1 text-sm text-gray-500">
          자유 문구는 문자로 나갑니다. 알림톡은 카카오 승인을 받은 템플릿 본문만
          보낼 수 있습니다.
        </p>

        <div className="mt-4">
          <Textarea value={draft} onChange={setDraft} rows={4} />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span
            className={`text-xs font-bold ${isLong ? "text-[#B88737]" : "text-gray-500"}`}
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

      <ScrollArea axis="x" className="bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[#edf0f4] bg-[#fafafa] text-left">
              <th className="px-4 py-3 font-black">발송 일시</th>
              <th className="px-4 py-3 font-black">채널</th>
              <th className="px-4 py-3 font-black">종류</th>
              <th className="px-4 py-3 font-black">메시지 내용</th>
              <th className="px-4 py-3 font-black">상태</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center font-bold text-gray-500"
                >
                  발송 이력이 없습니다.
                </td>
              </tr>
            ) : (
              messages.map((row) => (
                <tr key={row.id} className="border-b border-[#edf0f4]">
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDateTime(row.sent_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{row.channel}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {TEMPLATE_LABEL[row.template_key] || row.template_key}
                  </td>
                  {/* 본문이 길어 표를 밀지 않도록 줄바꿈은 살리되 폭을 제한한다. */}
                  <td className="max-w-[420px] whitespace-pre-line px-4 py-3 text-gray-700">
                    {row.message}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.status === "sent" ? (
                      "발송 완료"
                    ) : (
                      <span
                        className="text-[#B88737]"
                        title={row.provider_message || undefined}
                      >
                        실패
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>
    </>
  );
}
