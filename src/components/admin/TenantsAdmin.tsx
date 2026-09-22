import { Copy, Plus, RefreshCw } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { useAdminDetailBack } from "@/pages/admin/shared/useAdminDetailBack";

// ---------------------------------------------------------------------------
// 소속(테넌트) 관리(tenants, 2026-09-22) — 목록 + 발급.
//
// profiles/products/coupons.org_code(자유 입력 text, 죽은 컬럼)를 대체하는
// 마스터 테이블 화면이다(20260922002929/20260922002935). custom 컴포넌트인
// 이유는 CouponAdmin/AdminMembersAdmin과 같다 — tenants 테이블에는 insert
// 정책이 아예 없다(신설은 fn_create_tenant RPC 전용, WC067 최고 관리자
// 게이트 — 코드는 이 함수가 서버에서 생성해 충돌 시 재시도한다). 제네릭
// AdminForm 은 "PATCH/POST 를 테이블에 직접 쏜다"는 전제라 이 RPC 전용
// 등록 흐름을 표현할 수 없다.
//
// code(소속 코드) 는 발급 후 불변이다(trg_tenants_lock_code, 20260922002929)
// — 그래서 이 화면에 편집 폼 자체를 두지 않는다(등록만). 이름·지역·기업형태·
// 등급을 나중에 고쳐야 하면(tenants_update RLS 는 이미 열려 있다) 별도
// 요구로 다시 붙인다.
//
// tier(등급) 는 "내부 분류용 — 회원에게 노출하지 않는다"는 게 DB 코멘트
// 원칙이다. 하지만 그 원칙은 fn_resolve_tenant_code/fn_my_tenant 등 **회원
// 대상** RPC 가 이 컬럼을 반환하지 않는다는 뜻이지, 운영자 화면까지 가리라는
// 뜻인지는 이번 작업 범위에서 확정되지 않았다 — 어드민이 소속 등급(영업·정산
// 우선순위)을 목록에서 바로 보지 못하면 운영에 지장이 있을 수 있어, 일단
// 노출하되 "내부용" 이라는 라벨을 붙여 회원 화면과 구분한다(불확실 지점,
// 완료 보고 참고).
// ---------------------------------------------------------------------------

interface TenantRow {
  id: string;
  code: string;
  name: string;
  region: string;
  org_type: string;
  tier: string;
  created_at: string;
}

// tenants_region_check(20260922002929)와 1:1.
const REGION_OPTIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
  "기타",
];

// tenants_org_type_check 와 1:1.
const ORG_TYPE_OPTIONS = ["기관", "사기업", "학교", "캠퍼스", "기타"];

// tenants_tier_check 와 1:1. 라벨은 DB 코멘트("내부 분류용 등급")를 그대로
// 옮긴 것 — 회원에게 노출되는 문구가 아니라 새 한국어 카피 창작이 아니다.
const TIER_OPTIONS = [
  { value: "S", label: "S" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "W", label: "W" },
];

type ViewMode = "list" | "create";

interface CreateForm {
  name: string;
  region: string;
  org_type: string;
  tier: string;
}

function emptyForm(): CreateForm {
  return { name: "", region: "서울", org_type: "기관", tier: "W" };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR");
}

interface TenantsAdminProps {
  config: { title: string; searchPlaceholder: string; [key: string]: unknown };
}

