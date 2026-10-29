import { describe, expect, it } from "vitest";
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
