import { describe, expect, it } from "vitest";
import { IMPROVEMENT_HINTS, SCORE_RUBRIC } from "./dictionaries.js";
import {
  assembleVerification,
  improvements,
  isSubmittable,
  mandatoryFixes,
  scoreItems,
  totalScore,
} from "./scoring.js";
import type { FormatCheck, ScoreCheck, ScoreItemKey } from "./types.js";

const KEYS = SCORE_RUBRIC.map((r) => r.key);

function checks(passes: Partial<Record<ScoreItemKey, boolean[]>> = {}) {
  const out = {} as Record<ScoreItemKey, ScoreCheck[]>;
  for (const row of SCORE_RUBRIC) {
    const given = passes[row.key] ?? row.checks.map(() => true);
    out[row.key] = row.checks.map((text, i) => ({
      text,
      pass: given[i] ?? false,
    }));
  }
  return out;
}

describe("scoreItems", () => {
  it("채점표 순서대로 배점과 판별력을 붙이고 전부 통과하면 만점이다", () => {
    const items = scoreItems(checks());
    expect(items.map((i) => i.key)).toEqual(KEYS);
    expect(items[0]).toMatchObject({
      key: "judgment",
      label: "판단",
      max: 25,
      discrimination: 70,
      score: 25,
    });
    expect(items[7]?.discrimination).toBeNull();
    expect(totalScore(items)).toBe(100);
  });

  it("점수는 배점 곱하기 통과 비율을 반올림한다", () => {
    const items = scoreItems(
      checks({ judgment: [true, false], next: [false, false] }),
    );
    expect(items[0]?.score).toBe(13); // 25 * 1/2 = 12.5 -> 13
    expect(items[6]?.score).toBe(0);
    expect(totalScore(items)).toBe(100 - 12 - 5);
  });

  it("확인 문장이 없으면 0점이다", () => {
    const empty = checks();
    empty.link = [];
    expect(scoreItems(empty)[2]?.score).toBe(0);
  });
});

function fmt(key: FormatCheck["key"], pass: boolean, detail = ""): FormatCheck {
  return { key, label: key, pass, detail, skipped: false };
}
const allPass = (): FormatCheck[] => [
  fmt("target_range", true),
  fmt("cliche_density", true),
  fmt("min_length", true),
  fmt("min_sentences", true),
  fmt("no_university", true),
  fmt("no_pending_feelings", true),
  fmt("no_plan_expression", true),
];

describe("mandatoryFixes", () => {
  it("문제가 없으면 비어 있고 제출 가능이다", () => {
    const fixes = mandatoryFixes({
      items: scoreItems(checks()),
      format: allPass(),
      clicheHits: [],
      planHits: [],
    });
    expect(fixes).toEqual([]);
    expect(isSubmittable(fixes)).toBe(true);
  });

  it("확인 필요 잔존, 상투어 초과, 판단 15점 미만 순서로 모은다", () => {
    const format = allPass();
    format[1] = fmt("cliche_density", false);
    format[5] = fmt("no_pending_feelings", false);
    const fixes = mandatoryFixes({
      items: scoreItems(checks({ judgment: [false, false] })),
      format,
      clicheHits: ["성실", "탁월", "성실"],
      planHits: [],
    });
    expect(fixes.map((f) => f.key)).toEqual([
      "pending_feelings",
      "cliche",
      "judgment_low",
    ]);
    expect(fixes[1]?.detail).toContain("성실");
    expect(fixes[1]?.detail).toContain("탁월");
    expect(isSubmittable(fixes)).toBe(false);
  });

  it("계획 표현이 남아 있으면 plan_expression 이 마지막에 붙고 찾은 표현이 detail 이다", () => {
    const format = allPass();
    format[6] = fmt("no_plan_expression", false);
    const fixes = mandatoryFixes({
      items: scoreItems(checks({ judgment: [false, false] })),
      format,
      clicheHits: [],
      planHits: ["계획임", "할 예정"],
    });
    expect(fixes.map((f) => f.key)).toEqual([
      "judgment_low",
      "plan_expression",
    ]);
    const plan = fixes[1];
    expect(plan?.message).toBe(
      "계획 표현이 남아 있어요. 실제로 한 일만 쓰고 계획 문장은 지워 주세요",
    );
    expect(plan?.detail).toBe("계획임, 할 예정");
    expect(isSubmittable(fixes)).toBe(false);
  });

  it("판단 확인 2개 중 1개만 통과하면 13점이라 필수 수정이다", () => {
    const ok = mandatoryFixes({
      items: scoreItems(checks({ judgment: [true, false] })),
      format: allPass(),
      clicheHits: [],
      planHits: [],
    });
    expect(ok.map((f) => f.key)).toEqual(["judgment_low"]);
  });
});

describe("improvements", () => {
  it("비율이 낮은 순서로 최대 3개, 동률은 배점이 큰 순서다", () => {
    const items = scoreItems(
      checks({
        judgment: [false, false], // 0
        limitation: [false, false], // 0
        next: [false, false], // 0
        source: [true, false], // 0.5
      }),
    );
    const list = improvements(items);
    expect(list.map((i) => i.key)).toEqual(["judgment", "limitation", "next"]);
    expect(list[0]?.failedChecks).toEqual([
      "그 자료, 결과로 무엇을 판단했는지가 문장으로 있는가",
      "판단 근거가 되는 구체적 자료가 함께 제시되는가",
    ]);
    expect(list[0]?.message.length).toBeGreaterThan(0);
  });

  it("만점 항목은 넣지 않는다", () => {
    expect(improvements(scoreItems(checks()))).toEqual([]);
  });
});

