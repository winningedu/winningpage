// 기관 관리 API 계약. 서버(api/_routes/admin/tenants*.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/tenants/)는 응답 스키마로 검증한다.
// 화면 문구와 날짜 계산(mouLabel, 삭제 D-day)은 브라우저 전용이라 src/pages/admin/tenants/contract.ts 에 둔다.

import { z } from "zod";
import { uuidId } from "../http/params.js";

/** 삭제 대상 학생 번호를 한 번에 받는 최대 수. */
export const MEMBER_PURGE_MAX_TARGETS = 5000;
/** 삭제 로그를 최근 순으로 읽는 행 수. */
export const PURGE_LOG_LIMIT = 200;
/** 기관 하나의 전체 관리자를 읽는 행 수. */
export const SCHOOL_ADMIN_LIMIT = 200;
/** 학생 이용 횟수 조정을 한 번에 저장하는 최대 행 수. */
export const STUDENT_USAGE_MAX_ROWS = 5000;
/** smallint 한도(DB 제약 > 0). */
export const USAGE_LIMIT_MAX = 32767;

/** 기관 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const TENANT_ERROR = {
  NOT_SUPER_ADMIN: "NOT_SUPER_ADMIN",
  CONTRACT_ORDER: "CONTRACT_ORDER",
  GRACE_ORDER: "GRACE_ORDER",
  TRIAL_ORDER: "TRIAL_ORDER",
  NOT_YET: "NOT_YET",
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
  OTHER_TENANT_ENROLLMENT: "OTHER_TENANT_ENROLLMENT",
} as const;

export type TenantErrorCode = (typeof TENANT_ERROR)[keyof typeof TENANT_ERROR];

const nullableText = z.string().nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const phoneText = z
  .string()
  .regex(/^[0-9-]+$/)
  .nullable();
const usageLimit = z.number().int().min(1).max(USAGE_LIMIT_MAX).nullable();

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 경로 :id 가 기관 uuid 인 라우트. */
export const tenantIdParams = z.object({ id: uuidId });

/** 등록 화면이 만드는 네 칸만 받는다. 그 밖의 키는 400 이다. */
export const createTenantBody = z
  .object({
    name: z.string().trim().min(1),
    region: z.string(),
    org_type: z.string(),
    tier: z.string(),
  })
  .strict();
export type CreateTenantInput = z.input<typeof createTenantBody>;

/** 기관 수정 본문. 목록 밖 칸(code, is_catch_all 등)은 strict 가 400 으로 막는다. */
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
export type PutServiceSettingInput = z.input<typeof putServiceSettingBody>;

/** 전체 관리자 발급 본문. 이름, 전화번호, 직책 같은 나머지 칸은 서버가 정규화하며 본다. */
export const issueSchoolAdminBody = z.looseObject({
  tenantId: z.string().min(1),
});
/** 발급 화면이 보내는 모양. */
export interface IssueSchoolAdminInput {
  tenantId: string;
  name: string;
  phone: string;
  landline?: string;
  email?: string;
  position?: string;
}

export const schoolAdminsQuery = z.object({ tenantId: uuidId });

/** 삭제 대상 학생 번호 목록. 1명 이상 5,000명 이하, 모두 uuid 이고 겹치지 않아야 한다. */
export const memberPurgeBody = z.object({
  tenantId: z.guid().transform((value) => value.toLowerCase()),
  targetIds: z
    .array(z.guid().transform((value) => value.toLowerCase()))
    .min(1)
    .max(MEMBER_PURGE_MAX_TARGETS)
    .refine((ids) => new Set(ids).size === ids.length),
});
export type MemberPurgeInput = z.input<typeof memberPurgeBody>;

export const memberPurgePreviewQuery = z.object({ tenantId: z.guid() });
export const purgeLogsQuery = z.object({ tenantId: z.string().optional() });

// 빈 반, 그룹 이름은 null 로 맞춘다(비어 있지 않은 값은 그대로 둔다).
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) =>
    value === undefined || value === null || value.trim() === "" ? null : value,
  );

/** 학생 기관 이동 본문. 학년과 번호가 학적 규칙 안인지는 서버가 더 본다(규칙이 api/ 에 있다). */
export const moveStudentBody = z.object({
  profileId: z.string().min(1),
  tenantId: z.string().min(1),
  grade: z.string(),
  groupName: optionalText,
  className: optionalText,
  number: z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type MoveStudentInput = z.input<typeof moveStudentBody>;

export const studentUsageQuery = z.object({ profileId: z.guid() });

/** 고친 칸(dirty)만 보낸다. 안 보낸 칸은 기존 조정을 덮지 않으므로 둘 다 없는 행은 의미가 없다. */
export const putStudentUsageBody = z.object({
  rows: z
    .array(
      z
        .object({
          profile_id: z.guid(),
          program_key: z.string(),
          monthly_limit: usageLimit.optional(),
          term_limit: usageLimit.optional(),
          // 진짜 칼럼이라 스냅샷에 실려 올 수 있다. 받되 쓰지 않고 서버가 채운다.
          updated_by: z.unknown().optional(),
          updated_at: z.unknown().optional(),
        })
        // 테이블에 없는 키(created_at, id 등)는 400 으로 막는다.
        .strict()
        .refine(
          (row) =>
            row.monthly_limit !== undefined || row.term_limit !== undefined,
        ),
    )
    .min(1)
    .max(STUDENT_USAGE_MAX_ROWS),
});
export type PutStudentUsageInput = z.input<typeof putStudentUsageBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const tenantRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  region: z.string(),
  org_type: z.string(),
  tier: z.string(),
  created_at: z.string(),
  // 아래 열은 스쿨멘토(hqTenantAdmin)에서만 온다.
  contract_start_date: nullableText.optional(),
  contract_end_date: nullableText.optional(),
  grace_ends_on: nullableText.optional(),
  mou_status: nullableText.optional(),
  is_catch_all: z.boolean().optional(),
  time_zone: z.string().optional(),
});
export type TenantRow = z.infer<typeof tenantRowSchema>;

