// 작성본 글자 수, 자리표시자, 평가 전 검사 테스트(명세 No.71, 72, 77, 78, 129).
import { describe, expect, it } from "vitest";
import { MIN_SUBMISSION_CHARS } from "./constants.js";
import {
  checkSubmissionForEvaluation,
  countChars,
  countPlaceholders,
  emptySections,
  normalizeSections,
  PLACEHOLDER_RE,
  shortageOf,
  stripPlaceholders,
  totalForMinimum,
} from "./submission.js";
import type { SubmissionSections } from "./types.js";

const empty: SubmissionSections = {
  I: "",
  II: "",
  III: "",
  IV: "",
  V: "",
  VI: "",
  VII: "",
  VIII: "",
};
const filled = (
  over: Partial<SubmissionSections> = {},
): SubmissionSections => ({
  I: "가".repeat(50),
  II: "가".repeat(50),
  III: "가".repeat(50),
  IV: "가".repeat(50),
  V: "가".repeat(50),
  VI: "가".repeat(50),
  VII: "가".repeat(50),
  VIII: "출처 한 줄",
  ...over,
});

describe("countChars (No.77)", () => {
  it("공백을 포함해 세되 양끝 공백은 뺀다", () => {
    const counts = countChars({ ...empty, I: "  가 나\n다  ", II: "   " });
    expect(counts.I).toBe(5);
    expect(counts.II).toBe(0);
    expect(counts.VIII).toBe(0);
    expect(Object.keys(counts)).toHaveLength(8);
  });
});

describe("totalForMinimum (No.77)", () => {
  it("Ⅰ~Ⅶ 합만 더하고 Ⅷ 은 뺀다", () => {
    const counts = countChars(filled({ VIII: "가".repeat(999) }));
    expect(totalForMinimum(counts)).toBe(350);
  });
});

describe("shortageOf (No.72)", () => {
  it("권장 분량보다 모자란 만큼을 돌려주고 넘으면 0", () => {
    expect(shortageOf("I", 100)).toBe(200);
    expect(shortageOf("I", 300)).toBe(0);
    expect(shortageOf("I", 500)).toBe(0);
  });

  it("권장 분량이 없는 Ⅷ 은 null", () => {
    expect(shortageOf("VIII", 0)).toBeNull();
  });
});

describe("emptySections (No.71)", () => {
  it("공백뿐인 절까지 8절 전부를 검사한다", () => {
    expect(emptySections({ ...filled(), III: "  \n ", VIII: "" })).toEqual([
      "III",
      "VIII",
    ]);
    expect(emptySections(filled())).toEqual([]);
    expect(emptySections(empty)).toHaveLength(8);
  });
});

describe("자리표시자 (No.78)", () => {
  it("대괄호 사이 1~40자만 자리표시자로 본다", () => {
    const text = `[a] [] [${"x".repeat(40)}] [${"x".repeat(41)}]`;
    expect(text.match(PLACEHOLDER_RE)).toHaveLength(2);
  });

  it("줄바꿈이 낀 대괄호는 자리표시자가 아니다", () => {
    expect("[앞\n뒤]".match(PLACEHOLDER_RE)).toBeNull();
  });

  it("절별 개수를 세고 0인 절은 키가 없다", () => {
    const result = countPlaceholders({
      ...filled(),
      I: "[동기를 쓰세요] 본문 [여기에 입력]",
      IV: "[값]",
    });
    expect(result).toEqual({ I: 2, IV: 1 });
    expect(countPlaceholders(filled())).toEqual({});
  });

  it("stripPlaceholders 는 사본에서 자리표시자만 지우고 원본은 그대로", () => {
    const original = { ...filled(), I: "앞 [채울 곳] 뒤" };
    const stripped = stripPlaceholders(original);
    expect(stripped.I).toBe("앞  뒤");
    expect(original.I).toBe("앞 [채울 곳] 뒤");
    expect(stripped.II).toBe(original.II);
  });

  it("같은 정규식으로 여러 번 세도 결과가 흔들리지 않는다", () => {
    const sections = { ...filled(), I: "[a][b]" };
    expect(countPlaceholders(sections)).toEqual(countPlaceholders(sections));
  });
});

