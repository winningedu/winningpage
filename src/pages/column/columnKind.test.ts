import { describe, expect, it } from "vitest";
import { COLUMN_KINDS, getColumnKind } from "./columnKind";

describe("getColumnKind", () => {
  it.each([
    "https://www.youtube.com/watch?v=abcDEF12345",
    "https://youtu.be/abcDEF12345",
    "https://youtube.com/shorts/abcDEF12345",
    "https://www.youtube.com/embed/abcDEF12345",
  ])("%s 는 영상이다", (link_url) => {
    expect(getColumnKind({ link_url })).toBe("영상");
  });

  it.each([
    "https://blog.naver.com/x",
    "https://youtu.be/abc",
    "",
    null,
    undefined,
  ])("%j 는 칼럼이다", (link_url) => {
    expect(getColumnKind({ link_url })).toBe("칼럼");
  });

  it("유형 목록은 영상, 칼럼이다", () => {
    expect([...COLUMN_KINDS]).toEqual(["영상", "칼럼"]);
  });
});
