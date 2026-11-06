import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import SchoolAdminPanel from "./SchoolAdminPanel";
import { mouLabel } from "./tenantContract";
import {
  CONTRACT_ORDER_MESSAGE,
  emptyTenantForm,
  GRACE_ORDER_MESSAGE,
  type TenantFormValues,
  tenantFormFromRow,
  tenantPayload,
  validateTenantForm,
} from "./tenantForm";
import {
  ORG_TYPE_OPTIONS,
  REGION_OPTIONS,
  TIER_OPTIONS,
} from "./tenantOptions";

// ---------------------------------------------------------------------------
// 본사 기관 상세(5번 본사 관리 화면, 사 #144, #159, 결정 r14, r15). 기관 정보 탭은 tenants 를 RLS 로
// 바로 고치고(tenants_update 는 tenants edit 권한), 학교 관리자 탭은 서버 경로를 부른다.
// 서비스 설정 탭은 다음 작업에서 이 탭 목록에 붙는다.
// ---------------------------------------------------------------------------

type TabKey = "info" | "schoolAdmins";

const TABS: { key: TabKey; label: string }[] = [
  { key: "info", label: "기관 정보" },
  { key: "schoolAdmins", label: "학교 관리자" },
];

const TENANT_COLUMNS =
  "id, code, name, region, org_type, tier, contract_start_date, contract_end_date, term_months, mou_status, grace_ends_on, contact_name, contact_phone, contact_mobile, contact_email, address, main_phone, homepage, is_catch_all, updated_at";

const MOU_OPTIONS = ["pending", "signed", "ended"];

interface TenantDetailProps {
  tenantId: string;
  onBack: () => void;
  /** 저장이 성공한 뒤(목록을 다시 불러오는 데 쓴다). */
  onSaved?: () => void;
}

export default function TenantDetail({
  tenantId,
  onBack,
  onSaved,
}: TenantDetailProps) {
  const [tab, setTab] = useState<TabKey>("info");
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [form, setForm] = useState<TenantFormValues>(() => emptyTenantForm());
  const [savedName, setSavedName] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select(TENANT_COLUMNS)
        .eq("id", tenantId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        setLoadFailed(true);
        return;
      }
      if (!data) {
        setNotFound(true);
        return;
      }
      const row = data as unknown as Record<string, string | number | null> & {
        code: string;
        name: string;
        updated_at: string;
      };
      setLoadedUpdatedAt(row.updated_at);
      setCode(row.code);
      setForm(tenantFormFromRow(row));
      setSavedName(row.name);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [tenantId]);

  function setField(key: keyof TenantFormValues, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (saving) return;
    const invalid = validateTenantForm(form);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setMessage("");
    setSaving(true);
    const { data, error } = await supabase
      .from("tenants")
      .update(tenantPayload(form))
      .eq("id", tenantId)
      .eq("updated_at", loadedUpdatedAt)
      .select("id, updated_at");
    if (!error && (!data || data.length === 0)) {
      // 0행은 권한이 없거나 그 사이 다른 관리자가 먼저 저장한 경우다. 다시 읽어 구분한다.
      const { data: current } = await supabase
        .from("tenants")
        .select("updated_at")
        .eq("id", tenantId)
        .maybeSingle();
      setSaving(false);
      const changed =
        current &&
        (current as unknown as { updated_at: string }).updated_at !==
          loadedUpdatedAt;
      setMessage(
        changed
          ? "다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 저장해 주세요."
          : "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.",
      );
      return;
    }
    setSaving(false);
    if (error) {
      if (error.code === "23514") {
        if (error.message.includes("tenants_contract_order")) {
          setMessage(CONTRACT_ORDER_MESSAGE);
          return;
        }
        if (error.message.includes("tenants_grace_after_end")) {
          setMessage(GRACE_ORDER_MESSAGE);
          return;
        }
      }
      setMessage(`저장 실패: ${error.message}`);
      return;
    }
    const [saved] = (data ?? []) as { updated_at: string }[];
    if (saved) setLoadedUpdatedAt(saved.updated_at);
    setSavedName(form.name.trim());
    setMessage("저장했어요.");
    onSaved?.();
  }

  if (notFound || loadFailed || !loaded) {
    return (
      <div>
        <div className="mb-5 flex justify-end">
          <ActionButton variant="light" onClick={onBack}>
            목록으로
          </ActionButton>
        </div>
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
          {loadFailed
            ? "기관 정보를 불러오지 못했어요."
            : notFound
              ? "기관을 찾을 수 없어요."
              : "데이터를 불러오는 중입니다."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-[#111827]">{savedName}</h1>
        <ActionButton variant="light" onClick={onBack}>
          목록으로
        </ActionButton>
      </div>

      <div role="tablist" className="mb-4 flex gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`h-9 px-4 text-sm font-black ${
              tab === item.key
                ? "bg-[#0D1B2A] text-white"
                : "border border-gray-400 bg-white text-gray-800"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "schoolAdmins" ? (
        <SchoolAdminPanel tenantId={tenantId} tenantName={savedName} />
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="소속 코드">
              <input
                value={code}
                readOnly
                className="h-10 w-full border border-gray-300 bg-gray-50 px-3 font-mono text-sm font-bold"
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
            <Field label="기업형태">
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
              <input
                type="date"
                value={form.contract_start_date}
                onChange={(e) =>
                  setField("contract_start_date", e.target.value)
                }
                className="h-10 w-full border border-gray-300 px-3 text-sm font-bold"
              />
            </Field>
            <Field label="계약 종료일">
              <input
                type="date"
                value={form.contract_end_date}
                onChange={(e) => setField("contract_end_date", e.target.value)}
                className="h-10 w-full border border-gray-300 px-3 text-sm font-bold"
              />
            </Field>
            <Field label="유예 종료일">
              <input
                type="date"
                value={form.grace_ends_on}
                onChange={(e) => setField("grace_ends_on", e.target.value)}
                className="h-10 w-full border border-gray-300 px-3 text-sm font-bold"
              />
            </Field>
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
              <p className="mt-1 text-xs font-bold text-gray-500">
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
              <span className="text-sm font-bold text-gray-700">{message}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
