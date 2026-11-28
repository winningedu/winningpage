import { describe, expect, test } from "vitest";
import { evalRequestBody, SWEEP_MAX_COMBOS } from "./request.js";

const message = (raw: unknown) =>
  evalRequestBody.safeParse(raw).error?.issues[0]?.message;

describe("evalRequestBody run", () => {
  test("지식 유형, 모드, 덮어쓸 값, 메모를 읽는다", () => {
    expect(
      evalRequestBody.parse({
        action: "run",
        knowledgeType: "topic_pattern",
        mode: "vector",
        params: { rrfK: 30 },
        note: " 첫 측정 ",
      }),
    ).toEqual({
      action: "run",
      knowledgeType: "topic_pattern",
      mode: "vector",
      params: { rrfK: 30 },
      note: "첫 측정",
    });
  });

  test("mode 기본값은 hybrid, 메모가 없거나 비면 null, 덮어쓸 값이 없으면 빈 객체다", () => {
    const expected = {
      action: "run",
      knowledgeType: "verified_resource",
      mode: "hybrid",
      params: {},
      note: null,
    };

    expect(
      evalRequestBody.parse({
        action: "run",
        knowledgeType: "verified_resource",
      }),
    ).toEqual(expected);
    expect(
      evalRequestBody.parse({
        action: "run",
        knowledgeType: "verified_resource",
        mode: null,
        params: null,
        note: "   ",
      }),
    ).toEqual(expected);
  });

  test("메모는 500자에서 자른다", () => {
    const parsed = evalRequestBody.parse({
      action: "run",
      knowledgeType: "topic_pattern",
      note: "가".repeat(600),
    });

    expect(parsed.note).toHaveLength(500);
  });

  test("null 과 빈 문자열인 값은 운영값을 쓰도록 빼고 경계값은 받는다", () => {
    expect(
      evalRequestBody.parse({
        action: "run",
        knowledgeType: "topic_pattern",
        params: {
          rrfK: 20,
          semanticWeight: 2.5,
          matchThreshold: null,
          matchCount: "",
        },
      }),
    ).toMatchObject({ params: { rrfK: 20, semanticWeight: 2.5 } });

    const edge = {
      matchThreshold: 0,
      rrfK: 200,
      fullTextWeight: 0,
      semanticWeight: 5,
      matchCount: 20,
    };
    expect(
      evalRequestBody.parse({
        action: "run",
        knowledgeType: "topic_pattern",
        params: edge,
      }),
    ).toMatchObject({ params: edge });
  });

  test.each([
    [
      { matchThreshold: -0.1 },
      "matchThreshold 는 0부터 1 사이 숫자여야 합니다.",
    ],
    [
      { matchThreshold: 1.1 },
      "matchThreshold 는 0부터 1 사이 숫자여야 합니다.",
    ],
    [
      { matchThreshold: "0.5" },
      "matchThreshold 는 0부터 1 사이 숫자여야 합니다.",
    ],
    [{ rrfK: 0 }, "rrfK 는 1부터 200 사이 정수여야 합니다."],
    [{ rrfK: 201 }, "rrfK 는 1부터 200 사이 정수여야 합니다."],
    [{ rrfK: 10.5 }, "rrfK 는 1부터 200 사이 정수여야 합니다."],
    [
      { fullTextWeight: 5.1 },
      "fullTextWeight 는 0부터 5 사이 숫자여야 합니다.",
    ],
    [{ semanticWeight: -1 }, "semanticWeight 는 0부터 5 사이 숫자여야 합니다."],
    [{ matchCount: 0 }, "matchCount 는 1부터 20 사이 정수여야 합니다."],
    [{ matchCount: 21 }, "matchCount 는 1부터 20 사이 정수여야 합니다."],
    [{ matchCount: 3.5 }, "matchCount 는 1부터 20 사이 정수여야 합니다."],
    [3, "params 는 객체여야 합니다."],
  ])("덮어쓸 값 %o 는 '%s' 로 거른다", (params, expected) => {
    expect(
      message({ action: "run", knowledgeType: "topic_pattern", params }),
    ).toBe(expected);
  });

  test.each([
    [null, "요청 바디가 올바르지 않습니다."],
    [[], "요청 바디가 올바르지 않습니다."],
    ["x", "요청 바디가 올바르지 않습니다."],
    [{}, "action 은 run 또는 sweep 입니다."],
    [
      { action: "delete", knowledgeType: "topic_pattern" },
      "action 은 run 또는 sweep 입니다.",
    ],
    [{ action: "run" }, "knowledgeType 이 올바르지 않습니다."],
    [
      { action: "run", knowledgeType: "x" },
      "knowledgeType 이 올바르지 않습니다.",
    ],
    [
      { action: "run", knowledgeType: "topic_pattern", note: 3 },
      "note 는 문자열이어야 합니다.",
    ],
    [
      { action: "run", knowledgeType: "topic_pattern", mode: "bm25" },
      "mode 는 vector 또는 hybrid 입니다.",
    ],
  ])("잘못된 요청 %o 는 '%s' 로 거른다", (raw, expected) => {
    expect(message(raw)).toBe(expected);
  });

  test("지식 유형 오류가 note, mode, params 오류보다 먼저다", () => {
    expect(
      message({
        action: "run",
        knowledgeType: "x",
        note: 3,
        mode: "bm25",
        params: { rrfK: 0 },
      }),
    ).toBe("knowledgeType 이 올바르지 않습니다.");
    expect(
      message({
        action: "run",
        knowledgeType: "topic_pattern",
        note: 3,
        mode: "bm25",
        params: { rrfK: 0 },
      }),
    ).toBe("note 는 문자열이어야 합니다.");
  });
});

