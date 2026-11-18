// StudentInfoStep 다음 버튼: 유출 조회가 끝나기 전의 중복 클릭이 다음 단계를 두 번 부르지 않는지 본다.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentInfoStep from "./StudentInfoStep";

const mockCheckPwnedPassword = vi.fn();

vi.mock("@/lib/pwnedPassword", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pwnedPassword")>()),
  checkPwnedPassword: (...args: unknown[]) => mockCheckPwnedPassword(...args),
}));

// 인증 칸은 이 테스트의 관심사가 아니다. 인증을 마친 상태만 준다.
vi.mock("./EmailVerifyField", () => ({ default: () => null }));
vi.mock("./PhoneVerifyField", () => ({ default: () => null }));

vi.mock("@/context/SignupContext", () => ({
  useSignup: () => ({
    formData: {
      name: "김학생",
      password: "abc123!",
      passwordConfirm: "abc123!",
      email: "a@b.co",
      emailCode: "",
      phone: "01012345678",
      gender: "남",
      grade: "중2",
      className: "3",
      classNumber: "",
      groupName: "",
      orgCode: "",
    },
    updateFormData: vi.fn(),
    tenant: null,
    birthDate: "20100304",
    setBirthDate: vi.fn(),
    isUnder14: false,
    verification: {
      email: { verified: true },
      phone: { verified: true },
      pass: { verified: false },
    },
    updateVerification: vi.fn(),
  }),
}));

describe("StudentInfoStep 다음 버튼", () => {
  beforeEach(() => {
    mockCheckPwnedPassword.mockReset();
  });

  it("유출 조회가 끝나기 전에 두 번 눌러도 다음 단계는 한 번만 부른다", async () => {
    let resolveLookup: (value: "ok") => void = () => {};
    mockCheckPwnedPassword.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );
    const onNext = vi.fn();
    render(
      <StudentInfoStep onPrev={vi.fn()} onNext={onNext} submitError={null} />,
    );

    const next = screen.getByRole("button", { name: "다음" });
    fireEvent.click(next);
    fireEvent.click(next);
    resolveLookup("ok");

    await waitFor(() => expect(onNext).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