export default function TenantsAdmin({ config }: TenantsAdminProps) {
  const [view, setView] = useState<ViewMode>("list");
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");

  const [form, setForm] = useState<CreateForm>(() => emptyForm());
  const [saving, setSaving] = useState(false);

  // fn_create_tenant 가 막 발급한 코드 — 등록 즉시 눈에 띄게 모달로 보여준다.
  // 목록으로 돌아가면 같은 값을 코드 칼럼에서 다시 볼 수 있지만, 발급
  // 직후에는 "방금 이 코드를 어디로 전달해야 하는지"가 급하므로 별도로 띄운다.
  const [issuedTenant, setIssuedTenant] = useState<TenantRow | null>(null);

  async function loadRows() {
    setLoading(true);

    const { data, error } = await supabase
      .from("tenants")
      .select("id, code, name, region, org_type, tier, created_at")
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      console.error(error);
      alert(`${config.title} 조회 실패: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data as TenantRow[]) || []);
  }

  const onMountLoad = useEffectEvent(() => {
    loadRows();
  });

  useEffect(() => {
    onMountLoad();
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(q));
  }, [rows, keyword]);

  function openCreate() {
    setForm(emptyForm());
    setView("create");
  }

  function closeForm() {
    setView("list");
    setForm(emptyForm());
  }

  // QA 317 계열 — 상세(등록 폼)가 라우트가 아니라 state 라 뒤로가기가 직전
  // 메뉴로 튄다. CouponAdmin/AdminMembersAdmin 과 같은 처방.
  useAdminDetailBack(view !== "list", () => setView("list"));

  async function save() {
    if (saving) return;

    if (!form.name.trim()) {
      alert("이름 항목을 입력해주세요.");
      return;
    }

    setSaving(true);

    // WC067(최고 관리자 아님)은 fn_create_tenant 가 raise 하는 원문 그대로
    // 보여준다 — 이 화면 진입 자체가 admin_resources 'tenants' 권한을
    // 통과해야 하므로, 여기 닿고도 이 에러를 받는다면 "메뉴 접근은 되는데
    // 발급 권한(최고 관리자 전용)은 없는" 드문 경합 상황이라 원문이 더
    // 정확하다(CouponAdmin 의 DB 원문 은폐 규범과 달리, 이 RPC 는 에러가
    // 이 한 가지뿐이라 매핑 테이블을 따로 둘 실익이 없다).
    const { data, error } = await supabase.rpc("fn_create_tenant", {
      p_name: form.name.trim(),
      p_region: form.region,
      p_org_type: form.org_type,
      p_tier: form.tier,
    });

    setSaving(false);

    if (error) {
      alert(`등록 실패: ${error.message}`);
      return;
    }

    const created = data as TenantRow;
    closeForm();
    await loadRows();
    setIssuedTenant(created);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch (error) {
      console.error(error);
    }
  }

  if (view === "create") {
    return (
      <div>
        <h1 className="mb-5 text-2xl font-black text-[#111827]">
          {config.title} 등록
        </h1>

        <div className="flex flex-wrap items-end gap-4 bg-white p-6 shadow-sm">
          <Field label="이름">
            <TextInput
              value={form.name}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, name: value }))
              }
            />
          </Field>
          <Field label="지역">
            <Select
              value={form.region}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, region: value }))
              }
            >
              {REGION_OPTIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="기업형태">
            <Select
              value={form.org_type}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, org_type: value }))
              }
            >
              {ORG_TYPE_OPTIONS.map((orgType) => (
                <option key={orgType} value={orgType}>
                  {orgType}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="등급(내부용)">
            <Select
              value={form.tier}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, tier: value }))
              }
            >
              {TIER_OPTIONS.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label}
                </option>
              ))}
            </Select>
          </Field>

          <ActionButton onClick={save} disabled={saving}>
            {saving ? "등록 중..." : "등록"}
          </ActionButton>
          <ActionButton variant="light" onClick={closeForm}>
            취소
          </ActionButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      {issuedTenant && (
        // 발급 직후 결과 모달 — 코드는 이 순간을 놓치면 목록에서 다시 찾아야
        // 한다(trg_tenants_lock_code 로 불변이니 재발급도 못 한다).
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-black">소속을 발급했습니다</h2>
            <div className="mb-1 text-sm font-bold text-gray-500">
              {issuedTenant.name}
            </div>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex-1 border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-lg font-black tracking-widest">
                {issuedTenant.code}
              </span>
              <ActionButton
                variant="light"
                onClick={() => copyCode(issuedTenant.code)}
              >
                <Copy size={14} />
                복사
              </ActionButton>
            </div>
            <ActionButton onClick={() => setIssuedTenant(null)}>
              확인
            </ActionButton>
          </div>
        </div>
      )}

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
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={config.searchPlaceholder}
              className="h-9 w-[15rem] border border-gray-400 px-3 text-sm outline-hidden"
            />
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap bg-[#2348ff] px-4 text-sm font-black text-white"
          >
            <Plus size={14} />
            등록
          </button>
        </div>

        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
      </div>

      {loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="mb-4 text-sm font-bold text-gray-500">
            전체 <span className="text-blue-600">{filteredRows.length}</span>건
          </div>

          <ScrollArea axis="x">
            <table className="w-full min-w-[45rem] border-collapse text-sm">
              <thead>
                <tr className="border-y border-gray-300">
                  <th className="w-14 px-3 py-3 text-left">번호</th>
                  <th className="px-3 py-3 text-left">이름</th>
                  <th className="px-3 py-3 text-left">지역</th>
                  <th className="px-3 py-3 text-left">기업형태</th>
                  <th className="px-3 py-3 text-left">소속 코드</th>
                  <th className="px-3 py-3 text-left">등급(내부용)</th>
                  <th className="px-3 py-3 text-left">생성일</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      등록된 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="px-3 py-3">{index + 1}</td>
                      <td className="px-3 py-3 font-bold">{row.name}</td>
                      <td className="px-3 py-3">{row.region}</td>
                      <td className="px-3 py-3">{row.org_type}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[0.8125rem]">
                            {row.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyCode(row.code)}
                            aria-label="코드 복사"
                            className="text-gray-400 hover:text-black"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">{row.tier}</td>
                      <td className="px-3 py-3">
                        {formatDate(row.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
