import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SignupProvider, useSignup } from "./SignupContext";

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
        username: "mentor01",
        password: "abc123!",
        passwordConfirm: "abc123!",
      });
    });

    expect(storedFlow().formData.username).toBe("mentor01");
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
