import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/http/client";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import { useUnsavedGuard } from "@/pages/admin/shared/useUnsavedGuard";
import { fetchTenantDetail, patchTenant, type TenantDetailRow } from "./api";
import { mouLabel } from "./contract";
import {
  CONTRACT_ORDER_MESSAGE,
  GRACE_ORDER_MESSAGE,
  type TenantFormValues,
  TRIAL_ORDER_MESSAGE,
  tenantFormFromRow,
  tenantPayload,
  validateTenantForm,
} from "./form";
import { ORG_TYPE_OPTIONS, REGION_OPTIONS, TIER_OPTIONS } from "./options";
import SchoolAdminPanel from "./SchoolAdminPanel";
import ServiceSettingsPanel from "./ServiceSettingsPanel";
import {
  errorDetail,
  schoolAdminsQueryOptions,
  type TenantTab,
  tenantKeys,
  tenantPaths,
} from "./tenantQueries";

// ---------------------------------------------------------------------------
// 본사 기관 상세(5번 본사 관리 화면, 사 #144, #159, 결정 r14, r15). 주소가 곧 화면이다:
// /admin/tenants/:id 가 기관 정보 탭, /:id/service-settings, /:id/school-admins 가 나머지 탭이다.
// 세 탭 모두 서버 경로(admin/tenants/*)로 읽고 쓴다. 기관 정보 저장은 불러온 updatedAt 을 함께 보내
// 그 사이 다른 관리자가 고쳤으면 서버가 409 로 막는다.
// ---------------------------------------------------------------------------

const TABS: { key: TenantTab; label: string }[] = [
  { key: "info", label: "기관 정보" },
  { key: "service-settings", label: "서비스 설정" },
  { key: "school-admins", label: "전체 관리자" },
];

// 기관 정보 탭의 입력칸 수(소속코드 포함). 스켈레톤 행 수가 된다.
const TENANT_FORM_FIELD_COUNT = 19;

const MOU_OPTIONS = ["pending", "signed", "ended"];

/** 주소 끝 조각(splat)에서 탭을 읽는다. 모르는 조각이면 null. */
function tabOf(splat: string | undefined): TenantTab | null {
  if (!splat) return "info";
  return TABS.some((tab) => tab.key === splat) ? (splat as TenantTab) : null;
}

/** 서버가 날짜 순서 위반을 코드로 알리면 폼 검증과 같은 문구를 쓴다. */
const ORDER_MESSAGES: Record<string, string> = {
  CONTRACT_ORDER: CONTRACT_ORDER_MESSAGE,
  GRACE_ORDER: GRACE_ORDER_MESSAGE,
  TRIAL_ORDER: TRIAL_ORDER_MESSAGE,
};

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const order = ORDER_MESSAGES[error.code];
    if (order) return order;
    // 충돌과 권한 부족은 서버가 화면에 보일 문구를 그대로 쓴다.
    if (error.code === "CONFLICT" || error.code === "FORBIDDEN")
      return error.detail;
  }
  return `저장 실패: ${errorDetail(error)}`;
}

function BackToList() {
  const navigate = useNavigate();
  return (
    <ActionButton variant="light" onClick={() => navigate(tenantPaths.list)}>
      목록으로
    </ActionButton>
  );
}

