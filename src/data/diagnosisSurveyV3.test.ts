import { describe, expect, it } from "vitest";
import { REQUIRED_QUESTIONS } from "@/lib/diagnosis-v3/codes";
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

  it("화면 번호는 명세서 B열 번호(8번=q9, 9번=q20 ...)를 따른다", () => {
    const labels = Object.fromEntries(
      SURVEY_V3_QUESTIONS.map((q) => [q.id, q.label]),
    );
    expect(labels).toEqual({
      q1: "1",
      q2: "2",
      q3: "3",
      q3r: "3-1",
      q4: "4",
      q5: "5",
      q6: "6",
      q6s: "6-1",
      q6r: "6-2",
      q6m: "6-3",
      q8: "7",
      q8s: "7-1",
      q8d: "7-2",
      q9: "8",
      q20: "9",
      q10: "10",
      q11: "11",
      q12: "12",
      q13: "13",
      q21: "14",
      q14: "15",
      q15: "16",
      q16: "17",
      q17: "18",
      q18: "19",
      q22: "20",
      q23: "21",
    });
  });

  it("입력 방식, 필수 여부, 최대 선택 수는 13번 시트 F, G열을 따른다", () => {
    const byId = Object.fromEntries(SURVEY_V3_QUESTIONS.map((q) => [q.id, q]));
    expect(
      SURVEY_V3_QUESTIONS.filter((q) => q.required).map((q) => q.id),
    ).toEqual(REQUIRED_QUESTIONS);
    const kinds = Object.fromEntries(
      SURVEY_V3_QUESTIONS.map((q) => [q.id, q.kind]),
    );
    expect(kinds).toEqual({
      q1: "single",
      q2: "single",
      q3: "single",
      q3r: "multi",
      q4: "single",
      q5: "single",
      q6: "number",
      q6s: "grades",
      q6r: "number",
      q6m: "mock",
      q8: "single",
      q8s: "single",
      q8d: "single",
      q9: "likert",
      q20: "likert",
      q10: "multi",
      q11: "likert",
      q12: "multi",
      q13: "schedule",
      q21: "pair",
      q14: "multi",
      q15: "cascade",
      q16: "single",
      q17: "single",
      q18: "single",
      q22: "single",
      q23: "likert",
    });
    expect(byId.q1?.chip).toBe(true);
    expect(byId.q2?.chip).toBe(true);
    expect(byId.q3?.chip).toBe(false);
    expect(byId.q3r?.maxPicks).toBe(2);
    expect(byId.q10?.maxPicks).toBe(3);
    expect(byId.q12?.maxPicks).toBe(3);
    expect(byId.q14?.maxPicks).toBe(2);
    expect(byId.q13?.maxPicks).toBe(3);
    expect(byId.q1?.maxPicks).toBeUndefined();
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
