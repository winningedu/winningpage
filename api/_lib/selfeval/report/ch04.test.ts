import { describe, expect, it } from "vitest";
import { readBody } from "./body.js";
import { buildCh02 } from "./ch02.js";
import { buildCh04 } from "./ch04.js";
import { sampleInput } from "./sample.testkit.js";

function run(
  over: Parameters<typeof sampleInput>[0] = {},
  text: (id: string) => string | null = () => null,
) {
  const input = sampleInput(over);
  const body = readBody(input.bodySections, input);
  const ch02 = buildCh02(input, body, text);
  return buildCh04(input, body, ch02, text);
}

describe("buildCh04", () => {
  it("is absent when the student has no confirmed memo", () => {
    expect(run({ memos: [] })).toBeNull();
  });

  it("shows each memo with date, untouched text, linked sentences and the reflection rate 4 of 5", () => {
    const ch04 = run();
    expect(ch04?.rows.map((r) => r.tag)).toEqual([
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
    ]);
    expect(ch04?.rows[0]).toMatchObject({
      writtenOn: "2026.05.14",
      sentenceNumbers: [1],
      reflected: true,
    });
    expect(ch04?.rows[0]?.text).toBe(sampleInput().memos[0]?.text);
    expect(ch04?.rows[4]).toMatchObject({
      reflected: false,
      sentenceNumbers: [],
      reasonLabel: "문항과 관련 없음",
    });
    expect(ch04).toMatchObject({
      reflectedCount: 4,
      totalCount: 5,
      sentenceTotal: 9,
      sentenceNumbers: [1, 3, 6, 9],
    });
  });

  it("builds the summary from the code template and appends one composed sentence", () => {
    expect(run()?.summary).toBe(
      "수기 메모가 자기평가 9문장 중 4문장(①③⑥⑨)의 근거가 됐습니다",
    );
    expect(
      run({}, (id) =>
        id === "memoRate" ? "특히 H1과 H4는 동기와 실천을 보여 줍니다." : null,
      )?.summary,
    ).toBe(
      "수기 메모가 자기평가 9문장 중 4문장(①③⑥⑨)의 근거가 됐습니다. 특히 H1과 H4는 동기와 실천을 보여 줍니다.",
    );
  });

  it("takes the memo explanation and the unreflected reason from the composed text", () => {
    const ch04 = run({}, (id) =>
      id === "memo:H1"
        ? "계기가 된 기록입니다."
        : id === "memoReason:H5"
          ? "관련 없음."
          : null,
    );
    expect(ch04?.rows[0]?.explanation).toBe("계기가 된 기록입니다.");
    expect(ch04?.rows[4]?.explanation).toBe("관련 없음.");
  });
});
