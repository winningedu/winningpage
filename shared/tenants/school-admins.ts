// 학교 관리자(전체 관리자) API 계약(POST /api/admin/tenants/school-admin, GET /api/admin/tenants/school-admins).
// 서버(api/_routes/admin/tenants-school-admins.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/tenants/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";

/** 기관 하나의 학교 관리자를 읽는 행 수. */
export const SCHOOL_ADMIN_LIMIT = 200;

const nullableText = z.string().nullable();

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 발급 본문. 칸의 모양만 여기서 보고, 값 규칙(이름 공백, 전화번호 자릿수, 이메일 형식, 직책 길이)은 서버가 정규화하며 본다(틀리면 400 VALIDATION_FAILED). */
export const issueSchoolAdminBody = z.looseObject({
  tenantId: z.string().min(1),
  name: z.string(),
  phone: z.string(),
  landline: z.string().nullish(),
  email: z.string().nullish(),
  position: z.string().nullish(),
});

/** 발급 화면이 보내는 모양. */
export type IssueSchoolAdminInput = z.input<typeof issueSchoolAdminBody>;

export const schoolAdminsQuery = z.object({ tenantId: z.guid() });

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

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

export type SchoolAdminList = z.output<typeof schoolAdminListSchema>;

/** 서버가 registerResponseBody 에서 ok 를 뺀 그대로 보낸다. tempPassword 는 이번에 새로 발급한 경우에만 있다. */
export const issuedSchoolAdminSchema = z.object({
  teacherId: z.string(),
  loginId: z.string(),
  verdict: z.string(),
  tempPassword: z.string().optional(),
  sendStatus: z.enum(["sent", "failed", "skipped"]).optional(),
});

export type IssuedSchoolAdmin = z.output<typeof issuedSchoolAdminSchema>;
