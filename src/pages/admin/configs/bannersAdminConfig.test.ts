import { describe, expect, test } from "vitest";
import { mainConfigs } from "./main";

type Field = {
  key: string;
  label: string;
  type: string;
  emptyLabel?: string;
  loadOptions?: unknown;
};
type BannerConfig = {
  fields: Field[];
  FormPreview?: unknown;
  formToPayload?: (form: Record<string, unknown>) => Record<string, unknown>;
};

const configs = mainConfigs as unknown as Record<string, BannerConfig>;
const BANNER_KEYS = ["banners", "sideBanners"] as const;

describe("banners 어드민: 노출 기간", () => {
  test("노출 시작일과 종료일이 sideBanners 와 같은 라벨의 date 필드다", () => {
    for (const key of BANNER_KEYS) {
      const fields = configs[key]?.fields ?? [];
      expect(fields.find((f) => f.key === "start_date")).toMatchObject({
        label: "노출 시작일",
        type: "date",
      });
      expect(fields.find((f) => f.key === "end_date")).toMatchObject({
        label: "노출 종료일",
        type: "date",
      });
    }
  });
});

describe("banners 어드민: 노출 대상", () => {
  test("두 배너 모두 공통 또는 기관 하나를 고르는 select 필드가 있다", () => {
    for (const key of BANNER_KEYS) {
      const field = configs[key]?.fields.find((f) => f.key === "tenant_id");
      expect(field).toMatchObject({
        label: "노출 대상",
        type: "select",
        emptyLabel: "공통",
      });
      expect(typeof field?.loadOptions).toBe("function");
    }
  });

  test("저장 시 비운 노출 대상과 날짜는 빈 문자열이 아니라 null 이다", () => {
    for (const key of BANNER_KEYS) {
      const payload = configs[key]?.formToPayload?.({
        title: "배너",
        tenant_id: "",
        start_date: "",
        end_date: "",
      });
      expect(payload).toMatchObject({
        title: "배너",
        tenant_id: null,
        start_date: null,
        end_date: null,
      });
    }
  });

  test("기관을 고르면 그 값을 그대로 저장한다", () => {
    const payload = configs.banners?.formToPayload?.({ tenant_id: "t-1" });
    expect(payload).toMatchObject({ tenant_id: "t-1" });
  });
});

describe("banners 어드민: 미리보기", () => {
  test("두 배너 모두 폼 옆에 FormPreview 를 단다", () => {
    for (const key of BANNER_KEYS) {
      expect(typeof configs[key]?.FormPreview).toBe("function");
    }
  });
});
