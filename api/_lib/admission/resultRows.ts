// 입결정보 일괄 반영(POST /api/admin/admission/results/bulk)의 행 규칙. id 없는 행은 insert, id 있는 행은 upsert 대상이다.
// 행 검증은 src/lib/admissionResultsBulkXlsx.ts 의 파서 규칙과 문구를 따른다. 서버는 그 파일을
// import 할 수 없어(import 사슬에 .js 없는 상대 경로가 있어 운영에서 깨진다) 옵션 목록을 복사해 두고,
// 테스트가 파서 상수와 같음을 확인한다.

import { z } from "zod";

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
export function resultRowProblem(row: unknown): string | null {
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
