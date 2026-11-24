import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { site } from "@/config/site";
import {
  AdminApiError,
  reportAdminError,
} from "@/pages/admin/shared/adminErrors";
import { toastWarning } from "@/pages/admin/shared/adminToast";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { useUnsavedGuard } from "@/pages/admin/shared/useUnsavedGuard";
import {
  createTenant,
  fetchTenants,
  type TenantRow,
} from "@/pages/admin/tenants/api";
import {
  deletionDdayText,
  mouLabel,
  tenantToday,
} from "@/pages/admin/tenants/contract";
import { copyToClipboard } from "@/pages/admin/tenants/copyToClipboard";
import {
  ORG_TYPE_OPTIONS,
  REGION_OPTIONS,
  TIER_OPTIONS,
} from "@/pages/admin/tenants/options";
import TenantDetail from "@/pages/admin/tenants/TenantDetail";
import {
  errorDetail,
  tenantKeys,
  tenantPaths,
} from "@/pages/admin/tenants/tenantQueries";

// ---------------------------------------------------------------------------
// 기관 관리(tenants, 2026-09-22) — 목록 + 발급.
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
// — 그래서 이 화면에 편집 폼 자체를 두지 않는다(등록만). 이름·지역·기관 유형·
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
//
// 스쿨멘토(site.features.hqTenantAdmin)는 목록에 계약 기간, MOU, 유예 종료일, 삭제 D-day, 기타 뱃지를
// 더하고 기관 이름을 누르면 기관 상세(TenantDetail: 기관 정보 수정, 학교 관리자)를 연다. 등록 직후에도
// 발급 코드 모달 대신 그 상세로 간다. 위닝은 예전 화면 그대로다.
//
// 화면은 주소가 정한다(/admin/tenants, /new, /:id/*). 목록, 등록, 상세는 서버 경로(admin/tenants)로
// 읽고 쓴다. 열 구성(hqTenantAdmin)은 서버가 정하고, 화면은 같은 플래그로 열을 보일지만 가른다.
// ---------------------------------------------------------------------------

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

const HEAD = "whitespace-normal px-3 py-3 text-left font-semibold";

// 서버가 쓴 문장만 보인다. 오류 원문은 화면에 싣지 않는다.
function reportApiError(title: string, error: unknown) {
  reportAdminError(title, new AdminApiError(errorDetail(error)));
}