describe("evalRequestBody sweep", () => {
  const sweep = (grid: unknown) => ({
    action: "sweep",
    knowledgeType: "topic_pattern",
    grid,
  });

  test("축 목록을 읽고 빈 축과 없는 축은 빈 목록으로 둔다", () => {
    expect(
      evalRequestBody.parse(
        sweep({
          rrfK: [20, 60],
          weights: [{ fullText: 0.5, semantic: 1.5 }],
          matchThreshold: null,
        }),
      ),
    ).toEqual({
      action: "sweep",
      knowledgeType: "topic_pattern",
      grid: {
        rrfK: [20, 60],
        weights: [{ fullText: 0.5, semantic: 1.5 }],
        matchThreshold: [],
      },
      note: null,
    });
    expect(evalRequestBody.parse(sweep({}))).toMatchObject({
      grid: { rrfK: [], weights: [], matchThreshold: [] },
    });
  });

  test("조합이 상한 24개까지는 받고 넘으면 개수를 알린다", () => {
    expect(SWEEP_MAX_COMBOS).toBe(24);
    const grid = (rrfK: number[]) => ({
      rrfK,
      weights: [
        { fullText: 1, semantic: 1 },
        { fullText: 2, semantic: 1 },
      ],
      matchThreshold: [0.4, 0.5],
    });

    expect(
      evalRequestBody.safeParse(sweep(grid([10, 20, 30, 40, 50, 60]))).success,
    ).toBe(true);
    expect(message(sweep(grid([10, 20, 30, 40, 50, 60, 70])))).toBe(
      "조합은 24개까지입니다. 지금 28개입니다.",
    );
  });

  test.each([
    [{ rrfK: [0] }, "rrfK 는 1부터 200 사이 정수여야 합니다."],
    [
      { matchThreshold: [1.5] },
      "matchThreshold 는 0부터 1 사이 숫자여야 합니다.",
    ],
    [
      { weights: [{ fullText: 6, semantic: 1 }] },
      "fullTextWeight 는 0부터 5 사이 숫자여야 합니다.",
    ],
    [
      { weights: [{ fullText: 1, semantic: -1 }] },
      "semanticWeight 는 0부터 5 사이 숫자여야 합니다.",
    ],
    // 첫 조합부터 matchThreshold, rrfK, fullTextWeight, semanticWeight 순으로 본다.
    [
      { rrfK: [0], matchThreshold: [2] },
      "matchThreshold 는 0부터 1 사이 숫자여야 합니다.",
    ],
    // 조합 순서는 rrfK, 가중치 쌍, threshold 이므로 뒤 조합의 오류는 앞 조합이 통과한 뒤에 나온다.
    [
      { rrfK: [10, 0], matchThreshold: [2, 0.5] },
      "matchThreshold 는 0부터 1 사이 숫자여야 합니다.",
    ],
  ])("범위를 벗어난 grid %o 는 '%s' 로 거른다", (grid, expected) => {
    expect(message(sweep(grid))).toBe(expected);
  });

  test.each([[undefined], [null], [[]], ["x"]])(
    "grid %j 가 객체가 아니면 거른다",
    (grid) => {
      expect(message(sweep(grid))).toBe("grid 는 객체여야 합니다.");
    },
  );

  test.each([
    [{ rrfK: 3 }],
    [{ rrfK: ["3"] }],
    [{ matchThreshold: "0.5" }],
    [{ weights: [{ fullText: 1 }] }],
    [{ weights: [3] }],
    [{ weights: {} }],
  ])("grid 모양 %o 이 틀리면 형식을 알린다", (grid) => {
    expect(message(sweep(grid))).toBe(
      "grid 는 rrfK 숫자 목록, weights 가중치 쌍 목록, matchThreshold 숫자 목록입니다.",
    );
  });

  test("note 오류가 grid 오류보다 먼저다", () => {
    expect(message({ ...sweep(undefined), note: 3 })).toBe(
      "note 는 문자열이어야 합니다.",
    );
  });
});
