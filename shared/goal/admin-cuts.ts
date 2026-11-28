// 목표관리 컷 관리 계약(/api/goal/admin/cuts/...). 요청 스키마(일괄 반영 행, 백필 미리보기와 반영)와 응답 스키마.
// 서버(api/_routes/goal/admin/cuts.ts)와 화면(src/pages/admin/goal/cutsApi.ts)이 같은 스키마를 쓴다.

import { z } from "zod";
import { GOAL_CUT_RANGE } from "./cutRange.js";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 일괄 반영 한 청크의 최대 행 수. */
export const GOAL_CUTS_APPLY_CHUNK = 500;

// 서버가 만드는 컬럼. 행 스냅샷에 실려 와도 조용히 뗀다.
const DROPPED_COLUMNS = ["created_at", "updated_at"];

const text = z.string().trim().min(1);

const cutRowShape = z.strictObject({
  id: z.number().int().positive().optional(),
  cut_type: z.enum(["normal", "special", "jungsi"]),
  university_key: text,
  university_name: text,
  department_key: text,
  department_name: text,
  avg_cut: z.number().nullable(),
  source: z.enum(["admission_results", "manual"]),
  source_year: z.number().int().min(2000).max(2100).nullable(),
  is_active: z.boolean(),
  note: z.string().nullable(),
});

/**
 * 엑셀 일괄 반영 본문의 컷 행. 화면 파서(cutsBulkXlsx)가 이미 거르지만 서버는 브라우저를 믿지 않는다.
 * 도메인 규칙은 화면과 같다: 컷 종류별 값 범위(GOAL_CUT_RANGE), key := name, 기준 연도 2000~2100.
 */
export const cutRowSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !DROPPED_COLUMNS.includes(key)),
    );
  },
  cutRowShape.superRefine((row, ctx) => {
    // 어드민은 key := name 을 강제한다. 두 유일성 인덱스가 같은 축이어야 upsert 가 안전하다.
    if (row.university_key !== row.university_name) {
      ctx.addIssue({
        code: "custom",
        path: ["university_key"],
        message: "대학 key 는 대학명과 같아야 합니다.",
      });
    }
    if (row.department_key !== row.department_name) {
      ctx.addIssue({
        code: "custom",
        path: ["department_key"],
        message: "학과 key 는 학과명과 같아야 합니다.",
      });
    }
    const range = GOAL_CUT_RANGE[row.cut_type];
    if (
      row.avg_cut !== null &&
      (row.avg_cut < range.min || row.avg_cut > range.max)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["avg_cut"],
        message: `컷 값은 ${range.label} 범위(${range.min} ~ ${range.max})여야 합니다.`,
      });
    }
  }),
);

export type CutRow = z.output<typeof cutRowShape>;

export const cutsBulkBody = z.object({
  rows: z
    .array(cutRowSchema)
    .min(1)
    .max(GOAL_CUTS_APPLY_CHUNK)
    .refine(
      (rows) => {
        const ids = rows.flatMap((row) =>
          row.id === undefined ? [] : [row.id],
        );
        return new Set(ids).size === ids.length;
      },
      { message: "같은 id 가 두 번 들어 있습니다." },
    ),
});

export const cutsRowsQuery = z.object({
  from: z.coerce.number().int().min(0).default(0),
});

export const backfillYearModeSchema = z.enum([
  "prefer2026",
  "only2026",
  "only2025",
]);
export const backfillPreserveModeSchema = z.enum(["preserve", "overwrite"]);
export const backfillOrphanModeSchema = z.enum(["keep", "deactivate"]);

export const backfillPreviewQuery = z.object({
  yearMode: backfillYearModeSchema,
  preserveMode: backfillPreserveModeSchema,
});

export const backfillApplyBody = z.object({
  yearMode: backfillYearModeSchema,
  preserveMode: backfillPreserveModeSchema,
  orphanMode: backfillOrphanModeSchema,
  // 관리자가 미리보기에서 확인한 건수. 반영 직전에 다시 계산한 값과 같아야 한다.
  expectedApplyCount: z.number().int().min(0),
  expectedOrphanCount: z.number().int().min(0),
});

export type BackfillPreviewQuery = z.input<typeof backfillPreviewQuery>;
export type BackfillApplyBody = z.input<typeof backfillApplyBody>;
export type PreserveMode = z.output<typeof backfillPreserveModeSchema>;
export type OrphanMode = z.output<typeof backfillOrphanModeSchema>;

/** 미리보기 이후 건수가 바뀌어 반영하지 않았다(409). 확장 멤버 applyCount, orphanCount. */
export const BACKFILL_PREVIEW_STALE = "BACKFILL_PREVIEW_STALE";
/** 청크 반영 중 일부가 실패했다. 확장 멤버 applied, step, range, columns. */
export const BACKFILL_APPLY_FAILED = "BACKFILL_APPLY_FAILED";

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

const count = z.number().int();

export const cutsSummaryResponse = z.object({
  total: count,
  active: count,
  normal: count,
  special: count,
  jungsi: count,
  missing: count,
  comboTotal: count,
  comboNoJungsi: count,
});

export const cutsRowsResponse = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  next: z.number().int().nullable(),
});

export const jungsiMissingResponse = z.object({
  items: z.array(
    z.object({ university_name: z.string(), department_name: z.string() }),
  ),
});

export const cutsBulkResponse = z.object({ inserted: count, updated: count });

const backfillPayloadSchema = z.object({
  cut_type: z.enum(["normal", "special"]),
  university_key: z.string(),
  university_name: z.string(),
  department_key: z.string(),
  department_name: z.string(),
  avg_cut: z.number(),
  source: z.literal("admission_results"),
  source_year: z.number(),
});

export const backfillPreviewResponse = z.object({
  sourceRowCount: count,
  stats: z.object({
    universityCount: count,
    pairCount: count,
    totalRows: count,
    normalCount: count,
    specialCount: count,
    year2026Pairs: count,
    year2025Pairs: count,
    excludedStarPairs: count,
    excludedEmptyPairs: count,
    excludedNoTrackPairs: count,
    mergedCount: count,
    distribution: z.object({
      min: z.number().nullable(),
      p25: z.number().nullable(),
      median: z.number().nullable(),
      p75: z.number().nullable(),
      max: z.number().nullable(),
    }),
    samples: z.array(backfillPayloadSchema),
  }),
  analysis: z.object({
    overlapCount: count,
    manualCount: count,
    inactiveCount: count,
    notedCount: count,
    preservedCount: count,
    nameAxisCount: count,
  }),
  applyCount: count,
  orphanCount: count,
});

export const backfillApplyResponse = z.object({
  applied: count,
  deactivated: count,
});

export type CutsSummary = z.output<typeof cutsSummaryResponse>;
export type BackfillPreview = z.output<typeof backfillPreviewResponse>;
