// 쿠폰 등록과 수정 폼 상태와 변환. 입력 검사는 화면에서 먼저 하고 서버 CHECK 는 마지막 방어선이다.

import type { CouponSaveInput } from "../../../../shared/coupon/contract.js";
import type { CouponRow } from "./api";
import { GRANT_TYPES } from "./copy";

// 신규 등록/수정 폼 로컬 상태, NULLABLE_KEYS 3필드는 `${key}_mode` 3상태 컨트롤과
// 짝을 이룬다(NullableField 참고). discount_amount 등 숫자 필드는 입력 중 빈 문자열도
// 거쳐가므로 number|string 유니온으로 원본 동작을 그대로 반영한다.
export interface CouponForm {
  is_active: boolean;
  slug: string;
  code: string;
  title: string;
  discount_amount: number | string;
  min_amount: number | string;
  stackable: boolean;
  grant_type: string;
  grant_on_signup: boolean;
  // 단체 쿠폰 축(2026-08-27 org_code > 2026-09-22 tenants FK). 드롭다운이
  // 담는 값은 tenants.id(uuid) 또는 빈 문자열(소속 없음)이다.
  tenant_id: string;
  valid_until: string;
  valid_until_mode: string;
  max_uses_per_user: number | string;
  max_uses_per_user_mode: string;
  max_redemptions: number | string;
  max_redemptions_mode: string;
}

export const FORM_KEYS: (keyof CouponForm)[] = [
  "is_active",
  "slug",
  "code",
  "tenant_id",
  "title",
  "discount_amount",
  "min_amount",
  "valid_until",
  "max_uses_per_user",
  "max_redemptions",
  "stackable",
  "grant_type",
  "grant_on_signup",
];

// NULL 을 고를 수 있는 3개 필드. 3상태다:
//   '' = 미선택(신규 등록의 기본값, 저장이 막힌다)
//   'unlimited' = NULL 을 명시적으로 선택
//   'value' = 값 입력
// max_uses_per_user 를 비운 채 저장되면 다시 무제한 쿠폰이 되므로(이 화면이
// 없애려는 결함 ①) "무제한" 을 고르려면 반드시 골라야 한다. valid_until /
// max_redemptions 도 같은 NULL 규약이라 같은 컨트롤,같은 규칙을 쓴다, 필드마다
// 다른 규칙을 두면 운영자가 어느 것이 강제인지 외워야 한다.
export const NULLABLE_KEYS: (keyof CouponForm)[] = [
  "valid_until",
  "max_uses_per_user",
  "max_redemptions",
];

const GIFT_CODE_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const GIFT_CODE_GROUP_LENGTH = 4;
export function generateGiftCode(): string {
  const bytes = new Uint8Array(GIFT_CODE_GROUP_LENGTH * 2);
  crypto.getRandomValues(bytes);
  const chars = Array.from(
    bytes,
    (b) => GIFT_CODE_CHARSET[b % GIFT_CODE_CHARSET.length],
  );
  const first = chars.slice(0, GIFT_CODE_GROUP_LENGTH).join("");
  const second = chars.slice(GIFT_CODE_GROUP_LENGTH).join("");
  return `WIN-${first}-${second}`;
}

export function emptyForm(): CouponForm {
  return {
    is_active: true,
    slug: "",
    code: "",
    tenant_id: "",
    title: "",
    discount_amount: "",
    min_amount: 0,
    stackable: false,
    // DB DEFAULT 와 같은 값으로 시작한다(sql/55 0-e절), 신규 쿠폰은
    // 조건형이 기본이고, 발급형은 명시적으로 골라야 한다.
    grant_type: "auto",
    grant_on_signup: false,
    valid_until: "",
    valid_until_mode: "",
    max_uses_per_user: "",
    // grant_type 기본값 'auto' 의 파생값과 일치시킨다(sql/70
    // coupons_cap_derived_from_grant_type_check, 조건형은 1인당 사용 횟수
    // 무제한이어야 한다). NullableField 가 이 필드를 항상 disabled 로 잠가
    // 화면에서 라디오를 눌러 고칠 수 없으므로, 여기를 ''(미선택)으로 두면
    // validateForm 이 매번 막아 신규 등록 기본 경로가 원천 봉쇄된다
    // (2026-08-12, 리뷰 BLOCK 수정).
    max_uses_per_user_mode: "unlimited",
    max_redemptions: "",
    max_redemptions_mode: "",
  };
}

