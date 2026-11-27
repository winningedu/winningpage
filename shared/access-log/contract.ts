// 개인정보 접근 로그 API 계약. 서버(api/_routes/admin/access-logs.ts)가 요청 스키마로 검증하고, 브라우저(접근 로그 화면, 반출 게이트)가 응답 스키마로 검증한다.

import { z } from "zod";

/** 접근 로그 한 줄의 구분. 화면 필터와 응답의 kind 가 같은 목록이다. */
export const ACCESS_LOG_KINDS = [
  "view",
  "edit",
  "create",
  "delete",
  "export",
  "proxy",
] as const;

export type AccessLogKind = (typeof ACCESS_LOG_KINDS)[number];

/** 한 쪽에 돌려주는 줄 수. */
export const ACCESS_LOG_PAGE_SIZE = 50;

/** 반출 게이트가 남기는 접근 기록의 동작. */
export const ACCESS_LOG_WRITE_ACTIONS = ["download", "unmask"] as const;

export type AccessLogWriteAction = (typeof ACCESS_LOG_WRITE_ACTIONS)[number];

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

// 빈 문자열은 없는 값으로 본다(화면이 비운 칸을 그대로 보낸다).
const blankAsAbsent = (value: unknown) => (value === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankAsAbsent, schema.optional());

// 시각은 ISO 8601 Z(예: 2026-10-31T15:00:00.000Z)다. 달력에 없는 날이거나 형식이 다르면 거른다.
const ISO_Z = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isRealInstant(value: string): boolean {
  const match = ISO_Z.exec(value);
  if (!match) return false;
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return false;
  return moment.toISOString().slice(0, 10) === match[1]; // tz-literal-ok: ISO Z 입력의 UTC 날짜 부분이 실존하는지만 본다
}

const instant = z.string().refine(isRealInstant);

/** GET 쿼리. from 은 포함, to 는 미포함인 ISO Z 시각이다. */
export const accessLogsQuery = z.object({
  tenantCode: optional(z.string()),
  from: optional(instant),
  to: optional(instant),
  kind: optional(z.enum(ACCESS_LOG_KINDS)),
  page: z.preprocess(
    blankAsAbsent,
    z.string().transform(Number).pipe(z.number().int().min(1)).default(1),
  ),
});

/** POST 본문. 본인 id 와 이메일은 서버가 토큰에서 채우므로 받지 않는다. */
export const accessLogWriteBody = z.object({
  action: z.enum(ACCESS_LOG_WRITE_ACTIONS),
  resourceKey: z.string().min(1),
  reason: z.string().trim().min(1),
  rowCount: z.number().int().min(0).optional(),
  targetId: z.string().optional(),
});

/** 브라우저가 보내는 모양. */
export type AccessLogWriteInput = z.input<typeof accessLogWriteBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const accessLogEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  tenantCode: z.string().nullable(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  reason: z.string().nullable(),
  teacherName: z.string().nullable(),
  teacherLoginId: z.string().nullable(),
  teacherPhone: z.string().nullable(),
  kind: z.enum(ACCESS_LOG_KINDS),
  kindLabel: z.string(),
  targetStudentName: z.string().nullable(),
  content: z.string(),
  isProxy: z.boolean(),
});

export type AccessLogEntry = z.output<typeof accessLogEntrySchema>;

export const accessLogPageSchema = z.object({
  items: z.array(accessLogEntrySchema),
  page: z.number(),
  hasNext: z.boolean(),
});

export type AccessLogPage = z.output<typeof accessLogPageSchema>;

/** 201 응답. */
export const accessLogCreatedSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
});

export type AccessLogCreated = z.output<typeof accessLogCreatedSchema>;
