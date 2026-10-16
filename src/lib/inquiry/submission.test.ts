import { describe, expect, test } from "vitest";
import * as serverConstants from "../../../api/_lib/inquiry/constants";
import * as server from "../../../api/_lib/inquiry/submission";
import * as client from "./submission";
import type { SubmissionSections } from "./types";

function sections(over: Partial<SubmissionSections> = {}): SubmissionSections {
  return {
    I: "",
    II: "",
    III: "",
    IV: "",
    V: "",
    VI: "",
    VII: "",
    VIII: "",
    ...over,
  };
}

const long = (n: number) => "가".repeat(n);

const SAMPLES: SubmissionSections[] = [
  sections(),
  sections({ I: "  앞뒤 공백  ", II: "[여기에 질문] 본문" }),
  sections({
    I: long(100),
    II: long(50),
    III: long(50),
    IV: long(50),
    V: long(30),
    VI: long(10),
    VII: long(9),
    VIII: "자료",
  }),
  sections({
    I: long(300),
    II: "[질문] [가설]",
    III: long(50),
    IV: long(50),
    V: long(30),
    VI: long(10),
    VII: long(10),
    VIII: "",
  }),
];

describe("서버 상수와 같은 값", () => {
  test("절 메타와 분량 기준", () => {
    expect(client.SECTIONS).toEqual(serverConstants.SECTIONS);
    expect(client.MIN_SUBMISSION_CHARS).toBe(
      serverConstants.MIN_SUBMISSION_CHARS,
    );
    expect(client.MIN_CHARS_SECTION_IDS).toEqual(
      serverConstants.MIN_CHARS_SECTION_IDS,
    );
  });
});

describe("서버 submission.ts 와 같은 입출력", () => {
  test.each(SAMPLES.map((s, i) => [i, s] as const))(
    "표본 %i 의 모든 함수 결과가 같다",
    (_i, s) => {
      expect(client.countChars(s)).toEqual(server.countChars(s));
      expect(client.countPlaceholders(s)).toEqual(server.countPlaceholders(s));
      expect(client.stripPlaceholders(s)).toEqual(server.stripPlaceholders(s));
      expect(client.emptySections(s)).toEqual(server.emptySections(s));
      expect(client.checkSubmissionForEvaluation(s)).toEqual(
        server.checkSubmissionForEvaluation(s),
      );
      const counts = server.countChars(s);
      expect(client.totalForMinimum(counts)).toBe(
        server.totalForMinimum(counts),
      );
      for (const id of client.SECTION_IDS) {
        expect(client.shortageOf(id, counts[id])).toBe(
          server.shortageOf(id, counts[id]),
        );
      }
    },
  );

  test("normalizeSections 가 같다", () => {
    for (const input of [null, [], "x", { I: 1 }, { I: "a" }, sections()]) {
      expect(client.normalizeSections(input)).toEqual(
        server.normalizeSections(input),
      );
    }
  });
});
