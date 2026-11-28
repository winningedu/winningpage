import { describe, expect, test } from "vitest";
import { runsQuery } from "./contract.js";

describe("runsQuery", () => {
  test("view=runs 만 있으면 지식 유형 없이 통과한다", () => {
    expect(runsQuery.parse({ view: "runs" })).toEqual({ view: "runs" });
    expect(runsQuery.parse({ view: "runs", knowledgeType: "" })).toEqual({
      view: "runs",
      knowledgeType: undefined,
    });
  });

  test("지식 유형을 읽는다", () => {
    expect(
      runsQuery.parse({ view: "runs", knowledgeType: "verified_resource" })
        .knowledgeType,
    ).toBe("verified_resource");
  });

  test("view 가 runs 가 아니거나 지식 유형이 틀리면 사유와 함께 거절한다", () => {
    expect(
      runsQuery
        .safeParse({ view: "calls" })
        .error?.issues.map((i) => i.message),
    ).toEqual(["view 는 runs 입니다."]);
    expect(
      runsQuery
        .safeParse({ view: "runs", knowledgeType: "x" })
        .error?.issues.map((i) => i.message),
    ).toEqual(["knowledgeType 이 올바르지 않습니다."]);
  });
});