export default function TenantsAdmin({ config }: TenantsAdminProps) {
  // 막 발급한 코드. 등록 폼에서 목록으로 돌아온 뒤에도 남아야 해서 라우트 바깥에 둔다.
  const [issuedTenant, setIssuedTenant] = useState<TenantRow | null>(null);

  return (
    <>
      {issuedTenant && (
        // 발급 직후 결과 모달 — 코드는 이 순간을 놓치면 목록에서 다시 찾아야
        // 한다(trg_tenants_lock_code 로 불변이니 재발급도 못 한다). 확인으로만 닫히도록
        // 닫기 시도를 모두 취소한다. 바깥 누름은 AlertDialog 가 기본으로 무시하고,
        // Esc 는 onOpenChange 에서 막는다.
        // eventDetails.cancel(): Base UI 1.9 onOpenChange 취소 API
        <AlertDialog
          open
          onOpenChange={(_open, eventDetails) => eventDetails.cancel()}
        >
          <AlertDialogContent className="data-[size=default]:sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold">
                기관을 발급했습니다
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div>
              <div className="mb-1 text-sm font-medium text-gray-500">
                {issuedTenant.name}
              </div>
              <div className="flex items-center gap-2">
                <span className="flex-1 border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-lg font-semibold tracking-widest">
                  {issuedTenant.code}
                </span>
                <ActionButton
                  variant="light"
                  onClick={() => copyToClipboard(issuedTenant.code)}
                >
                  <Copy size={14} />
                  복사
                </ActionButton>
              </div>
            </div>
            <AlertDialogFooter>
              <ActionButton onClick={() => setIssuedTenant(null)}>
                확인
              </ActionButton>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <Routes>
        <Route index element={<TenantList config={config} />} />
        <Route
          path="new"
          element={<TenantCreate config={config} onIssued={setIssuedTenant} />}
        />
        {site.features.hqTenantAdmin && (
          <Route path=":id/*" element={<TenantDetail />} />
        )}
        <Route path="*" element={<Navigate to={tenantPaths.list} replace />} />
      </Routes>
    </>
  );
}

function TenantCreate({
  config,
  onIssued,
}: TenantsAdminProps & { onIssued: (tenant: TenantRow) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateForm>(() => emptyForm());
  // 등록이 끝나 스스로 이동할 때는 이탈 보호를 거치지 않는다.
  const done = useRef(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(emptyForm());
  useUnsavedGuard(dirty, () => done.current);

  const createMutation = useMutation({
    mutationFn: (body: CreateForm) => createTenant(body),
  });
  const saving = createMutation.isPending;

  function save() {
    if (saving) return;

    if (!form.name.trim()) {
      toastWarning("이름 항목을 입력해주세요.");
      return;
    }

    createMutation.mutate(
      { ...form, name: form.name.trim() },
      {
        onSuccess: (created) => {
          done.current = true;
          queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
          if (site.features.hqTenantAdmin) {
            navigate(tenantPaths.detail(created.id), { replace: true });
            return;
          }
          navigate(tenantPaths.list, { replace: true });
          onIssued(created);
        },
        onError: (error) => reportApiError("등록 실패", error),
      },
    );
  }

  function closeForm() {
    navigate(tenantPaths.list);
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold text-foreground">
        {config.title} 등록
      </h1>

      <div className="flex flex-wrap items-end gap-4 bg-white p-6 shadow-sm">
        <Field label="이름">
          <TextInput
            value={form.name}
            onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
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
        <Field label="기관 유형">
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
            onChange={(value) => setForm((prev) => ({ ...prev, tier: value }))}
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

function TenantList({ config }: TenantsAdminProps) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const query = useQuery({
    queryKey: tenantKeys.list(),
    queryFn: ({ signal }) => fetchTenants(signal),
  });
  const rows = query.data?.items ?? [];
  // 유예 종료일이 빈 기관의 삭제 D-day 계산에 쓰는 기본 유예 일수. 서버가 없으면 null 이다.
  const graceDays = query.data?.graceDays ?? null;
  const loading = query.isFetching;

  useEffect(() => {
    if (query.error) reportApiError(`${config.title} 조회 실패`, query.error);
  }, [query.error, config.title]);

  const hq = site.features.hqTenantAdmin;

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(q));
  }, [rows, keyword]);

  function openCreate() {
    navigate(tenantPaths.create);
  }

  function openDetail(id: string) {
    navigate(tenantPaths.detail(id));
  }

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => query.refetch()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              초기화
            </Button>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={config.searchPlaceholder}
              aria-label={config.searchPlaceholder}
              className="h-9 w-[15rem]"
            />
          </div>

          <Button
            type="button"
            size="lg"
            onClick={openCreate}
            className="shrink-0 font-semibold"
          >
            <Plus size={14} aria-hidden="true" />
            등록
          </Button>
        </div>

        <h1 className="mt-4 text-xl font-semibold">{config.title}</h1>
      </div>

      {loading ? (
        <div
          role="status"
          className="bg-white p-12 text-center text-sm font-medium text-gray-500 shadow-sm"
        >
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="mb-4 text-sm font-medium text-gray-500">
            전체 <span className="text-blue-600">{filteredRows.length}</span>건
          </div>

          <Table className="min-w-[45rem] border-collapse">
            <TableHeader>
              <TableRow className="border-y border-gray-300 hover:bg-transparent">
                <TableHead scope="col" className={`${HEAD} w-14`}>
                  번호
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  이름
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  지역
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  기관 유형
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  소속코드
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  등급(내부용)
                </TableHead>
                {hq && (
                  <>
                    <TableHead scope="col" className={HEAD}>
                      계약 기간
                    </TableHead>
                    <TableHead scope="col" className={HEAD}>
                      MOU
                    </TableHead>
                    <TableHead scope="col" className={HEAD}>
                      유예 종료일
                    </TableHead>
                    <TableHead scope="col" className={HEAD}>
                      삭제 D-day
                    </TableHead>
                  </>
                )}
                <TableHead scope="col" className={HEAD}>
                  생성일
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={hq ? 11 : 7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    등록된 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row, index) => (
                  <TableRow key={row.id} className="border-b border-gray-100">
                    <TableCell className="px-3 py-3">{index + 1}</TableCell>
                    <TableCell className="whitespace-normal px-3 py-3 font-medium">
                      {hq ? (
                        <button
                          type="button"
                          onClick={() => openDetail(row.id)}
                          className="text-left font-medium text-primary underline"
                        >
                          {row.name}
                        </button>
                      ) : (
                        row.name
                      )}
                      {hq && row.is_catch_all && (
                        <Badge
                          variant="secondary"
                          className="ml-2 text-gray-700"
                        >
                          기타
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-3">{row.region}</TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {row.org_type}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[0.8125rem]">
                          {row.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(row.code)}
                          aria-label="소속코드 복사"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Copy size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3">{row.tier}</TableCell>
                    {hq && (
                      <>
                        <TableCell className="px-3 py-3">
                          {row.contract_start_date || row.contract_end_date
                            ? `${row.contract_start_date ?? ""} ~ ${row.contract_end_date ?? ""}`.trim()
                            : "-"}
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          {mouLabel(row.mou_status)}
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          {row.grace_ends_on ?? "-"}
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          {(row.time_zone
                            ? deletionDdayText({
                                contractEnd: row.contract_end_date ?? null,
                                graceEnds: row.grace_ends_on ?? null,
                                defaultGraceDays: graceDays,
                                today: tenantToday(row.time_zone),
                              })
                            : null) ?? "-"}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="px-3 py-3">
                      {formatDate(row.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
