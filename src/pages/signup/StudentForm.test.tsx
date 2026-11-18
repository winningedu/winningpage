import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignupProvider, useSignup } from "@/context/SignupContext";
import StudentForm from "./StudentForm";

const mocks = vi.hoisted(() => ({
  checkPwnedPassword: vi.fn(),
  applySignupPassword: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/pwnedPassword", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pwnedPassword")>()),
  checkPwnedPassword: mocks.checkPwnedPassword,
}));

vi.mock("@/lib/signupEmailAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/signupEmailAuth")>()),
  applySignupPassword: mocks.applySignupPassword,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  },
}));

const PWNED_MESSAGE =
  "유출된 적 있는 비밀번호예요. 다른 비밀번호를 입력해 주세요.";
const PASSWORD = "Abcd1234!";

// 비밀번호를 뺀 나머지 항목을 모두 채운 상태로 시작한다.
function Seed() {
  const {
    setMemberType,
    setBirthDate,
    updateFormData,
    updateAgreements,
    updateVerification,
  } = useSignup();
  // biome-ignore lint/correctness/useExhaustiveDependencies: 처음 한 번만 채운다
  useEffect(() => {
    setMemberType("student");
    setBirthDate("20000101");
    updateFormData({
      name: "홍길동",
      phone: "010-1234-5678",
      email: "a@example.com",
      gender: "남",
      region: "서울",
      schoolType: "N수생",
    });
    updateAgreements({
      service: true,
      privacyRequired: true,
      identityRequired: true,
    });
    updateVerification("phone", { requested: true, verified: true });
    updateVerification("email", {
      requested: true,
      verified: true,
      checked: true,
      available: true,
    });
  }, []);
  return null;
}

function renderForm() {
  render(
    <MemoryRouter>
      <SignupProvider>
        <Seed />
        <StudentForm />
      </SignupProvider>
    </MemoryRouter>,
  );
  return screen.getByLabelText(/^비밀번호/) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.checkPwnedPassword.mockResolvedValue("ok");
  mocks.applySignupPassword.mockResolvedValue({ ok: true });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "a@example.com" } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("StudentForm 유출 비밀번호", () => {
  it("비밀번호 입력칸을 벗어날 때 유출된 비밀번호면 그 칸 아래에 안내를 보인다", async () => {
    mocks.checkPwnedPassword.mockResolvedValue("pwned");
    const input = renderForm();

    fireEvent.change(input, { target: { value: PASSWORD } });
    expect(screen.queryByText(PWNED_MESSAGE)).toBeNull();
    fireEvent.blur(input);

    expect(await screen.findByText(PWNED_MESSAGE)).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("아직 확인하지 않은 채 제출하면 유출된 비밀번호는 가입 처리 전에 막는다", async () => {
    mocks.checkPwnedPassword.mockResolvedValue("pwned");
    const input = renderForm();

    fireEvent.change(input, { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "가입 완료하기" }));

    expect(await screen.findByText(PWNED_MESSAGE)).toBeTruthy();
    expect(mocks.applySignupPassword).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("유출 조회가 실패해도 가입은 진행된다", async () => {
    mocks.checkPwnedPassword.mockResolvedValue("unknown");
    const input = renderForm();

    fireEvent.change(input, { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "가입 완료하기" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(screen.queryByText(PWNED_MESSAGE)).toBeNull();
  });

  it("저장 단계에서 유출 비밀번호로 거절되면 같은 안내를 비밀번호 칸에 보인다", async () => {
    mocks.applySignupPassword.mockResolvedValue({
      error: Object.assign(new Error("pwned"), {
        code: "weak_password",
        reasons: ["pwned"],
      }),
    });
    const input = renderForm();

    fireEvent.change(input, { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "가입 완료하기" }));

    expect(await screen.findByText(PWNED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/비밀번호 설정에 실패했습니다/)).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("그 밖의 저장 오류는 기존 실패 문구를 보인다", async () => {
    mocks.applySignupPassword.mockResolvedValue({ error: new Error("x") });
    const input = renderForm();

    fireEvent.change(input, { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "가입 완료하기" }));

    expect(
      await screen.findByText(/비밀번호 설정에 실패했습니다/),
    ).toBeTruthy();
    expect(screen.queryByText(PWNED_MESSAGE)).toBeNull();
  });
});