describe("checkSubmissionForEvaluation (No.71, 77, 78)", () => {
  it("빈 절이 있으면 SECTION_EMPTY 를 먼저 돌려준다", () => {
    expect(checkSubmissionForEvaluation({ ...empty })).toEqual({
      ok: false,
      code: "SECTION_EMPTY",
      sections: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"],
    });
  });

  it("Ⅷ 만 비어도 SECTION_EMPTY", () => {
    expect(checkSubmissionForEvaluation(filled({ VIII: " " }))).toEqual({
      ok: false,
      code: "SECTION_EMPTY",
      sections: ["VIII"],
    });
  });

  it("Ⅰ~Ⅶ 합계가 300자 미만이면 SUBMISSION_TOO_SHORT", () => {
    const short = filled({
      I: "가".repeat(10),
      II: "가".repeat(10),
      III: "가".repeat(10),
      IV: "가".repeat(10),
      V: "가".repeat(10),
      VI: "가".repeat(10),
      VII: "가".repeat(10),
    });
    expect(checkSubmissionForEvaluation(short)).toEqual({
      ok: false,
      code: "SUBMISSION_TOO_SHORT",
      total: 70,
    });
  });

  it("정확히 300자면 통과하고 글자 수와 자리표시자 개수를 함께 돌려준다", () => {
    const ok = checkSubmissionForEvaluation(
      filled({ VI: "가".repeat(25), VII: `[후속]${"가".repeat(25)}` }),
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(totalForMinimum(ok.strippedCounts)).toBe(MIN_SUBMISSION_CHARS);
      expect(ok.placeholders).toEqual({ VII: 1 });
    }
  });

  it("자리표시자로 채운 300자는 SUBMISSION_TOO_SHORT", () => {
    const placeholder = `[${"가".repeat(38)}]`;
    const padded = filled({
      I: `${"가".repeat(10)}${placeholder}`,
      II: `${"가".repeat(10)}${placeholder}`,
      III: `${"가".repeat(10)}${placeholder}`,
      IV: `${"가".repeat(10)}${placeholder}`,
      V: `${"가".repeat(10)}${placeholder}`,
      VI: `${"가".repeat(10)}${placeholder}`,
      VII: `${"가".repeat(10)}${placeholder}`,
    });
    expect(totalForMinimum(countChars(padded))).toBeGreaterThanOrEqual(300);
    expect(checkSubmissionForEvaluation(padded)).toEqual({
      ok: false,
      code: "SUBMISSION_TOO_SHORT",
      total: 70,
    });
  });

  it("자리표시자만 있는 절은 빈 절로 본다", () => {
    expect(
      checkSubmissionForEvaluation(filled({ III: "[방법을 쓰세요]" })),
    ).toEqual({ ok: false, code: "SECTION_EMPTY", sections: ["III"] });
  });

  it("통과하면 원문 counts 와 자리표시자를 뺀 strippedCounts 를 함께 돌려준다", () => {
    const result = checkSubmissionForEvaluation(
      filled({ VII: `[후속]${"가".repeat(50)}` }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.counts.VII).toBe(54);
      expect(result.strippedCounts.VII).toBe(50);
      expect(result.placeholders).toEqual({ VII: 1 });
    }
  });

  it("299자는 통과하지 못한다", () => {
    const result = checkSubmissionForEvaluation(
      filled({ VI: "가".repeat(25), VII: "가".repeat(24) }),
    );
    expect(result).toMatchObject({
      ok: false,
      code: "SUBMISSION_TOO_SHORT",
      total: MIN_SUBMISSION_CHARS - 1,
    });
  });
});

describe("normalizeSections (No.129)", () => {
  it("객체가 아니면 null", () => {
    expect(normalizeSections(null)).toBeNull();
    expect(normalizeSections(undefined)).toBeNull();
    expect(normalizeSections("text")).toBeNull();
    expect(normalizeSections(3)).toBeNull();
    expect(normalizeSections([])).toBeNull();
  });

  it("없는 키는 빈 문자열로 채우고 모르는 키는 버린다", () => {
    expect(normalizeSections({ I: "가", extra: "x" })).toEqual({
      ...empty,
      I: "가",
    });
    expect(normalizeSections({})).toEqual(empty);
  });

  it("값이 문자열이 아닌 키가 하나라도 있으면 null", () => {
    expect(normalizeSections({ ...empty, II: 3 })).toBeNull();
    expect(normalizeSections({ ...empty, III: null })).toBeNull();
    expect(normalizeSections({ ...empty, IV: ["a"] })).toBeNull();
  });
});
