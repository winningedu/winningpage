// 학생 기관 이동과 이용 횟수 조정 API 계약(POST move-student, GET, PUT student-usage, 모두 /api/admin/tenants 아래).
// 서버(api/_routes/admin/tenants-students.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/tenants/)는 응답 스키마로 검증한다.

import { z } from "zod";
import { usageLimit } from "./detail.js";

/** 학생 이용 횟수 조정을 한 번에 저장하는 최대 행 수. */
export const STUDENT_USAGE_MAX_ROWS = 5000;

/** 학생 이동 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const STUDENT_MOVE_ERROR = {
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
  OTHER_TENANT_ENROLLMENT: "OTHER_TENANT_ENROLLMENT",
} as const;

export type StudentMoveErrorCode =
  (typeof STUDENT_MOVE_ERROR)[keyof typeof STUDENT_MOVE_ERROR];

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

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

/** 브라우저가 보내는 모양. */
export type MoveStudentInput = z.input<typeof moveStudentBody>;

export const studentUsageQuery = z.object({ profileId: z.guid() });

/**
 * 학생별 조정 저장 본문. 고친 칸(dirty)만 보낸다. 안 보낸 칸은 기존 조정을 덮지 않으므로 둘 다 없는 행은 의미가 없다.
 * program_key 가 서비스 목록 안에 있는지는 서버가 더 본다(목록이 api/ 에 있다).
 */
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

/** 브라우저가 보내는 모양. */
export type PutStudentUsageInput = z.input<typeof putStudentUsageBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const movedStudentSchema = z.object({
  fromTenantId: z.string().nullable(),
  tenantId: z.string(),
  enrollmentId: z.string(),
});

export type MovedStudent = z.output<typeof movedStudentSchema>;

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

export type StudentUsage = z.output<typeof studentUsageSchema>;

export const studentUsageSavedSchema = z.object({ saved: z.number() });
