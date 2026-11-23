import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeIsUnder14, SignupProvider, useSignup } from "./SignupContext";

const zone = vi.hoisted(() => ({ value: "Asia/Seoul" }));
vi.mock("@/lib/time/zone", () => ({ browserTimeZone: () => zone.value }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <SignupProvider>{children}</SignupProvider>
);

function storedFlow() {
  return JSON.parse(window.sessionStorage.getItem("signup-flow") ?? "{}");
}

describe("SignupContext 학교 가입 값", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("비밀번호와 비밀번호 확인은 세션 저장소에 남기지 않고 나머지는 남긴다", () => {
    const { result } = renderHook(() => useSignup(), { wrapper });

    act(() => {
      result.current.updateFormData({
        name: "김학생",
        password: "abc123!",
        passwordConfirm: "abc123!",
      });
    });

    expect(storedFlow().formData.name).toBe("김학생");
    expect(storedFlow().formData).not.toHaveProperty("password");
    expect(storedFlow().formData).not.toHaveProperty("passwordConfirm");
  });

  it("처음부터 다시 시작하면 단계와 소속이 초기화된다", () => {
    const { result } = renderHook(() => useSignup(), { wrapper });
    act(() => {
      result.current.setSchoolStep(3);
      result.current.setTenant({ isCatchAll: true });
    });

    act(() => {
      result.current.resetSignup();
    });

    expect(result.current.schoolStep).toBe(1);
    expect(result.current.tenant).toBeNull();
  });
});

// 2026-11-30T16:00Z: 서울은 12-01, 로스앤젤레스는 11-30
describe("computeIsUnder14 오늘 기준", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-30T16:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("서울에서는 2012-12-01생이 만 14세다", () => {
    zone.value = "Asia/Seoul";
    expect(computeIsUnder14("20121201")).toBe(false);
  });

  it("로스앤젤레스에서는 같은 생일이 만 13세다", () => {
    zone.value = "America/Los_Angeles";
    expect(computeIsUnder14("20121201")).toBe(true);
  });

  it("브라우저 시간대에서 아직 오지 않은 날짜와 없는 날짜는 null이다", () => {
    zone.value = "America/Los_Angeles";
    expect(computeIsUnder14("20261201")).toBeNull();
    expect(computeIsUnder14("20240230")).toBeNull();
  });
});
