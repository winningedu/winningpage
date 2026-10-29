import { describe, expect, it } from "vitest";
import { resumeCtaFor } from "./resumeCta";

describe("resumeCtaFor", () => {
  it("설계 리포트만 있으면 이어서 작성하기", () => {
    expect(
      resumeCtaFor({
        design: { reportId: "d" },
        evaluation: null,
        final: null,
      }),
    ).toBe("이어서 작성하기");
  });

  it("평가 리포트까지 있고 최종 제출본이 없으면 최종 제출본 작성하기", () => {
    expect(
      resumeCtaFor({
        design: { reportId: "d" },
        evaluation: { reportId: "e" },
        final: null,
      }),
    ).toBe("최종 제출본 작성하기");
  });

  it("최종 제출본까지 있으면 CTA 없음", () => {
    expect(
      resumeCtaFor({
        design: { reportId: "d" },
        evaluation: { reportId: "e" },
        final: { reportId: "f" },
      }),
    ).toBeNull();
  });
});