export const tenantListSchema = z.object({
  items: z.array(tenantRowSchema),
  graceDays: z.number().nullable(),
});
export type TenantList = z.infer<typeof tenantListSchema>;

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
export type TenantDetailRow = z.infer<typeof tenantDetailSchema>;

export const tenantSavedSchema = z.object({
  id: z.string(),
  updated_at: z.string(),
});
export type TenantSaved = z.infer<typeof tenantSavedSchema>;

export const settingRowSchema = z.object({
  program_key: z.string(),
  enabled: z.boolean(),
  starts_on: nullableText,
  ends_on: nullableText,
  monthly_limit: z.number().nullable(),
  term_limit: z.number().nullable(),
});
export type SettingRowDto = z.infer<typeof settingRowSchema>;

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
export type ServiceSettings = z.infer<typeof serviceSettingsSchema>;

export const schoolAdminListSchema = z.object({
  address: nullableText,
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string(),
      landline: nullableText,
      email: nullableText,
      position: nullableText,
      loginId: nullableText,
      status: z.enum(["active", "inactive"]),
      issuedAt: z.string(),
      canceledAt: nullableText,
    }),
  ),
});
export type SchoolAdminList = z.infer<typeof schoolAdminListSchema>;

export const issuedSchoolAdminSchema = z.object({
  loginId: z.string(),
  tempPassword: z.string().optional(),
});
export type IssuedSchoolAdmin = z.infer<typeof issuedSchoolAdminSchema>;

export const purgePreviewSchema = z.object({
  contractEnd: z.string().nullable(),
  graceEnd: z.string().nullable(),
  deletableFrom: z.string().nullable(),
  /** 삭제 가능일까지 남은 날. 0 이하면 지금 지울 수 있다. */
  dDay: z.number().nullable(),
  students: z.array(
    z.object({
      id: z.string(),
      /** 서버가 가린 이름이다("김*늘"). */
      name: z.string(),
      grade: z.string().nullable(),
      classLabel: z.string().nullable(),
      number: z.number().nullable(),
      protected: z.boolean(),
    }),
  ),
});
export type PurgePreview = z.infer<typeof purgePreviewSchema>;

export const purgeResultSchema = z.object({
  deleted: z.number(),
  excluded: z.number(),
  skipped: z.number(),
  notProcessed: z.number(),
});
export type PurgeResult = z.infer<typeof purgeResultSchema>;

export const purgeLogEntrySchema = z.object({
  id: z.string(),
  executedAt: z.string(),
  executedBy: z.string().nullable(),
  tenant: z
    .object({ id: z.string().nullable(), code: z.string(), name: z.string() })
    .nullable(),
  contractEndDate: z.string().nullable(),
  deletedCount: z.number(),
  excludedCount: z.number(),
  skippedCount: z.number(),
  memberIds: z.array(z.string()),
});
export type PurgeLogEntry = z.infer<typeof purgeLogEntrySchema>;

export const purgeLogsSchema = z.object({
  items: z.array(purgeLogEntrySchema),
});

export const movedStudentSchema = z.object({
  fromTenantId: z.string().nullable(),
  tenantId: z.string(),
  enrollmentId: z.string(),
});
export type MovedStudent = z.infer<typeof movedStudentSchema>;

export const studentUsageSchema = z.object({
  tenant: z
    .object({ id: z.string(), name: z.string(), isCatchAll: z.boolean() })
    .nullable(),
  programs: z.array(
    z.object({
      programKey: z.string(),
      allowed: z.boolean(),
      denyReason: z.string().nullable(),
      monthUsed: z.number(),
      monthLimit: z.number().nullable(),
      monthRemaining: z.number().nullable(),
      termUsed: z.number(),
      termLimit: z.number().nullable(),
      termRemaining: z.number().nullable(),
      monthResetsOn: z.string().nullable(),
      termResetsOn: z.string().nullable(),
      setting: z
        .object({
          enabled: z.boolean(),
          monthlyLimit: z.number().nullable(),
          termLimit: z.number().nullable(),
        })
        .nullable(),
      override: z
        .object({
          monthlyLimit: z.number().nullable(),
          termLimit: z.number().nullable(),
        })
        .nullable(),
    }),
  ),
});
export type StudentUsage = z.infer<typeof studentUsageSchema>;

export const studentUsageSavedSchema = z.object({ saved: z.number() });