export function rowToForm(row: CouponRow): CouponForm {
  const form = { ...emptyForm() };

  form.is_active = row.is_active !== false;
  form.slug = row.slug ?? "";
  form.code = row.code ?? "";
  form.tenant_id = row.tenant_id ?? "";
  form.title = row.title ?? "";
  form.discount_amount = row.discount_amount ?? "";
  form.min_amount = row.min_amount ?? 0;
  form.stackable = row.stackable === true;
  // 알 수 없는 값이 오면 조건형으로 떨어뜨리지 않고 원본을 그대로 들고 있다가
  // 저장 시 validateForm 이 막는다, 화면이 조용히 값을 바꿔 저장하면
  // "열어보기만 했는데 정책이 바뀌는" 사고가 된다.
  form.grant_type = row.grant_type ?? "auto";
  form.grant_on_signup = row.grant_on_signup === true;

  // NULLABLE_KEYS 3필드는 `${key}_mode` 라는 별도 필드명으로 확장 접근한다 ,
  // CouponForm에 이름이 정적으로 존재하지만 여기선 동적으로 조합하므로 로컬
  // Record 캐스트로 인덱싱한다(진짜 동적 키 접근 지점).
  const dynamicForm = form as unknown as Record<string, unknown>;
  for (const key of NULLABLE_KEYS) {
    const value = row[key as string];
    dynamicForm[`${key}_mode`] =
      value === null || value === undefined ? "unlimited" : "value";
    dynamicForm[key as string] =
      value === null || value === undefined ? "" : value;
  }

  return form;
}

export function formToPayload(form: CouponForm): CouponSaveInput {
  // NULLABLE_KEYS(3개)를 동적 키로 채우기 전까지는 내부적으로 Record로
  // 조립한다, 루프가 끝나면 slug/title/discount_amount 등 필수 필드까지
  // 전부 채워진 CouponInsert(=CouponUpdate와 키가 같다) 형태가 되므로 반환
  // 직전에 한 번만 좁힌다(동적 키 조립이라 정적으로 좁힐 수 없다).
  const payload: Record<string, unknown> = {
    slug: String(form.slug ?? "").trim(),
    // code 는 UNIQUE 인데 NULL 은 다중 허용이다, 빈 문자열로 저장하면 두 번째
    // 코드 없는 쿠폰이 23505 로 막힌다. 반드시 NULL 로 정규화한다.
    code: String(form.code ?? "").trim() || null,
    // 드롭다운이 tenants.id(uuid) 를 직접 담으므로 정규화가 필요 없다 ,
    // org_code 시절의 upper(trim()) 대칭 처리(coupons_org_code_normalized_check)는
    // tenant_id 전환과 함께 사라진다.
    tenant_id: form.tenant_id || null,
    title: String(form.title ?? "").trim(),
    discount_amount: Number(form.discount_amount),
    min_amount: Number(form.min_amount),
    is_active: form.is_active === true,
    stackable: form.stackable === true,
    grant_type: form.grant_type,
    // coupons_grant_on_signup_check 가 "granted 가 아니면 켤 수 없다" 를
    // 강제한다, 폼이 이미 비활성화하지만, 라디오를 되돌린 직후의 잔여값이
    // 그대로 전송돼 23514 원문이 노출되는 걸 여기서도 막는다.
    grant_on_signup:
      form.grant_type === "granted" && form.grant_on_signup === true,
  };

  const dynamicForm = form as unknown as Record<string, unknown>;
  for (const key of NULLABLE_KEYS) {
    if (dynamicForm[`${key}_mode`] === "unlimited") {
      payload[key as string] = null;
      continue;
    }
    payload[key as string] =
      key === "valid_until" ? dynamicForm[key] : Number(dynamicForm[key]);
  }

  return payload as unknown as CouponSaveInput;
}

