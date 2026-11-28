// 입결정보 일괄 반영(POST /api/admin/admission/results/bulk)의 행 규칙. id 없는 행은 insert, id 있는 행은 upsert 대상이다.
// 서버(api/_routes/admin/admission.ts)와 요청 스키마(shared/admission/contract.ts)가 쓴다.
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
const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

const FORMAT_MESSAGE = "행 형식이 올바르지 않습니다.";

/**
 * 행 하나. 객체가 아니면, 필수 칸이 비면, 칸 규칙을 어기면 그 사유 문구가 첫 이슈의 message 다.
 * 필수 칸 비어 있음이 칸 규칙(타입, 허용 값)보다 먼저다.
 */
export const resultRowSchema = z
  .record(z.string(), z.unknown(), { error: FORMAT_MESSAGE })
  .superRefine((record, ctx) => {
    const missing = ["result_year", ...REQUIRED_TEXT_COLUMNS].filter((col) =>
      isBlank(record[col]),
    );
    if (missing.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `${missing.join(", ")}가 비어 있습니다.`,
      });
    }
  })
  .pipe(
    z.strictObject(shape, {
      error: (issue) => {
        if (issue.code === "unrecognized_keys") {
          return `허용하지 않는 컬럼이 있습니다: ${issue.keys.join(", ")}.`;
        }
        return issue.code === "invalid_type" ? FORMAT_MESSAGE : undefined;
      },
    }),
  );
