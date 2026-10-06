import { describe, expect, test } from "vitest";
import type { Analysis, SessionActivityView } from "@/lib/selfeval/types";
import { buildPromoteDraft, toPromoted } from "./promoteDraft";

const analysis = (values: Partial<Analysis["values"]>): Analysis => ({
  values: {
    motive: "",
    concept: "",
    action: "",
    method: "",
    result: "",
    role: "",
    collaboration: "",
    learning: "",
    career: "",
    limitation: "",
    next: "",
    ...values,
  },
  sources: {} as Analysis["sources"],
  conflicts: [],
});

const core = (
  values: Partial<Analysis["values"]>,
  topic: string | null = "설문 분석 활동",
) =>
  ({
    activityRecordId: "a1",
    role: "core",
    fitScore: null,
    fitReasons: null,
    analysis: analysis(values),
    analysisSource: "model",
    record: { id: "a1", topic },
  }) as SessionActivityView;

describe("buildPromoteDraft", () => {
  test("주제는 활동명, 개념 방법 결과 한계는 분석 값을 그대로 쓴다", () => {
    const draft = buildPromoteDraft(
      core({
        concept: "표본 추출",
        method: "설문을 돌렸다",
        result: "정리했다",
        limitation: "표본이 작았다",
      }),
      "세션 활동명",
    );
    expect(draft).toMatchObject({
      topic: "설문 분석 활동",
      concept: "표본 추출",
      method: "설문을 돌렸다",
      result: "정리했다",
      limitation: "표본이 작았다",
    });
  });

  test("기록에 활동명이 없으면 세션 활동명을 쓰고 둘 다 없으면 빈 칸이다", () => {
    expect(buildPromoteDraft(core({}, null), "세션 활동명").topic).toBe(
      "세션 활동명",
    );
    expect(buildPromoteDraft(core({}, null), null).topic).toBe("");
  });

  test("수치는 결과 문장 중 숫자가 있는 문장만 한 줄씩 담는다", () => {
    const draft = buildPromoteDraft(
      core({ result: "정확도가 0.71이었다. 의미가 있었다. 40명이 응답했다." }),
      null,
    );
    expect(draft.numbers).toBe("정확도가 0.71이었다.\n40명이 응답했다.");
  });

  test("자료명은 따옴표 안 문자열과 자료 어절을 중복 없이 모으고 발표 같은 낱말은 거른다", () => {
    const draft = buildPromoteDraft(
      core({
        method: '"청소년 통계"를 읽고 자료를 비교했다',
        result: "발표 자료를 만들었다. 데이터는 정리했다",
      }),
      null,
    );
    expect(draft.sources.split("\n")).toEqual([
      "청소년 통계",
      "자료",
      "데이터",
    ]);
  });

  test("분석이 없으면 값은 모두 빈 칸이다", () => {
    const draft = buildPromoteDraft(
      { ...core({}), analysis: null } as SessionActivityView,
      null,
    );
    expect(draft).toEqual({
      topic: "설문 분석 활동",
      concept: "",
      method: "",
      result: "",
      limitation: "",
      numbers: "",
      sources: "",
    });
  });
});

describe("toPromoted", () => {
  test("줄 단위 칸은 빈 줄을 버리고 배열로 바꾼다", () => {
    expect(
      toPromoted({
        topic: " 주제 ",
        concept: "c",
        method: "m",
        result: "r",
        limitation: "l",
        numbers: "40명\n\n  12%  ",
        sources: "",
      }),
    ).toEqual({
      topic: "주제",
      concept: "c",
      method: "m",
      result: "r",
      limitation: "l",
      numbers: ["40명", "12%"],
      sources: [],
    });
  });
});
