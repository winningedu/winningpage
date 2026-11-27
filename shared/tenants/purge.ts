// 계약 종료 회원 삭제 API 계약(POST member-purge, GET member-purge-preview, GET purge-logs, 모두 /api/admin/tenants 아래).
// 서버(api/_routes/admin/tenants-purge.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/tenants/purgeQueries.ts)는 응답 스키마로 검증한다.

import { z } from "zod";

/** 삭제 대상 학생 번호를 한 번에 받는 최대 수. */
export const MEMBER_PURGE_MAX_TARGETS = 5000;
/** 삭제 로그를 최근 순으로 읽는 행 수. */
export const PURGE_LOG_LIMIT = 200;

/** 회원 삭제 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const PURGE_ERROR = {
  NOT_YET: "NOT_YET",
} as const;

export type PurgeErrorCode = (typeof PURGE_ERROR)[keyof typeof PURGE_ERROR];

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 삭제 대상 학생 번호 목록. 1명 이상 5,000명 이하, 모두 uuid 이고 겹치지 않아야 한다. */
export const memberPurgeBody = z.object({
  tenantId: z.guid().transform((value) => value.toLowerCase()),
  targetIds: z
    .array(z.guid().transform((value) => value.toLowerCase()))
    .min(1)
    .max(MEMBER_PURGE_MAX_TARGETS)
    .refine((ids) => new Set(ids).size === ids.length),
});

/** 브라우저가 보내는 모양. */
export type MemberPurgeInput = z.input<typeof memberPurgeBody>;

export const memberPurgePreviewQuery = z.object({ tenantId: z.guid() });

export const purgeLogsQuery = z.object({ tenantId: z.string().optional() });

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

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

export type PurgePreview = z.output<typeof purgePreviewSchema>;

export const purgeResultSchema = z.object({
  deleted: z.number(),
  excluded: z.number(),
  skipped: z.number(),
  notProcessed: z.number(),
});

export type PurgeResult = z.output<typeof purgeResultSchema>;

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

export type PurgeLogEntry = z.output<typeof purgeLogEntrySchema>;

export const purgeLogsSchema = z.object({
  items: z.array(purgeLogEntrySchema),
});

export type PurgeLogs = z.output<typeof purgeLogsSchema>;
