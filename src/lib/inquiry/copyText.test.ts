import { describe, expect, it } from "vitest";
import { submissionCopyText } from "./copyText";
import type { SubmissionSections } from "./types";

const FULL: SubmissionSections = {
  I: "동기 본문",
  II: "질문 본문",
  III: "방법 본문",
  IV: "결과 본문",
  V: "해석 본문",
  VI: "한계 본문",
  VII: "후속 본문",
  VIII: "자료 본문",
};

describe("submissionCopyText", () => {
  it("8절을 Ⅰ부터 Ⅷ까지 절 제목과 본문 순서로 빈 줄로 이어 붙인다", () => {
    const text = submissionCopyText(FULL);
    expect(text).toBe(
      [
        "Ⅰ 탐구 동기",
        "동기 본문",
        "Ⅱ 탐구 질문과 가설",
        "질문 본문",
        "Ⅲ 탐구 방법",
        "방법 본문",
        "Ⅳ 탐구 결과",
        "결과 본문",
        "Ⅴ 해석",
        "해석 본문",
        "Ⅵ 한계",
        "한계 본문",
        "Ⅶ 후속 탐구",
        "후속 본문",
        "Ⅷ 참고 자료",
        "자료 본문",
      ].join("\n\n"),
    );
  });

  it("본문이 비어 있는 절은 제목째 뺀다", () => {
    const text = submissionCopyText({ ...FULL, VIII: "  " });
    expect(text).not.toContain("참고 자료");
    expect(text.endsWith("후속 본문")).toBe(true);
  });

  it("모든 절이 비어 있으면 빈 글을 돌려준다", () => {
    const empty = Object.fromEntries(
      Object.keys(FULL).map((k) => [k, ""]),
    ) as SubmissionSections;
    expect(submissionCopyText(empty)).toBe("");
  });
});
