import { describe, expect, test } from "vitest";
import { ORG_TYPE_OPTIONS } from "./tenantOptions";

describe("ORG_TYPE_OPTIONS", () => {
  test("학원은 학교 바로 뒤에 있다", () => {
    expect(ORG_TYPE_OPTIONS).toEqual([
      "기관",
      "사기업",
      "학교",
      "학원",
      "캠퍼스",
      "기타",
    ]);
  });
});
