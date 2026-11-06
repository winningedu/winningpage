import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { SignupProvider } from "@/context/SignupContext";
import MemberType from "./MemberType";

const siteMock = vi.hoisted(() => ({ schoolSignup: false }));

vi.mock("@/config/site", () => ({
  site: {
    get features() {
      return { schoolSignup: siteMock.schoolSignup };
    },
  },
}));

function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function chooseStudent() {
  render(
    <MemoryRouter initialEntries={["/signup"]}>
      <SignupProvider>
        <Routes>
          <Route path="/signup" element={<MemberType />} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </SignupProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^학생 회원/ }));
}

describe("MemberType 학생 회원 선택", () => {
  it("학교 가입 사이트는 생년월일 단계 없이 가입 폼으로 간다", () => {
    siteMock.schoolSignup = true;
    chooseStudent();

    expect(screen.getByTestId("path")).toHaveTextContent("/signup/student");
    expect(screen.getByTestId("path")).not.toHaveTextContent("birth");
  });

  it("위닝은 기존처럼 생년월일 단계로 간다", () => {
    siteMock.schoolSignup = false;
    chooseStudent();

    expect(screen.getByTestId("path")).toHaveTextContent(
      "/signup/student/birth",
    );
  });
});
