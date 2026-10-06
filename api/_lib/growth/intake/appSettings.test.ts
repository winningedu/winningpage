// 성장설계 앱 설정 읽기 테스트. 의존성 주입 형태라 supabase 없이 검증한다.
import { describe, expect, test } from "vitest";
import {
  GROWTH_SETTING_KEYS,
  GrowthSettingError,
  parseSufficiencyThresholds,
  readGrowthSetting,
} from "./appSettings.js";

describe("GROWTH_SETTING_KEYS", () => {
  test("충족도 임계값 키 이름", () => {
    expect(GROWTH_SETTING_KEYS.sufficiencyThresholds).toBe(
      "growth_sufficiency_thresholds",
    );
  });
});

describe("parseSufficiencyThresholds", () => {
  test("양의 정수 enough 를 가진 객체를 받아들인다", () => {
    expect(parseSufficiencyThresholds({ enough: 5 })).toEqual({ enough: 5 });
  });

  test.each([
    ["null", null],
    ["enough 없음", {}],
    ["0", { enough: 0 }],
    ["음수", { enough: -1 }],
    ["소수", { enough: 1.5 }],
    ["문자열", { enough: "5" }],
  ])("잘못된 값(%s)은 GrowthSettingError 를 던진다", (_n, v) => {
    expect(() => parseSufficiencyThresholds(v)).toThrow(GrowthSettingError);
  });

  test("오류 이름 필드가 설정된다", () => {
    try {
      parseSufficiencyThresholds(null);
    } catch (e) {
      expect((e as Error).name).toBe("GrowthSettingError");
    }
  });
});

describe("readGrowthSetting", () => {
  test("행이 있으면 parse 결과를 돌려준다", async () => {
    const got = await readGrowthSetting(
      async (key) => (key === "k" ? { value: { enough: 3 } } : null),
      "k",
      parseSufficiencyThresholds,
    );
    expect(got).toEqual({ enough: 3 });
  });

  test("행이 없으면 설정 없음 오류를 던진다", async () => {
    await expect(
      readGrowthSetting(
        async () => null,
        "missing",
        parseSufficiencyThresholds,
      ),
    ).rejects.toThrow("설정 없음: missing");
  });
});
