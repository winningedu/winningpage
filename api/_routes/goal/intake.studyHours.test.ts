import { describe, expect, it } from "vitest";
import { isValidHours, STUDY_HOURS_MAX } from "./intake.js";

// QA 행290 — 온보딩 자습 시간을 0.1시간 단위(SliderRow.tsx round2)로 입력할 수 있어야
// 한다. intake.ts의 요일별 자습 시간 검증기(isValidHours)가 정수만 허용하지 않는지
// 확인하는 회귀 테스트다(원래도 정수 제약이 없었음 — 확인 목적).
describe("isValidHours (studyHours 0.1단위 입력)", () => {
  it("0.1시간 단위 소수를 허용한다", () => {
    expect(isValidHours(3.4, STUDY_HOURS_MAX)).toBe(true);
    expect(isValidHours(0.1, STUDY_HOURS_MAX)).toBe(true);
    expect(isValidHours(11.9, STUDY_HOURS_MAX)).toBe(true);
  });

  it("정수도 여전히 허용한다", () => {
    expect(isValidHours(0, STUDY_HOURS_MAX)).toBe(true);
    expect(isValidHours(12, STUDY_HOURS_MAX)).toBe(true);
  });

  it("문자열로 전달된 소수도 허용한다(JSON 바디 관례)", () => {
    expect(isValidHours("3.4", STUDY_HOURS_MAX)).toBe(true);
  });

  it("범위를 벗어나면 거절한다", () => {
    expect(isValidHours(-0.1, STUDY_HOURS_MAX)).toBe(false);
    expect(isValidHours(24.1, STUDY_HOURS_MAX)).toBe(false);
  });

  it("숫자로 해석할 수 없는 값은 거절한다", () => {
    expect(isValidHours(null, STUDY_HOURS_MAX)).toBe(false);
    expect(isValidHours(undefined, STUDY_HOURS_MAX)).toBe(false);
    expect(isValidHours(true, STUDY_HOURS_MAX)).toBe(false);
    expect(isValidHours({}, STUDY_HOURS_MAX)).toBe(false);
    expect(isValidHours("abc", STUDY_HOURS_MAX)).toBe(false);
  });
});
