import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ video: false }));

vi.mock("@/config/site", () => ({
  site: {
    get features() {
      return { columnVideo: state.video };
    },
  },
}));

import { boardConfigs } from "./board";

type GalleriesConfig = {
  validate?: (form: Record<string, unknown>) => string | null;
  fields: { key: string; label: string; placeholder?: string }[];
};
const galleries = boardConfigs.galleries as unknown as GalleriesConfig;
const check = (link_url: unknown) => galleries.validate?.({ link_url });

describe("galleries link_url 검증", () => {
  it.each([undefined, null, "", "   "])("빈 값 %j 은 허용한다", (value) => {
    expect(check(value)).toBeNull();
  });

  it.each(["https://youtu.be/abc", "http://example.com/a?b=1"])(
    "%s 는 허용한다",
    (value) => {
      expect(check(value)).toBeNull();
    },
  );

  it.each(["javascript:alert(1)", "ftp://a.com", "youtu.be/abc", "www.a.com"])(
    "%s 는 거부한다",
    (value) => {
      expect(check(value)).toEqual(expect.stringContaining("http"));
    },
  );
});

describe("galleries link_url 필드", () => {
  it("이미지 필드 바로 다음에 연결주소 필드가 있다", () => {
    const keys = galleries.fields.map((f) => f.key);
    const at = keys.indexOf("image_urls");
    expect(keys[at + 1]).toBe("link_url");
    const field = galleries.fields[at + 1]!;
    expect(field.label).toBe("연결주소");
    expect(field.placeholder).toBe(
      "https:// 로 시작하는 주소 또는 유튜브 링크",
    );
  });
});

describe("galleries link_url 저장 변환", () => {
  const toPayload = (link_url: unknown) =>
    (
      boardConfigs.galleries as unknown as {
        formToPayload: (f: Record<string, unknown>) => Record<string, unknown>;
      }
    ).formToPayload({ link_url, __blocks_content: [] }).link_url;

  it("앞뒤 공백을 제거해 저장한다", () => {
    expect(toPayload("  https://a.com ")).toBe("https://a.com");
  });

  it("빈 값은 null로 저장한다", () => {
    expect(toPayload("  ")).toBeNull();
    expect(toPayload(undefined)).toBeNull();
  });
});

describe("galleries 유튜브 주소 검사", () => {
  const MESSAGE =
    "유튜브 영상 주소 형식이 아닙니다. youtube.com/watch?v=, youtu.be/, youtube.com/shorts/ 주소를 넣어 주세요.";
  afterEach(() => {
    state.video = false;
  });

  it.each([
    "https://youtube.com/channel/UCx",
    "https://youtu.be/abc",
    "https://www.youtube.com/watch?v=short",
    "https://m.youtube.com/playlist?list=PLx",
  ])("스쿨멘토는 영상으로 읽히지 않는 %s 를 막는다", (value) => {
    state.video = true;
    expect(check(value)).toBe(MESSAGE);
  });

  it.each([
    "https://www.youtube.com/watch?v=abcDEF12345",
    "https://youtu.be/abcDEF12345",
    "https://a.com/x",
  ])("스쿨멘토도 %s 는 허용한다", (value) => {
    state.video = true;
    expect(check(value)).toBeNull();
  });

  it("스쿨멘토도 http(s)가 아니면 기존 문구로 거부한다", () => {
    state.video = true;
    expect(check("javascript:alert(1)")).toBe(
      "연결주소는 http:// 또는 https:// 로 시작해야 합니다.",
    );
  });

  it("위닝은 유튜브 채널 주소도 허용한다", () => {
    expect(check("https://youtube.com/channel/UCx")).toBeNull();
  });
});
