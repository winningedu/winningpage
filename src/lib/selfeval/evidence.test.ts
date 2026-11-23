import { describe, expect, it } from "vitest";
import { readBody } from "../../../api/_lib/selfeval/report/body";
import {
  chipLabel,
  circledNumber,
  evidenceCompletion,
  sentenceNumbers,
} from "./evidence";
import type { GenerationSections, Sentence } from "./types";

const ev = (over: Partial<Sentence["evidence"][number]> = {}) => ({
  sourceType: "P" as const,
  refId: "a1",
  item: "method" as const,
  weight: "main" as const,
  ...over,
});
const sentence = (id: string, over: Partial<Sentence> = {}): Sentence => ({
  id,
  text: "문장임.",
  evidence: [ev()],
  feeling: false,
  confirmed: false,
  ...over,
});

describe("circledNumber", () => {
  it("1부터 20까지는 동그라미 숫자, 그 뒤는 괄호 숫자다", () => {
    expect(circledNumber(1)).toBe("\u2460");
    expect(circledNumber(9)).toBe("\u2468");
    expect(circledNumber(20)).toBe("\u2473");
    expect(circledNumber(21)).toBe("(21)");
    expect(circledNumber(35)).toBe("(35)");
  });
});

describe("evidenceCompletion", () => {
  it("근거가 1개 이상이고 확인 필요가 아닌 문장만 연결된 것으로 센다", () => {
    const out = evidenceCompletion([
      sentence("s1"),
      sentence("s2", { evidence: [] }),
      sentence("s3", { feeling: true }),
      sentence("s4", { feeling: true, confirmed: true }),
    ]);
    expect(out).toEqual({ linked: 2, total: 4 });
  });

  it("문장이 없으면 0 대 0 이다", () => {
    expect(evidenceCompletion([])).toEqual({ linked: 0, total: 0 });
  });
});

describe("sentenceNumbers", () => {
  it("문단을 가로질러 본문 순서대로 1부터 매긴다", () => {
    const sections: GenerationSections = {
      paragraphs: [
        { sentences: [sentence("a"), sentence("b")] },
        { sentences: [sentence("c")] },
      ],
    };
    expect([...sentenceNumbers(sections)]).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("한 문장 글이 문장 나누기 규칙으로 둘로 갈리면 다음 번호를 건너뛴다", () => {
    const sections: GenerationSections = {
      paragraphs: [
        {
          sentences: [sentence("a", { text: "가함. 나함." }), sentence("b")],
        },
      ],
    };
    expect(sentenceNumbers(sections).get("b")).toBe(3);
  });
});

describe("sentenceNumbers and the report numbering", () => {
  it("결과 화면 번호와 리포트 본문 번호가 한 덩이에 두 문장이 든 본문에서도 같다", () => {
    const sections: GenerationSections = {
      paragraphs: [
        {
          sentences: [
            sentence("a", { text: "가함. 나함." }),
            sentence("b", { text: "다함." }),
          ],
        },
      ],
    };
    const screen = sentenceNumbers(sections);
    const report = readBody(sections, { records: [], memos: [] }).sentences;
    expect(report.map((s) => s.n)).toEqual([screen.get("a"), screen.get("b")]);
  });
});

describe("chipLabel", () => {
  it("출처 유형 글자와 짧은 이름을 붙인다", () => {
    expect(chipLabel(ev({ sourceType: "D", item: "result" }))).toBe(
      "D 결과와 근거",
    );
    expect(chipLabel(ev({ sourceType: "H", item: "action" }))).toBe("H 한 일");
    expect(
      chipLabel(ev({ sourceType: "S", refId: null, item: "student_input" })),
    ).toBe("S 학생 입력");
  });
});
