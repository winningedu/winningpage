// 대입모집요강 일괄 반영(PUT /api/admin/admission/guidelines/bulk)의 행 규칙. (admission_year, university_key) 키로 upsert 한다.
// 행 검증은 src/lib/admissionBulkXlsx.ts 파서가 만드는 키와 이유 문구를 따른다. 서버는 그 파일을
// import 할 수 없어 섹션 키 표를 복사해 두고, 테스트가 파서 상수와 같음을 확인한다.

import { z } from "zod";

// 원문 컬럼 이름 -> json 컬럼, html 컬럼. html 쪽은 recruitment_quota 만 이름이 다르다.
export const SECTION_JSON_KEYS: Record<string, string> = {
  previous_year_changes: "previous_year_changes_json",
  selection_method: "selection_method_json",
  minimum_requirements: "minimum_requirements_json",
  exam_schedule: "exam_schedule_json",
  school_record_method: "school_record_method_json",
  recruitment_quota: "recruitment_quota_json",
};
export const SECTION_HTML_KEYS: Record<string, string> = {
  previous_year_changes: "previous_year_changes_html",
  selection_method: "selection_method_html",
  minimum_requirements: "minimum_requirements_html",
  exam_schedule: "exam_schedule_html",
  school_record_method: "school_record_method_html",
  recruitment_quota: "recruitment_result_html",
};

const REQUIRED_TEXT_COLUMNS = ["university_key", "region"];
const NULLABLE_TEXT_COLUMNS = [
  "campus",
  "jungsi_guideline_url",
  "official_source_url",
  "memo",
  "detail_status",
  "matched_hwp_name",
  "matched_text_name",
];

const show = (value: unknown): string => {
  if (value === undefined) return "";
  return typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value);
};
const msg = (col: string, what: string) => (issue: { input?: unknown }) =>
  `${col} 값 "${show(issue.input)}"이(가) ${what}`;
const text = (col: string) =>
  z.string({ error: msg(col, "문자열이 아닙니다.") });

const yearMessage = msg("admission_year", "양의 정수가 아닙니다.");

const shape: Record<string, z.ZodType> = {
  id: z.uuid({ error: msg("id", "uuid 가 아닙니다.") }).optional(),
  admission_year: z
    .number({ error: yearMessage })
    .int({ error: yearMessage })
    .positive({ error: yearMessage }),
  university_name: text("university_name"),
  // 파서가 clean() 한 값을 그대로 쓰므로 빈 문자열도 문자열이다(NOT NULL 컬럼).
  source_name: text("source_name"),
  source_version: text("source_version"),
  is_active: z.boolean({ error: msg("is_active", "true/false 가 아닙니다.") }),
};
for (const col of REQUIRED_TEXT_COLUMNS) shape[col] = text(col);
for (const col of NULLABLE_TEXT_COLUMNS) shape[col] = text(col).nullable();
for (const [raw, json] of Object.entries(SECTION_JSON_KEYS)) {
  shape[raw] = text(raw).optional();
  shape[json] = z
    .record(z.string(), z.unknown(), {
      error: msg(json, "객체 또는 null 이 아닙니다."),
    })
    .nullable()
    .optional();
}
for (const html of Object.values(SECTION_HTML_KEYS)) {
  shape[html] = text(html).nullable().optional();
}
const rowSchema = z.strictObject(shape);

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === 0 ||
  (typeof value === "string" && value.trim() === "");

/** 첫 위반의 이유 문구. 문제가 없으면 null. */
export function guidelineRowProblem(row: unknown): string | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return "행 형식이 올바르지 않습니다.";
  }
  const record = row as Record<string, unknown>;
  const missing = ["admission_year", "university_key", "region"].filter((col) =>
    isBlank(record[col]),
  );
  if (missing.length > 0) return `${missing.join(", ")}가 비어 있습니다.`;
  if (isBlank(record.university_name))
    return "university_name이 비어 있습니다.";
  const parsed = rowSchema.safeParse(record);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  if (issue?.code === "unrecognized_keys") {
    return `허용하지 않는 컬럼이 있습니다: ${issue.keys.join(", ")}.`;
  }
  return issue?.message ?? "행 형식이 올바르지 않습니다.";
}
