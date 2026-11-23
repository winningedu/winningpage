import { describe, expect, it } from "vitest";
import { sheetRows } from "@/lib/diagnosis-v3/sheet";
import { SURVEY_V3_PAGES, SURVEY_V3_QUESTIONS } from "./diagnosisSurveyV3";

const metaRows = sheetRows("13_문항메타").filter((row) => row.r > 4);

describe("v3 문항 정의", () => {
  it("6개 화면에 13번 시트 B열 페이지대로 문항을 나눈다", () => {
    expect(SURVEY_V3_PAGES).toBe(6);
    const idsOf = (page: number) =>
      SURVEY_V3_QUESTIONS.filter((q) => q.page === page).map((q) => q.id);
    expect(idsOf(1)).toEqual(["q1", "q2", "q3", "q3r"]);
    expect(idsOf(2)).toEqual([
      "q4",
      "q5",
      "q6",
      "q6s",
      "q6r",
      "q6m",
      "q8",
      "q8s",
      "q8d",
    ]);
    expect(idsOf(3)).toEqual(["q9", "q20", "q10"]);
    expect(idsOf(4)).toEqual(["q11", "q12", "q13", "q21", "q14"]);
    expect(idsOf(5)).toEqual(["q15", "q16", "q17", "q18"]);
    expect(idsOf(6)).toEqual(["q22", "q23"]);
  });

  it("제목, 안내문구, 카테고리는 13번 시트 셀과 글자까지 같다", () => {
    for (const row of metaRows) {
      const question = SURVEY_V3_QUESTIONS.find((q) => q.id === row.c[0]);
      expect(question?.category).toBe(row.c[2]);
      expect(question?.title).toBe(row.c[3]);
      expect(question?.helper).toBe(row.c[4] ?? undefined);
    }
  });
});
