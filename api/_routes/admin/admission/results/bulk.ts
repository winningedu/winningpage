// POST /api/admin/admission/results/bulk
//
// 입결정보 엑셀 업로드 한 청크(최대 500행)를 반영한다. id 없는 행은 insert, id 있는 행은 upsert.
// 행 검증은 src/lib/admissionResultsBulkXlsx.ts 의 파서 규칙과 문구를 따른다. 서버는 그 파일을
// import 할 수 없어(import 사슬에 .js 없는 상대 경로가 있어 운영에서 깨진다) 옵션 목록을 복사해 두고,
// 테스트가 파서 상수와 같음을 확인한다.

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// 브라우저가 한 번에 보내는 상한(예전 RESULTS_APPLY_CHUNK).
const MAX_ITEMS = 500;

export const RESULT_OPTIONS = {
  mainTrack: ["교과", "종합", "논술", "실기", "기타"],
  screeningCategory: [
    "일반",
    "추천형",
    "지역인재",
    "농어촌",
    "기회균형",
    "특성화고",
    "특수교육",
    "논술",
    "실기",
    "성인학습자",
    "재외국민",
    "기타",
  ],
  resultYear: [2025, 2026],
};

const GRADE_COLUMNS = [
  "grade_50",
  "grade_70",
  "grade_85",
  "grade_90",
  "grade_avg",
  "grade_min",
  "grade_avg10",
  "grade_min10",
  "grade_first_avg",
];
const GRADE_RANGE_LIMIT = 100;
const COMPETITION_RATE_RANGE_LIMIT = 10000;
const REQUIRED_TEXT_COLUMNS = [
  "university_key",
  "university_name",
  "department_key",
  "department_name",
  "admission_track",
];
const NULLABLE_TEXT_COLUMNS = [
  "waitlist_rank",
  "subject_reflection",
  "source_sheet",
  "note",
];
const NULLABLE_INTEGER_COLUMNS = ["quota", "source_row"];

const show = (value: unknown): string => {
  if (value === undefined) return "";
  return typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value);
};
const msg = (col: string, what: string) => (issue: { input?: unknown }) =>
  `${col} 값 "${show(issue.input)}"이(가) ${what}`;
const number = (col: string) =>
  z.number({ error: msg(col, "숫자가 아닙니다.") });
const integer = (col: string) =>
  z
    .number({ error: msg(col, "정수가 아닙니다.") })
    .int({ error: msg(col, "정수가 아닙니다.") });
const text = (col: string) =>
  z.string({ error: msg(col, "문자열이 아닙니다.") });
const option = (col: string, allowed: string[]) =>
  text(col)
    .nullable()
    .refine((v) => v === null || allowed.includes(v), {
      error: (issue) =>
        `${col} "${show(issue.input)}"은(는) 허용 값(${allowed.join("|")})이 아닙니다.`,
    });

const yearMessage = (issue: { input?: unknown }) =>
  `result_year는 ${RESULT_OPTIONS.resultYear.join("/")} 중 하나여야 합니다(입력값: ${show(issue.input)}).`;

