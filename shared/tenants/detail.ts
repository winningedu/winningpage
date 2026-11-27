// 기관 상세와 서비스 설정 API 계약(GET, PATCH /api/admin/tenants/:id, GET, PUT /api/admin/tenants/:id/service-settings).
// 서버(api/_routes/admin/tenants-detail.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/tenants/api.ts)는 응답 스키마로 검증한다.
// 목록과 등록은 shared/tenants/contract.ts 다.

import { z } from "zod";

/** smallint 한도(DB 제약 > 0). */
export const USAGE_LIMIT_MAX = 32767;

/** 기관 수정 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const TENANT_DETAIL_ERROR = {
  CONTRACT_ORDER: "CONTRACT_ORDER",
  GRACE_ORDER: "GRACE_ORDER",
  TRIAL_ORDER: "TRIAL_ORDER",
} as const;

export type TenantDetailErrorCode =
  (typeof TENANT_DETAIL_ERROR)[keyof typeof TENANT_DETAIL_ERROR];

const nullableText = z.string().nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const phoneText = z
  .string()
  .regex(/^[0-9-]+$/)
  .nullable();

/** 이용 횟수 한도. 1 이상 smallint 한도 이하이거나 null(제한 없음)이다. */
export const usageLimit = z
  .number()
  .int()
  .min(1)
  .max(USAGE_LIMIT_MAX)
  .nullable();

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 경로 :id 가 기관 uuid 인 라우트. 옛 라우트처럼 uuid 모양이면 받는다(버전 비트는 보지 않는다). */
export const tenantIdParams = z.object({ id: z.guid() });

/**
 * 기관 수정 본문. 칸은 화면의 tenantPayload 가 돌려주는 것 그대로이고 비운 선택 항목은 null 이다.
 * 목록 밖 칸(code, is_catch_all 등)은 쓰기 허용 목록을 넘으므로 strict 가 400 으로 막는다.
 */
export const patchTenantBody = z.object({
  updatedAt: z.string().min(1),
  values: z
    .object({
      name: z.string().trim().min(1),
      region: z.string(),
      org_type: z.string(),
      tier: z.string(),
      contract_start_date: date,
      contract_end_date: date,
      term_months: z.union([z.literal(3), z.literal(6)]).nullable(),
      mou_status: nullableText,
      grace_ends_on: date,
      trial_start_date: date,
      trial_end_date: date,
      contact_name: nullableText,
      contact_phone: phoneText,
      contact_mobile: phoneText,
      contact_email: z
        .string()
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
        .nullable(),
      address: nullableText,
      main_phone: phoneText,
      homepage: z
        .string()
        .regex(/^https?:\/\/\S+$/)
        .nullable(),
    })
    .strict(),
});

/** 브라우저가 보내는 모양. */
export type PatchTenantInput = z.input<typeof patchTenantBody>;

/**
 * 서비스 설정 한 행의 upsert 본문. 표 칸을 되돌려 보내는 클라이언트를 받아 주되 값은 쓰지 않는다(변경자와 시각은 서버가 채운다).
 * program_key 가 서비스 목록 안에 있는지는 서버가 더 본다(목록이 api/ 에 있다).
 */
export const putServiceSettingBody = z
  .strictObject({
    tenant_id: z.unknown().optional(),
    id: z.unknown().optional(),
    created_at: z.unknown().optional(),
    updated_at: z.unknown().optional(),
    updated_by: z.unknown().optional(),
    program_key: z.string(),
    enabled: z.boolean(),
    starts_on: date,
    ends_on: date,
    monthly_limit: usageLimit,
    term_limit: usageLimit,
  })
  .refine(
    (row) => !row.starts_on || !row.ends_on || row.starts_on <= row.ends_on,
  );

/** 브라우저가 보내는 모양. */
export type PutServiceSettingInput = z.input<typeof putServiceSettingBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const tenantDetailSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  region: z.string(),
  org_type: z.string(),
  tier: z.string(),
  contract_start_date: nullableText,
  contract_end_date: nullableText,
  term_months: z.number().nullable(),
  mou_status: nullableText,
  grace_ends_on: nullableText,
  trial_start_date: nullableText,
  trial_end_date: nullableText,
  contact_name: nullableText,
  contact_phone: nullableText,
  contact_mobile: nullableText,
  contact_email: nullableText,
  address: nullableText,
  main_phone: nullableText,
  homepage: nullableText,
  is_catch_all: z.boolean(),
  updated_at: z.string(),
});

export type TenantDetailRow = z.output<typeof tenantDetailSchema>;

export const tenantSavedSchema = z.object({
  id: z.string(),
  updated_at: z.string(),
});

export type TenantSaved = z.output<typeof tenantSavedSchema>;

export const settingRowSchema = z.object({
  program_key: z.string(),
  enabled: z.boolean(),
  starts_on: nullableText,
  ends_on: nullableText,
  monthly_limit: z.number().nullable(),
  term_limit: z.number().nullable(),
});

export type SettingRowDto = z.output<typeof settingRowSchema>;

export const usageDefaultsSchema = z.record(
  z.string(),
  z.object({
    monthly_limit: z.number().optional(),
    term_limit_by_term_months: z.record(z.string(), z.number()).optional(),
  }),
);

export const serviceSettingsSchema = z.object({
  items: z.array(settingRowSchema),
  defaults: usageDefaultsSchema,
});

export type ServiceSettings = z.output<typeof serviceSettingsSchema>;
