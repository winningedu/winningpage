// 사 #40: 스쿨멘토는 성장설계 시작 화면에서 채워진 학년을 바꿀 수 없고 마이페이지로 안내한다.

import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfileForm from "./ProfileForm";
import type { ProfileValues } from "./startLogic";

const state = vi.hoisted(() => ({ studentEnrollment: true }));
const mockApiFetch = vi.fn();

vi.mock("@/config/site", () => ({
  site: {
    features: {
      get studentEnrollment() {
        return state.studentEnrollment;
      },
    },
  },
}));

vi.mock("@/lib/apiFetch", () => ({
  getAuthHeader: async () => ({ Authorization: "Bearer student-token" }),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// 올해 학적이 있는 학생(enrolled)과 없는 학생.
function answerMe(enrolled: boolean) {
  mockApiFetch.mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({
      ok: true,
      orgType: "학교",
      enrollment: enrolled
        ? {
            schoolYear: 2026,
            grade: "고2",
            groupName: null,
            className: "3",
            number: 1,
          }
        : null,
      pending: null,
    }),
  });
}

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
  mockApiFetch.mockReset();
  answerMe(true);
});

describe("ProfileForm 학년 고정(사 #40)", () => {
  it("학적이 있고 학년이 채워진 채 열리면 바꿀 수 없고 마이페이지 안내가 보인다", async () => {
    renderForm("고2");

    await waitFor(() =>
      expect(screen.getByLabelText("현재 학년")).toBeDisabled(),
    );
    expect(screen.getByRole("link", { name: "마이페이지" })).toHaveAttribute(
      "href",
      "/mypage?tab=profile",
    );
  });

  it("빈 채로 열려 학생이 고른 학년은 다시 바꿀 수 있다", async () => {
    renderForm(null);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("현재 학년"), {
      target: { value: "고2" },
    });
    // 학적 응답이 반영될 때까지 기다린다.
    await act(async () => {});

    expect(screen.getByLabelText("현재 학년")).toBeEnabled();
  });

  it("학적이 없는 스쿨멘토 학생은 잠기지 않는다", async () => {
    answerMe(false);
    renderForm("고2");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.getByLabelText("현재 학년")).toBeEnabled();
  });

  it("학적 기능이 꺼진 사이트(위닝)는 조회도 잠금도 없다", () => {
    state.studentEnrollment = false;
    renderForm("고2");

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText("현재 학년")).toBeEnabled();
  });
});
