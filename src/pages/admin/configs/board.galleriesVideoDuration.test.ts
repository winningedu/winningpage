// 홈 칼럼 박스의 영상 재생 시간 입력(결정 24): 관리자가 직접 넣는 선택 칸이고 비우면 홈에 시간이 안 보인다.
import { describe, expect, it } from "vitest";
import { boardConfigs } from "./board";

type GalleriesConfig = {
  validate: (form: Record<string, unknown>) => string | null;
  formToPayload: (form: Record<string, unknown>) => Record<string, unknown>;
  fields: { key: string; label: string; type: string }[];
};
const galleries = boardConfigs.galleries as unknown as GalleriesConfig;

describe("galleries 재생 시간 필드", () => {
  it("연결주소 바로 다음에 숫자 칸으로 있다", () => {
    const keys = galleries.fields.map((f) => f.key);
    const at = keys.indexOf("link_url");
    const field = galleries.fields[at + 1];
    expect(field?.key).toBe("video_duration_seconds");
    expect(field?.label).toBe("영상 재생 시간(초)");
    expect(field?.type).toBe("number");
  });
});

describe("galleries 재생 시간 검증", () => {
  const check = (value: unknown) =>
    galleries.validate({ video_duration_seconds: value });

  it.each([undefined, null, "", 760, "760"])("%j 은 허용한다", (value) => {
    expect(check(value)).toBeNull();
  });

  it.each([0, -5, 1.5, "abc", 86400])("%j 은 거부한다", (value) => {
    expect(check(value)).toEqual(expect.stringContaining("재생 시간"));
  });
});

describe("galleries 재생 시간 저장 변환", () => {
  const toPayload = (value: unknown) =>
    galleries.formToPayload({
      video_duration_seconds: value,
      __blocks_content: [],
    }).video_duration_seconds;

  it("비어 있으면 null로 저장한다", () => {
    expect(toPayload("")).toBeNull();
    expect(toPayload(undefined)).toBeNull();
    expect(toPayload(null)).toBeNull();
  });

  it("값이 있으면 정수로 저장한다", () => {
    expect(toPayload("760")).toBe(760);
    expect(toPayload(902)).toBe(902);
  });
});