export default function TenantDetail() {
  const { id: tenantId, "*": splat } = useParams();
  const tab = tabOf(splat);

  const query = useQuery({
    queryKey: tenantKeys.detail(tenantId ?? ""),
    queryFn: ({ signal }) => fetchTenantDetail(tenantId ?? "", signal),
    enabled: Boolean(tenantId),
    // 폼 상태가 이 결과로 한 번 만들어지므로 캐시를 남기지 않고 매번 새로 받는다.
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  // 전체 관리자 목록은 기관 id 만 있으면 받을 수 있어, 상세 응답을 기다리지 않고 함께 시작한다.
  // 결과는 SchoolAdminPanel 이 같은 쿼리로 읽는다.
  useQuery({
    ...schoolAdminsQueryOptions(tenantId ?? ""),
    enabled: Boolean(tenantId),
  });

  if (!tenantId || tab === null) {
    return <Navigate to={tenantPaths.list} replace />;
  }

  if (!query.data) {
    const notFound =
      query.error instanceof ApiError && query.error.status === 404;
    return (
      <div>
        <div className="mb-5 flex justify-end">
          <BackToList />
        </div>
        {query.isError ? (
          <div
            role="alert"
            className="bg-white p-12 text-center text-sm font-medium text-gray-500 shadow-sm"
          >
            {notFound
              ? "기관을 찾을 수 없어요."
              : "기관 정보를 불러오지 못했어요."}
          </div>
        ) : (
          <AdminDetailSkeleton
            rows={TENANT_FORM_FIELD_COUNT}
            label="기관 정보를 불러오는 중입니다."
          />
        )}
      </div>
    );
  }

  return <TenantDetailBody tenant={query.data} tab={tab} />;
}

function TenantDetailBody({
  tenant,
  tab,
}: {
  tenant: TenantDetailRow;
  tab: TenantTab;
}) {
  const tenantId = tenant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TenantFormValues>(() =>
    tenantFormFromRow(tenant),
  );
  // 저장하거나 불러온 시점의 입력. 이것과 다르면 고친 것이다.
  const [baseline, setBaseline] = useState<TenantFormValues>(form);
  const [savedName, setSavedName] = useState(tenant.name);
  // 서비스 설정 탭은 저장된 값만 본다(폼에서 고치는 중인 값은 아직 기관에 없다).
  const [savedTermMonths, setSavedTermMonths] = useState(tenant.term_months);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState(tenant.updated_at);
  const [message, setMessage] = useState("");

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useUnsavedGuard(dirty, (next) => {
    const base = tenantPaths.detail(tenantId);
    return next.pathname === base || next.pathname.startsWith(`${base}/`);
  });

  const saveMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchTenant>[0]) => patchTenant(body),
  });
  const saving = saveMutation.isPending;

  function setField(key: keyof TenantFormValues, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    if (saving) return;
    const invalid = validateTenantForm(form);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setMessage("");
    const submitted = form;
    saveMutation.mutate(
      {
        id: tenantId,
        updatedAt: loadedUpdatedAt,
        values: tenantPayload(submitted),
      },
      {
        onSuccess: (saved) => {
          setLoadedUpdatedAt(saved.updated_at);
          setBaseline(submitted);
          setSavedName(submitted.name.trim());
          setSavedTermMonths(
            submitted.term_months ? Number(submitted.term_months) : null,
          );
          setMessage("저장했어요.");
          queryClient.resetQueries({ queryKey: tenantKeys.list() });
        },
        onError: (error) => setMessage(saveErrorMessage(error)),
      },
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{savedName}</h1>
        <BackToList />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate(tenantPaths.tab(tenantId, value as TenantTab))
        }
      >
        <TabsList variant="line" className="mb-4 h-auto gap-2">
          {TABS.map((item) => (
            <TabsTrigger
              key={item.key}
              value={item.key}
              className="h-9 flex-none px-4 font-semibold group-data-horizontal/tabs:after:bottom-0 data-active:text-primary data-active:after:bg-primary"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="school-admins">
          <SchoolAdminPanel tenantId={tenantId} tenantName={savedName} />
        </TabsContent>
        <TabsContent value="service-settings">
          <ServiceSettingsPanel
            tenantId={tenantId}
            termMonths={savedTermMonths}
            isCatchAll={tenant.is_catch_all}
          />
        </TabsContent>
        <TabsContent value="info">
          <div className="bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="소속코드">
                <Input
                  value={tenant.code}
                  readOnly
                  className="h-10 bg-muted font-mono font-medium"
                />
              </Field>
              <Field label="이름">
                <TextInput
                  value={form.name}
                  onChange={(value) => setField("name", value)}
                />
              </Field>
              <Field label="지역">
                <Select
                  value={form.region}
                  onChange={(value) => setField("region", value)}
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
                  onChange={(value) => setField("org_type", value)}
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
                  onChange={(value) => setField("tier", value)}
                >
                  {TIER_OPTIONS.map((tier) => (
                    <option key={tier.value} value={tier.value}>
                      {tier.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="계약 시작일">
                <Input
                  type="date"
                  value={form.contract_start_date}
                  onChange={(e) =>
                    setField("contract_start_date", e.target.value)
                  }
                  className="h-10 font-medium"
                />
              </Field>
              <Field label="계약 종료일">
                <Input
                  type="date"
                  value={form.contract_end_date}
                  onChange={(e) =>
                    setField("contract_end_date", e.target.value)
                  }
                  className="h-10 font-medium"
                />
              </Field>
              <Field label="유예 종료일">
                <Input
                  type="date"
                  value={form.grace_ends_on}
                  onChange={(e) => setField("grace_ends_on", e.target.value)}
                  className="h-10 font-medium"
                />
              </Field>
              <Field label="시범 시작일">
                <Input
                  type="date"
                  value={form.trial_start_date}
                  onChange={(e) => setField("trial_start_date", e.target.value)}
                  className="h-10 font-medium"
                />
              </Field>
              <div>
                <Field label="시범 종료일">
                  <Input
                    type="date"
                    value={form.trial_end_date}
                    onChange={(e) => setField("trial_end_date", e.target.value)}
                    className="h-10 font-medium"
                  />
                </Field>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  시범기간에는 계약이 없어도 서비스가 열려요
                </p>
              </div>
              <Field label="학기 길이">
                <Select
                  value={form.term_months}
                  onChange={(value) => setField("term_months", value)}
                >
                  <option value="">미정</option>
                  <option value="3">3개월</option>
                  <option value="6">6개월</option>
                </Select>
              </Field>
              <div>
                <Field label="MOU">
                  <Select
                    value={form.mou_status}
                    onChange={(value) => setField("mou_status", value)}
                  >
                    <option value="">미정</option>
                    {MOU_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {mouLabel(status)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  서비스는 계약 종료일 기준으로 막혀요
                </p>
              </div>
              <Field label="담당자 이름">
                <TextInput
                  value={form.contact_name}
                  onChange={(value) => setField("contact_name", value)}
                />
              </Field>
              <Field label="담당 전화번호">
                <TextInput
                  value={form.contact_phone}
                  onChange={(value) => setField("contact_phone", value)}
                />
              </Field>
              <Field label="담당 휴대전화">
                <TextInput
                  value={form.contact_mobile}
                  onChange={(value) => setField("contact_mobile", value)}
                />
              </Field>
              <Field label="담당 이메일">
                <TextInput
                  value={form.contact_email}
                  onChange={(value) => setField("contact_email", value)}
                />
              </Field>
              <Field label="대표 전화">
                <TextInput
                  value={form.main_phone}
                  onChange={(value) => setField("main_phone", value)}
                />
              </Field>
              <Field label="홈페이지">
                <TextInput
                  value={form.homepage}
                  onChange={(value) => setField("homepage", value)}
                />
              </Field>
              <Field label="주소">
                <TextInput
                  value={form.address}
                  onChange={(value) => setField("address", value)}
                />
              </Field>
            </div>

            <div className="mt-6 flex items-center gap-4">
              <ActionButton onClick={save} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </ActionButton>
              {message && (
                <span className="text-sm font-medium text-gray-700">
                  {message}
                </span>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