describe("문항 없음 채점", () => {
  const noPrompt = (passes: Partial<Record<ScoreItemKey, boolean[]>> = {}) => ({
    ...checks(passes),
    prompt: [] as ScoreCheck[],
  });

  it("문항 대응은 적용하지 않고 0점, 배점 10 은 표시용으로 남긴다", () => {
    const prompt = scoreItems(noPrompt(), { promptMissing: true }).find(
      (i) => i.key === "prompt",
    );
    expect(prompt).toMatchObject({
      applied: false,
      score: 0,
      max: 10,
      checks: [],
    });
  });

  it("나머지 7항목 만점이면 100점이다", () => {
    const items = scoreItems(noPrompt(), { promptMissing: true });
    expect(totalScore(items)).toBe(100);
  });

  it("나머지 90점을 100점으로 환산해 반올림한다", () => {
    // judgment 25 * 1/2 = 13 이라 나머지 합 78, 78 * 100 / 90 = 86.67
    const items = scoreItems(noPrompt({ judgment: [true, false] }), {
      promptMissing: true,
    });
    expect(totalScore(items)).toBe(87);
  });

  it("고치면 좋은 곳에 문항 대응을 넣지 않는다", () => {
    const items = scoreItems(noPrompt({ judgment: [false, false] }), {
      promptMissing: true,
    });
    expect(improvements(items).map((i) => i.key)).not.toContain("prompt");
  });

  it("문항이 없으면 모델이 문항 확인 문장을 채워도 점수에 넣지 않는다", () => {
    const items = scoreItems(checks(), { promptMissing: true });
    expect(items.find((i) => i.key === "prompt")).toMatchObject({
      applied: false,
      score: 0,
      checks: [],
    });
  });

  it("판단 필수 수정은 환산 전 판단 점수로 가른다", () => {
    const items = scoreItems(noPrompt({ judgment: [true, false] }), {
      promptMissing: true,
    });
    const fixes = mandatoryFixes({ items, format: allPass(), clicheHits: [] });
    expect(fixes.map((f) => f.key)).toContain("judgment_low");
  });

  it("검증 결과에 promptMissing 을 싣고 총점을 환산한다", () => {
    const v = assembleVerification({
      checks: checks(),
      promptMissing: true,
      text: "가나다 2회 실험.",
      targetChars: null,
      mode: "without_space",
      universities: [],
      sentences: [],
      growthFit: null,
    });
    expect(v.promptMissing).toBe(true);
    expect(v.total).toBe(100);
    expect(v.improvements.map((i) => i.key)).not.toContain("prompt");
  });

  it("문항이 있으면 promptMissing 은 false 다", () => {
    const v = assembleVerification({
      checks: checks(),
      text: "가나다 2회 실험.",
      targetChars: null,
      mode: "without_space",
      universities: [],
      sentences: [],
      growthFit: null,
    });
    expect(v.promptMissing).toBe(false);
  });
});

describe("assembleVerification", () => {
  it("본문 수치와 점수, 형식, 필수 수정을 한 덩어리로 묶는다", () => {
    const text = `${"가".repeat(99)}. ${"나".repeat(99)}. ${"다".repeat(99)}. 성실한 ${"라".repeat(85)} 2회 실험.`;
    const v = assembleVerification({
      checks: checks(),
      text,
      targetChars: null,
      mode: "without_space",
      universities: [],
      sentences: [],
      growthFit: null,
    });
    expect(v.total).toBe(100);
    expect(v.items).toHaveLength(8);
    expect(v.format).toHaveLength(7);
    expect(v.sentenceCount).toBe(4);
    expect(v.clicheHits).toEqual(["성실"]);
    expect(v.numberCount).toBe(1);
    expect(v.excluded.map((e) => e.label)).toEqual([
      "협업과 나눔",
      "날짜 괄호 기재",
    ]);
    expect(v.growthFit).toBeNull();
    expect(v.charCount.withSpace).toBeGreaterThan(v.charCount.withoutSpace);
    expect(v.submittable).toBe(v.mandatoryFixes.length === 0);
  });
});

describe("후속 항목 문구(명세 No.53)", () => {
  it("확인 문장이 실제 후속 행동과 한계와 이어진 남은 질문이다", () => {
    const next = SCORE_RUBRIC.find((r) => r.key === "next");
    expect(next?.checks).toEqual([
      "결과나 한계에서 이어진 실제 후속 행동(기록 근거 있음)이 있는가",
      "남은 질문을 한계와 이어 한 구절로 지목했는가",
    ]);
  });

  it("고치면 좋은 곳 안내는 기록 근거가 있는 후속 행동과 한계에 이은 질문을 묻고 계획은 묻지 않는다", () => {
    const hint = IMPROVEMENT_HINTS.next;
    expect(hint).toContain("실제로 한 후속 행동");
    expect(hint).toContain("기록 근거");
    expect(hint).toContain("남은 질문");
    expect(hint).toContain("한계와 이어");
    expect(hint).not.toContain("다음에 확인하고 싶은");
  });
});
