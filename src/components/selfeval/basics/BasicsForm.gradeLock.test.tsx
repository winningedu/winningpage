// 사 #40: 스쿨멘토는 서비스 화면에서 채워진 학년을 바꿀 수 없고 마이페이지로 안내한다.

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BasicsForm from "./BasicsForm";
import { initialForm } from "./basicsLogic";

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

const entry = {
  quota: null,
  allowed: true,
  activityCount: 0,
  openSession: null,
  growth: null,
  profile: null,
  replyResent: 0,
  academicYearDefault: 2026,
};

function renderForm(gradeLabel: "" | "고1" | "고2" | "고3") {
  return render(
    <MemoryRouter>
      <BasicsForm
        form={{ ...initialForm(entry), gradeLabel }}
        errors={{}}
        entry={entry}
        growth={null}
        profileMissing={false}
        disabled={false}
        onChange={() => {}}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.studentEnrollment = true;
});

describe("BasicsForm 학년 고정(사 #40)", () => {
  it("채워진 학년은 바꿀 수 없고 마이페이지로 가는 안내가 보인다", () => {
    renderForm("고2");

    expect(screen.getByLabelText("학년")).toBeDisabled();
    expect(screen.getByRole("link", { name: "마이페이지" })).toHaveAttribute(
      "href",
      "/mypage?tab=profile",
    );
  });

  it("학년이 비어 있으면 입력할 수 있다", () => {
    renderForm("");

    expect(screen.getByLabelText("학년")).toBeEnabled();
  });

  it("학적 기능이 꺼진 사이트(위닝)는 그대로 고를 수 있다", () => {
    state.studentEnrollment = false;
    renderForm("고2");

    expect(screen.getByLabelText("학년")).toBeEnabled();
    expect(screen.queryByRole("link", { name: "마이페이지" })).toBeNull();
  });
});
