// 기관 정보 탭의 입력 값, 검증, 저장 페이로드. 저장은 tenants 를 RLS 로 바로 고치므로(서버 검증 없음)
// 날짜 순서는 DB 제약(tenants_contract_order, tenants_grace_after_end)과 같은 규칙을 여기서 먼저 막는다.
// 형식 규칙은 api/_routes/console/org-info.ts 와 같다. 소속 코드는 발급 후 불변이라 페이로드에 넣지 않는다.

import { HOMEPAGE_PREFIX, withoutBareScheme } from "@/lib/homepage";

export interface TenantFormValues {
  name: string;
  region: string;
  org_type: string;
  tier: string;
  contract_start_date: string;
  contract_end_date: string;
  term_months: string;
  mou_status: string;
  grace_ends_on: string;
  contact_name: string;
  contact_phone: string;
  contact_mobile: string;
  contact_email: string;
  address: string;
  main_phone: string;
  homepage: string;
}

const PHONE = /^[0-9-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOMEPAGE = /^https?:\/\/\S+$/;

export function emptyTenantForm(): TenantFormValues {
  return {
    name: "",
    region: "서울",
    org_type: "기관",
    tier: "W",
    contract_start_date: "",
    contract_end_date: "",
    term_months: "",
    mou_status: "",
    grace_ends_on: "",
    contact_name: "",
    contact_phone: "",
    contact_mobile: "",
    contact_email: "",
    address: "",
    main_phone: "",
    homepage: "",
  };
}

/** tenants 행(일부 칼럼만 있어도 된다)을 입력 값으로 바꾼다. null 은 빈 문자열이다. */
export function tenantFormFromRow(
  row: Partial<
    Record<keyof TenantFormValues, string | number | null | undefined>
  >,
): TenantFormValues {
  const values = emptyTenantForm();
  for (const key of Object.keys(values) as (keyof TenantFormValues)[]) {
    const value = row[key];
    if (value !== null && value !== undefined) values[key] = String(value);
  }
  if (values.homepage === "") values.homepage = HOMEPAGE_PREFIX;
  return values;
}

/** 첫 위반 문구. 통과하면 null. */
export const CONTRACT_ORDER_MESSAGE =
  "계약 시작일은 종료일보다 늦을 수 없어요.";
export const GRACE_ORDER_MESSAGE =
  "유예 종료일은 계약 종료일과 같거나 그 뒤여야 해요.";

export function validateTenantForm(values: TenantFormValues): string | null {
  if (!values.name.trim()) return "이름 항목을 입력해주세요.";
  const { contract_start_date: start, contract_end_date: end } = values;
  if (start && end && start > end) {
    return CONTRACT_ORDER_MESSAGE;
  }
  if (end && values.grace_ends_on && values.grace_ends_on < end) {
    return GRACE_ORDER_MESSAGE;
  }
  if (values.term_months !== "" && !["3", "6"].includes(values.term_months)) {
    return "학기 길이는 3개월 또는 6개월이어야 해요.";
  }
  const email = values.contact_email.trim();
  if (email && !EMAIL.test(email)) return "담당 이메일 형식을 확인해 주세요.";
  const phones: [string, string][] = [
    [values.contact_phone, "담당 전화번호"],
    [values.contact_mobile, "담당 휴대전화"],
    [values.main_phone, "대표 전화"],
  ];
  for (const [value, label] of phones) {
    if (value.trim() && !PHONE.test(value.trim())) {
      return `${label}는 숫자와 하이픈만 쓸 수 있어요.`;
    }
  }
  const homepage = withoutBareScheme(values.homepage).trim();
  if (homepage && !HOMEPAGE.test(homepage)) {
    return "홈페이지는 http:// 또는 https:// 로 시작해야 해요.";
  }
  return null;
}

const blankToNull = (value: string) => value.trim() || null;

/** tenants update 본문. 비운 선택 항목은 null, 학기 길이는 숫자. */
export function tenantPayload(values: TenantFormValues) {
  return {
    name: values.name.trim(),
    region: values.region,
    org_type: values.org_type,
    tier: values.tier,
    contract_start_date: blankToNull(values.contract_start_date),
    contract_end_date: blankToNull(values.contract_end_date),
    term_months: values.term_months === "" ? null : Number(values.term_months),
    mou_status: blankToNull(values.mou_status),
    grace_ends_on: blankToNull(values.grace_ends_on),
    contact_name: blankToNull(values.contact_name),
    contact_phone: blankToNull(values.contact_phone),
    contact_mobile: blankToNull(values.contact_mobile),
    contact_email: blankToNull(values.contact_email),
    address: blankToNull(values.address),
    main_phone: blankToNull(values.main_phone),
    homepage: blankToNull(withoutBareScheme(values.homepage)),
  };
}