const shape: Record<string, z.ZodType> = {
  id: integer("id")
    .positive({ error: msg("id", "양의 정수가 아닙니다.") })
    .optional(),
  result_year: z
    .number({ error: yearMessage })
    .refine((v) => RESULT_OPTIONS.resultYear.includes(v), {
      error: yearMessage,
    }),
  main_track: option("main_track", RESULT_OPTIONS.mainTrack),
  screening_category: option(
    "screening_category",
    RESULT_OPTIONS.screeningCategory,
  ),
  competition_rate: number("competition_rate")
    .refine((v) => Math.abs(v) < COMPETITION_RATE_RANGE_LIMIT, {
      error: (issue) =>
        `competition_rate 값(${show(issue.input)})이 numeric(6,2) 범위(절댓값 10,000 미만)를 벗어났습니다.`,
    })
    .nullable(),
  converted_score: number("converted_score").nullable(),
  percentile: number("percentile").nullable(),
  variant_seq: integer("variant_seq"),
  is_active: z.boolean({ error: msg("is_active", "true/false 가 아닙니다.") }),
};
for (const col of REQUIRED_TEXT_COLUMNS) shape[col] = text(col);
for (const col of NULLABLE_TEXT_COLUMNS) shape[col] = text(col).nullable();
for (const col of NULLABLE_INTEGER_COLUMNS) {
  shape[col] = integer(col).nullable();
}
for (const col of GRADE_COLUMNS) {
  shape[col] = number(col)
    .refine((v) => Math.abs(v) < GRADE_RANGE_LIMIT, {
      error: (issue) =>
        `${col} 값(${show(issue.input)})이 numeric(4,2) 범위(절댓값 100 미만)를 벗어났습니다.`,
    })
    .nullable();
}
const rowSchema = z.strictObject(shape);

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

/** 첫 위반의 이유 문구. 문제가 없으면 null. */
function rowProblem(row: unknown): string | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return "행 형식이 올바르지 않습니다.";
  }
  const record = row as Record<string, unknown>;
  const missing = ["result_year", ...REQUIRED_TEXT_COLUMNS].filter((col) =>
    isBlank(record[col]),
  );
  if (missing.length > 0) return `${missing.join(", ")}가 비어 있습니다.`;
  const parsed = rowSchema.safeParse(record);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  if (issue?.code === "unrecognized_keys") {
    return `허용하지 않는 컬럼이 있습니다: ${issue.keys.join(", ")}.`;
  }
  return issue?.message ?? "행 형식이 올바르지 않습니다.";
}

const body = z.object({ items: z.array(z.unknown()).max(MAX_ITEMS) });

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "admissionResults" },
  unhandledMessage: "입결정보를 반영하지 못했습니다.",
  logLabel: "[admin/admission/results/bulk]",
  handler: async (req, res, ctx) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) {
      sendError(
        res,
        "problem",
        400,
        `items 는 ${MAX_ITEMS}행 이하 배열이어야 합니다.`,
        "VALIDATION_FAILED",
      );
      return;
    }
    const items: Record<string, unknown>[] = [];
    for (const [index, item] of parsed.data.items.entries()) {
      const problem = rowProblem(item);
      if (problem) {
        sendError(
          res,
          "problem",
          400,
          `${index + 1}번째 행: ${problem}`,
          "VALIDATION_FAILED",
        );
        return;
      }
      items.push(item as Record<string, unknown>);
    }
    const inserts = items.filter((item) => item.id === undefined);
    const updates = items.filter((item) => item.id !== undefined);

    // 아무것도 쓰기 전에 id 존재를 확인해, 없는 id 때문에 insert 만 반영되는 일을 막는다.
    if (updates.length > 0) {
      const ids = [...new Set(updates.map((item) => Number(item.id)))];
      const { data, error } = await ctx.supabaseAdmin
        .from("admission_results")
        .select("id")
        .in("id", ids);
      if (error) throw new Error("admission_results id read failed");
      const found = new Set((data ?? []).map((r) => r.id));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length > 0) {
        sendError(
          res,
          "problem",
          404,
          `없는 id 가 있습니다: ${missing.join(", ")}`,
          "NOT_FOUND",
        );
        return;
      }
    }

    if (inserts.length > 0) {
      const { error } = await ctx.supabaseAdmin
        .from("admission_results")
        .insert(inserts);
      if (error) throw new Error("admission_results insert failed");
    }
    if (updates.length > 0) {
      const { error } = await ctx.supabaseAdmin
        .from("admission_results")
        .upsert(updates, { onConflict: "id" });
      if (error) throw new Error("admission_results upsert failed");
    }
    res.status(200).json({ inserted: inserts.length, updated: updates.length });
  },
});
