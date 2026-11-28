// 입시 관리 계약: 서버가 검증하는 요청 스키마의 경계 값.

import { describe, expect, test } from "vitest";
import {
  activeYearBody,
  guidelinesBulkBody,
  RESULTS_BULK_MAX_ITEMS,
  resultsBulkBody,
  resultsRowsQuery,
} from "./contract.js";

describe("activeYearBody", () => {
  test("2000~2100 사이 정수만 받는다", () => {
    expect(activeYearBody.safeParse({ year: 2000 }).success).toBe(true);
    expect(activeYearBody.safeParse({ year: 2100 }).success).toBe(true);
    expect(activeYearBody.safeParse({ year: 1999 }).success).toBe(false);
    expect(activeYearBody.safeParse({ year: 2101 }).success).toBe(false);
    expect(activeYearBody.safeParse({ year: 2026.5 }).success).toBe(false);
    expect(activeYearBody.safeParse({ year: "2026" }).success).toBe(false);
  });
});

describe("resultsRowsQuery", () => {
  test("offset 은 0 이상 정수로 바꾸고 기본 0, fields 는 all 또는 id", () => {
    expect(resultsRowsQuery.parse({ fields: "id" })).toEqual({
      offset: 0,
      fields: "id",
    });
    expect(resultsRowsQuery.parse({ offset: "1000", fields: "all" })).toEqual({
      offset: 1000,
      fields: "all",
    });
    expect(
      resultsRowsQuery.safeParse({ offset: "-1", fields: "id" }).success,
    ).toBe(false);
    expect(resultsRowsQuery.safeParse({ fields: "x" }).success).toBe(false);
  });
});

const resultRow = {
  result_year: 2026,
  university_key: "u",
  university_name: "대학",
  department_key: "d",
  department_name: "학과",
  admission_track: "수시",
  main_track: "교과",
  screening_category: "일반",
  competition_rate: 3.5,
  converted_score: null,
  percentile: null,
  variant_seq: 1,
  is_active: true,
  waitlist_rank: null,
  subject_reflection: null,
  source_sheet: null,
  note: null,
  quota: null,
  source_row: null,
  grade_50: null,
  grade_70: null,
  grade_85: null,
  grade_90: null,
  grade_avg: null,
  grade_min: null,
  grade_avg10: null,
  grade_min10: null,
  grade_first_avg: null,
};

const guidelineRow = {
  admission_year: 2026,
  university_key: "u",
  university_name: "대학",
  region: "서울",
  source_name: "",
  source_version: "",
  is_active: true,
  campus: null,
  jungsi_guideline_url: null,
  official_source_url: null,
  memo: null,
  detail_status: null,
  matched_hwp_name: null,
  matched_text_name: null,
};

const firstMessage = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("resultsBulkBody", () => {
  test("items 는 상한 행 수까지 받는다", () => {
    const items = (n: number) => ({
      items: Array.from({ length: n }, () => resultRow),
    });
    expect(
      resultsBulkBody.safeParse(items(RESULTS_BULK_MAX_ITEMS)).success,
    ).toBe(true);
    expect(
      resultsBulkBody.safeParse(items(RESULTS_BULK_MAX_ITEMS + 1)).success,
    ).toBe(false);
  });

  test("행이 틀리면 첫 위반만 'n번째 행: 사유' 로 낸다", () => {
    const result = resultsBulkBody.safeParse({
      items: [resultRow, { ...resultRow, university_key: " " }, "x"],
    });

    expect(result.error?.issues).toHaveLength(1);
    expect(firstMessage(result)).toBe(
      "2번째 행: university_key가 비어 있습니다.",
    );
  });

  test("상한을 넘으면 행이 틀려도 상한 문구가 먼저다", () => {
    const result = resultsBulkBody.safeParse({
      items: Array.from({ length: RESULTS_BULK_MAX_ITEMS + 1 }, () => "x"),
    });

    expect(result.error?.issues).toHaveLength(1);
    expect(firstMessage(result)).toBe("items 는 500행 이하 배열이어야 합니다.");
  });

  test.each([[undefined], [{}], [{ items: "x" }], [[]]])(
    "본문 %j 은 items 문구로 거른다",
    (body) => {
      expect(firstMessage(resultsBulkBody.safeParse(body))).toBe(
        "items 는 500행 이하 배열이어야 합니다.",
      );
    },
  );
});

describe("guidelinesBulkBody", () => {
  test("행 규칙을 통과한 행은 입력 그대로 낸다", () => {
    expect(guidelinesBulkBody.parse({ items: [guidelineRow] })).toEqual({
      items: [guidelineRow],
    });
  });

  test("행이 틀리면 첫 위반만 'n번째 행: 사유' 로 낸다", () => {
    const result = guidelinesBulkBody.safeParse({
      items: [guidelineRow, null, { ...guidelineRow, university_name: " " }],
    });

    expect(result.error?.issues).toHaveLength(1);
    expect(firstMessage(result)).toBe("2번째 행: 행 형식이 올바르지 않습니다.");
  });

  test.each([[undefined], [{}], [{ items: "x" }]])(
    "본문 %j 은 items 문구로 거른다",
    (body) => {
      expect(firstMessage(guidelinesBulkBody.safeParse(body))).toBe(
        "items 는 행 배열이어야 합니다.",
      );
    },
  );
});
