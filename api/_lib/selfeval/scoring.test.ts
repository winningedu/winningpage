import { describe, expect, it } from "vitest";
import { SCORE_RUBRIC } from "./dictionaries.js";
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
];

describe("mandatoryFixes", () => {
  it("문제가 없으면 비어 있고 제출 가능이다", () => {
    const fixes = mandatoryFixes({
      items: scoreItems(checks()),
      format: allPass(),
      clicheHits: [],
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

  it("판단 확인 2개 중 1개만 통과하면 13점이라 필수 수정이다", () => {
    const ok = mandatoryFixes({
      items: scoreItems(checks({ judgment: [true, false] })),
      format: allPass(),
      clicheHits: [],
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
    expect(v.format).toHaveLength(6);
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
