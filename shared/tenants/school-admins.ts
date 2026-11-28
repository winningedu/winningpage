// 학교 관리자(전체 관리자) API 계약(POST /api/admin/tenants/school-admin, GET /api/admin/tenants/school-admins).
// 서버(api/_routes/admin/tenants-school-admins.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/tenants/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";

/** 기관 하나의 학교 관리자를 읽는 행 수. */
export const SCHOOL_ADMIN_LIMIT = 200;

const nullableText = z.string().nullable();

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

const MAX_POSITION_LENGTH = 50;
const MAX_EMAIL_LENGTH = 254;

/** 발급 칸이 틀리면 화면에 보이는 한 줄. 어느 칸이 틀려도 같은 문구다. */
export const ISSUE_SCHOOL_ADMIN_INVALID_MESSAGE =
  "기관, 이름, 전화번호, 직책, 이메일, 일반전화를 확인해 주세요.";
const invalid = { error: ISSUE_SCHOOL_ADMIN_INVALID_MESSAGE };

const digitsOf = (value: string) => value.replace(/\D/g, "");
// 비어 있으면 값 없음(undefined)으로 읽는다. 선택 칸에 쓴다.
const blankToUndefined = (value: string) => value || undefined;

/** 발급 본문. 이름 공백, 전화번호 자릿수, 이메일 형식, 길이 규칙까지 여기서 보고 정규화한다(틀리면 400 VALIDATION_FAILED, errors[0].message 가 화면 문구). */
export const issueSchoolAdminBody = z.object({
  tenantId: z.string().min(1),
  name: z.string(invalid).trim().min(1, invalid),
  phone: z
    .string(invalid)
    .transform(digitsOf)
    .pipe(z.string().regex(/^01[0-9]{8,9}$/, invalid)),
  landline: z
    .string(invalid)
    .transform(digitsOf)
    .pipe(z.string().regex(/^(0[0-9]{8,10})?$/, invalid))
    .transform(blankToUndefined)
    .nullish()
    .transform((value) => value ?? undefined),
  email: z
    .string(invalid)
    .trim()
    .toLowerCase()
    .pipe(
      z
        .string()
        .max(MAX_EMAIL_LENGTH, invalid)
        .regex(/^([^\s@]+@[^\s@]+\.[^\s@]+)?$/, invalid),
    )
    .transform(blankToUndefined)
    .nullish()
    .transform((value) => value ?? undefined),
  position: z
    .string(invalid)
    .trim()
    .max(MAX_POSITION_LENGTH, invalid)
    .transform(blankToUndefined)
    .nullish()
    .transform((value) => value ?? undefined),
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
