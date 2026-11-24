// 엑셀 일괄 반영 본문의 컷 행 검증. 화면 파서(cutsBulkXlsx)가 이미 거르지만 서버는 브라우저를 믿지 않는다.
// 도메인 규칙은 화면과 같은 것을 쓴다: 컷 종류별 값 범위(GOAL_CUT_RANGE), key := name, 기준 연도 2000~2100.

import { z } from "zod";
import { GOAL_CUT_RANGE } from "../../../src/lib/goal/cutRange.js";

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

export type CutRow = z.infer<typeof cutRowShape>;
