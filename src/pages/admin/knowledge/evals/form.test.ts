import { describe, expect, test } from "vitest";
import {
  diffMetrics,
  isSameParams,
  sortSweepItems,
  toGoldenRow,
  toParamOverrides,
  toSweepGrid,
} from "./form";

describe("toParamOverrides", () => {
  test("채운 칸만 숫자로 바꾸고 빈 칸은 빼서 운영값을 쓰게 한다", () => {
    expect(
      toParamOverrides({
        matchThreshold: " 0.45 ",
        rrfK: "",
        fullTextWeight: "2",
        semanticWeight: "",
        matchCount: "",
      }),
    ).toEqual({
      ok: true,
      overrides: { matchThreshold: 0.45, fullTextWeight: 2 },
    });
  });

  test("숫자가 아닌 칸이 있으면 그 칸 이름으로 거절한다", () => {
    const result = toParamOverrides({
      matchThreshold: "",
      rrfK: "abc",
      fullTextWeight: "",
      semanticWeight: "",
      matchCount: "",
    });
    expect(result).toEqual({ ok: false, message: "RRF k 는 숫자여야 합니다." });
  });
});

describe("toSweepGrid", () => {
  test("쉼표 목록과 단어:의미 가중치 쌍을 grid 로 바꾸고 빈 칸은 빈 목록이다", () => {
    expect(
      toSweepGrid({
        rrfK: "20, 60",
        weights: "1:1, 0.5:1.5",
        matchThreshold: "",
      }),
    ).toEqual({
      ok: true,
      grid: {
        rrfK: [20, 60],
        weights: [
          { fullText: 1, semantic: 1 },
          { fullText: 0.5, semantic: 1.5 },
        ],
        matchThreshold: [],
      },
    });
  });

  test("가중치 쌍 모양이 틀리면 거절한다", () => {
    expect(toSweepGrid({ rrfK: "", weights: "1", matchThreshold: "" })).toEqual(
      {
        ok: false,
        message: "가중치 쌍은 단어:의미 모양으로 적습니다. 예 1:1, 0.5:1.5",
      },
    );
  });

  test("쌍 한쪽이 비어 있으면 0 으로 읽지 않고 거절한다", () => {
    expect(
      toSweepGrid({ rrfK: "", weights: "1:", matchThreshold: "" }).ok,
    ).toBe(false);
  });

  test("숫자 목록에 숫자가 아닌 값이 있으면 거절한다", () => {
    expect(
      toSweepGrid({ rrfK: "20, x", weights: "", matchThreshold: "" }).ok,
    ).toBe(false);
  });
});

const prod = {
  matchThreshold: 0.5,
  rrfK: 60,
  fullTextWeight: 1,
  semanticWeight: 1,
  matchCount: 12,
};
const metrics = (mrr: number) => ({ recall: { "1": 0 }, mrr });

describe("isSameParams", () => {
  test("다섯 값이 모두 같아야 같은 조합이다", () => {
    expect(isSameParams(prod, { ...prod })).toBe(true);
    expect(isSameParams(prod, { ...prod, rrfK: 20 })).toBe(false);
  });
});

describe("sortSweepItems", () => {
  test("MRR 내림차순으로 놓고 건너뛴 조합은 맨 뒤에 둔다", () => {
    const items = [
      { status: "skipped" as const, params: { ...prod, rrfK: 1 } },
      {
        status: "done" as const,
        runId: "a",
        params: prod,
        metrics: metrics(0.2),
      },
      {
        status: "done" as const,
        runId: "b",
        params: { ...prod, rrfK: 20 },
        metrics: metrics(0.9),
      },
    ];
    expect(sortSweepItems(items).map((i) => i.params.rrfK)).toEqual([
      20, 60, 1,
    ]);
  });
});

describe("diffMetrics", () => {
  test("recall@k 를 k 오름차순으로, 마지막에 MRR 을 두고 나중 실행에서 앞 실행을 뺀다", () => {
    const before = { recall: { "10": 0.5, "1": 0.25 }, mrr: 0.4 };
    const after = { recall: { "1": 0.5, "10": 0.5 }, mrr: 0.3 };
    expect(diffMetrics(before, after)).toEqual([
      { label: "recall@1", before: 0.25, after: 0.5, diff: 0.25 },
      { label: "recall@10", before: 0.5, after: 0.5, diff: 0 },
      { label: "MRR", before: 0.4, after: 0.3, diff: -0.10000000000000003 },
    ]);
  });

  test("한쪽에만 있는 k 는 없는 쪽을 null 로 두고 차이도 null 이다", () => {
    expect(
      diffMetrics({ recall: { "3": 1 }, mrr: 1 }, { recall: {}, mrr: 1 })[0],
    ).toEqual({ label: "recall@3", before: 1, after: null, diff: null });
  });
});

describe("toGoldenRow", () => {
  const draft = {
    grade: " 고2 ",
    subject: "물리학Ⅰ",
    career: "",
    selectedTopic: "마찰력",
    assessmentInfo: "",
    note: "",
    expected: [{ id: "r1", title: "자료 1" }],
  };

  test("앞뒤 공백을 지우고 빈 선택 칸은 null 로 저장한다", () => {
    expect(toGoldenRow("verified_resource", draft)).toEqual({
      ok: true,
      row: {
        knowledge_type: "verified_resource",
        grade: "고2",
        subject: "물리학Ⅰ",
        career: null,
        selected_topic: "마찰력",
        assessment_info: null,
        note: null,
        expected_resource_ids: ["r1"],
      },
    });
  });

  test("학년, 과목, 기대 자료는 비울 수 없다", () => {
    expect(toGoldenRow("topic_pattern", { ...draft, grade: " " })).toEqual({
      ok: false,
      message: "학년을 입력하세요.",
    });
    expect(toGoldenRow("topic_pattern", { ...draft, subject: "" })).toEqual({
      ok: false,
      message: "과목을 입력하세요.",
    });
    expect(toGoldenRow("topic_pattern", { ...draft, expected: [] })).toEqual({
      ok: false,
      message: "기대 자료를 1개 이상 고르세요.",
    });
  });
});
