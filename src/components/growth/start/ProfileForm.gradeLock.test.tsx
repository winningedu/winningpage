// 사 #40: 스쿨멘토는 성장설계 시작 화면에서 채워진 학년을 바꿀 수 없고 마이페이지로 안내한다.

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfileForm from "./ProfileForm";
import type { ProfileValues } from "./startLogic";

const state = vi.hoisted(() => ({ studentEnrollment: true }));

vi.mock("@/config/site", () => ({
  site: {
    features: {
      get studentEnrollment() {
        return state.studentEnrollment;
      },
    },
  },
}));

const values = (grade: ProfileValues["grade"]): ProfileValues => ({
  schoolType: null,
  admissionYear: null,
  grade,
  semester: null,
  career: null,
  department: null,
  universities: [],
});

function renderForm(grade: ProfileValues["grade"]) {
  return render(
    <MemoryRouter>
      <ProfileForm values={values(grade)} saving={false} onSubmit={() => {}} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.studentEnrollment = true;
});

describe("ProfileForm 학년 고정(사 #40)", () => {
  it("채워진 학년은 바꿀 수 없고 마이페이지로 가는 안내가 보인다", () => {
    renderForm("고2");

    expect(screen.getByLabelText("현재 학년")).toBeDisabled();
    expect(screen.getByRole("link", { name: "마이페이지" })).toHaveAttribute(
      "href",
      "/mypage?tab=profile",
    );
  });

  it("학년이 비어 있으면 입력할 수 있다", () => {
    renderForm(null);

    expect(screen.getByLabelText("현재 학년")).toBeEnabled();
  });

  it("학적 기능이 꺼진 사이트(위닝)는 그대로 고를 수 있다", () => {
    state.studentEnrollment = false;
    renderForm("고2");

    expect(screen.getByLabelText("현재 학년")).toBeEnabled();
  });
});
