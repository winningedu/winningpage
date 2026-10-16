import { describe, expect, it } from "vitest";
import { runFormatChecks } from "./format.js";
import type { Sentence } from "./types.js";

const sentence = (over: Partial<Sentence> = {}): Sentence => ({
  id: "s1",
  text: "문장이다.",
  evidence: null,
  feeling: false,
  confirmed: false,
  ...over,
});

// 공백 제외 100자짜리 문장 한 줄
const hundred = `${"가".repeat(99)}.`;

function run(over: Partial<Parameters<typeof runFormatChecks>[0]> = {}) {
  const text = over.text ?? `${hundred} ${hundred} ${hundred} ${hundred}`;
  return runFormatChecks({
    text,
    targetChars: 400,
    mode: "without_space",
    universities: [],
    sentences: [],
    ...over,
  });
}

const byKey = (checks: ReturnType<typeof run>, key: string) => {
  const c = checks.find((x) => x.key === key);
  if (!c) throw new Error(key);
  return c;
};

describe("runFormatChecks", () => {
  it("여섯 항목을 정해진 순서로 돌려준다", () => {
    expect(run().map((c) => c.key)).toEqual([
      "target_range",
      "cliche_density",
      "min_length",
      "min_sentences",
      "no_university",
      "no_pending_feelings",
    ]);
  });

  it("전부 기준을 채우면 전부 통과한다", () => {
    expect(run().every((c) => c.pass)).toBe(true);
  });

  it("목표 글자 수 5% 이내면 통과, 넘으면 실패하고 차이를 적는다", () => {
    const ok = run({ targetChars: 410 });
    expect(byKey(ok, "target_range").pass).toBe(true);
    const bad = run({ targetChars: 500 });
    const c = byKey(bad, "target_range");
    expect(c.pass).toBe(false);
    expect(c.skipped).toBe(false);
    expect(c.detail).toContain("400");
    expect(c.detail).toContain("500");
    expect(c.detail).toContain("-100");
  });

  it("목표가 null 이면 분량 판정을 끄고 통과로 둔다", () => {
    const c = byKey(run({ targetChars: null }), "target_range");
    expect(c.pass).toBe(true);
    expect(c.skipped).toBe(true);
    expect(c.detail).toBe("목표 글자 수를 비워 분량 판정을 껐어요");
  });

  it("상투어 밀도 2.0 이상이면 실패한다", () => {
    const text = `${"가".repeat(396)}. 성실 성실 성실. 나다. 라다.`;
    const c = byKey(run({ text, targetChars: null }), "cliche_density");
    expect(c.pass).toBe(false);
    expect(c.detail).toContain("2");
  });

  it("최소 분량은 400자, 목표가 400 미만이면 목표의 80% 로 낮춘다", () => {
    const short = `${"가".repeat(299)}. 나다. 다다. 라다.`;
    const lowTarget = run({ text: short, targetChars: 300 });
    expect(byKey(lowTarget, "min_length").pass).toBe(true);
    const noTarget = run({ text: short, targetChars: null });
    expect(byKey(noTarget, "min_length").pass).toBe(false);
  });

  it("문장이 네 개 미만이면 실패한다", () => {
    const text = `${"가".repeat(200)}. ${"나".repeat(200)}. ${"다".repeat(200)}.`;
    const c = byKey(run({ text, targetChars: null }), "min_sentences");
    expect(c.pass).toBe(false);
    expect(c.detail).toContain("3");
  });

  it("대학 이름이 본문에 있으면 실패하고 이름을 적는다", () => {
    const text = `${hundred} ${hundred} ${hundred} 연세대에 가고 싶다.`;
    const c = byKey(
      run({ text, targetChars: null, universities: ["연세대학교"] }),
      "no_university",
    );
    expect(c.pass).toBe(false);
    expect(c.detail).toContain("연세대학교");
  });

  it("확인하지 않은 느낌 문장이 남아 있으면 실패한다", () => {
    const pending = run({
      sentences: [sentence({ feeling: true, confirmed: false })],
    });
    const c = byKey(pending, "no_pending_feelings");
    expect(c.pass).toBe(false);
    expect(c.detail).toContain("1");
    const done = run({
      sentences: [sentence({ feeling: true, confirmed: true })],
    });
    expect(byKey(done, "no_pending_feelings").pass).toBe(true);
  });
});
