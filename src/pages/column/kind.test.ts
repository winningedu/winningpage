import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ video: true }));

vi.mock("@/config/site", () => ({
  site: {
    get features() {
      return { columnVideo: state.video };
    },
  },
}));

import { COLUMN_KINDS, getColumnKind, getVideoId } from "./kind";

beforeEach(() => {
  state.video = true;
});

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

  it("영상 기능이 꺼진 사이트(위닝)에서는 유튜브 연결주소도 칼럼이다", () => {
    state.video = false;
    expect(getColumnKind({ link_url: "https://youtu.be/abcDEF12345" })).toBe(
      "칼럼",
    );
  });
});

describe("getVideoId", () => {
  it("영상 기능이 켜진 사이트(스쿨멘토)에서는 유튜브 영상 ID를 돌려준다", () => {
    expect(
      getVideoId({ link_url: "https://www.youtube.com/watch?v=abcDEF12345" }),
    ).toBe("abcDEF12345");
  });

  it("영상 기능이 꺼진 사이트(위닝)에서는 null이다", () => {
    state.video = false;
    expect(
      getVideoId({ link_url: "https://www.youtube.com/watch?v=abcDEF12345" }),
    ).toBeNull();
  });

  it("유튜브 주소가 아니거나 문자열이 아니면 null이다", () => {
    expect(getVideoId({ link_url: "https://blog.naver.com/x" })).toBeNull();
    expect(getVideoId({ link_url: null })).toBeNull();
    expect(getVideoId({})).toBeNull();
  });
});