// 검증 실패한 첫 키를 반환(없으면 null). 문구는 AdminForm 의 기존 템플릿에
// 이 키를 끼워 넣어 만든다, 새 문구를 만들지 않는다.
export function validateForm(form: CouponForm): keyof CouponForm | null {
  if (String(form.slug ?? "").trim() === "") return "slug";
  if (String(form.title ?? "").trim() === "") return "title";

  const discount = Number(form.discount_amount);
  // DB 에 CHECK 는 없지만 0원/음수 쿠폰은 의미가 없다(fn_redeem_coupons 도
  // 할인 0원을 적용해도 주문 금액이 그대로다). "안 채운 것" 과 같이 취급한다.
  if (!Number.isInteger(discount) || discount <= 0) return "discount_amount";

  const min = Number(form.min_amount);
  if (!Number.isInteger(min) || min < 0) return "min_amount";

  // coupons_grant_type_check 를 화면에서 먼저 건다, 23514 원문 노출 방지.
  if (!GRANT_TYPES.includes(form.grant_type)) return "grant_type";

  // 단체 쿠폰(tenant_id)은 조건형(auto)에만 얹는다(2026-08-27 org_code 기준
  // 결정, 2026-09-22 tenant_id 로 축 전환). 발급형은 이미 coupon_grants 로
  // "누가 쓸 수 있는가"를 정하고 있어 소속 축까지 겹치면 두 판정이 동시에
  // 걸려 운영이 헷갈린다, 소속 제한이 필요하면 발급을 끄고 소속만 쓴다.
  if (
    String(form.tenant_id ?? "").trim() !== "" &&
    form.grant_type === "granted"
  ) {
    return "tenant_id";
  }

  // `${key}_mode` 는 동적 조합 키라 CouponForm의 정적 키로 인덱싱할 수 없다 ,
  // rowToForm/formToPayload와 같은 이유로 Record 캐스트를 쓴다.
  const dynamicForm = form as unknown as Record<string, unknown>;
  for (const key of NULLABLE_KEYS) {
    const mode = dynamicForm[`${key}_mode`];
    if (mode !== "unlimited" && mode !== "value") return key;
    if (mode !== "value") continue;

    if (key === "valid_until") {
      if (String(form[key] ?? "").trim() === "") return key;
      continue;
    }

    const num = Number(form[key]);
    // coupons_max_uses_per_user_check / coupons_max_redemptions_check 가
    // `is null or > 0` 이다, 여기서 막지 않으면 23514 원문이 노출된다.
    if (!Number.isInteger(num) || num <= 0) return key;
  }

  // sql/70 coupons_cap_derived_from_grant_type_check, 발급형은 1인당 사용
  // 횟수가 반드시 1, 조건형은 반드시 무제한이어야 한다. NullableField 가
  // max_uses_per_user 를 disabled 로 잠가 화면 조작으로는 어긋날 수 없지만,
  // rowToForm 이 들고 온 기존 값(전환 전 데이터)까지 방어해 저장 시 23514
  // 원문이 뜨지 않게 한다.
  if (form.grant_type === "granted") {
    if (
      form.max_uses_per_user_mode !== "value" ||
      Number(form.max_uses_per_user) !== 1
    ) {
      return "max_uses_per_user";
    }
  } else if (form.grant_type === "auto") {
    if (form.max_uses_per_user_mode !== "unlimited") {
      return "max_uses_per_user";
    }
  }

  return null;
}
