import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

// 학부모 가입 화면 세 곳이 학생 화면과 같은 코드 이름을 쓰는지 본다.
// 학생 등록 사이트(스쿨멘토)는 학생 고유코드, 그 외(위닝에듀)는 연결코드다.

const mocks = vi.hoisted(() => ({
  site: { features: { studentEnrollment: false } },
}));

vi.mock("@/config/site", () => ({ site: mocks.site }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/apiFetch", () => ({
  apiFetch: vi.fn(),
  getAuthHeader: vi.fn(),
}));
vi.mock("@/context/SignupContext", () => ({
  useSignup: () => ({
    memberType: "parent",
    parentSignupCompleted: true,
    formData: { name: "" },
    resetSignup: vi.fn(),
  }),
}));

import LinkChoice from "./LinkChoice";
import LinkCode from "./LinkCode";
import ParentHome from "./ParentHome";

const SCREENS = [
  ["LinkChoice", LinkChoice],
  ["LinkCode", LinkCode],
  ["ParentHome", ParentHome],
] as const;

function textOf(Screen: (typeof SCREENS)[number][1]) {
  const { container } = render(
    <MemoryRouter>
      <Screen />
    </MemoryRouter>,
  );
  const placeholders = [...container.querySelectorAll("input")]
    .map((el) => el.getAttribute("placeholder") ?? "")
    .join(" ");
  return `${container.textContent} ${placeholders}`;
}

describe("학부모 가입 화면 코드 명칭", () => {
  it.each(SCREENS)(
    "%s: 학생 등록 사이트는 학생 고유코드로 안내한다",
    (_n, Screen) => {
      mocks.site.features.studentEnrollment = true;
      const text = textOf(Screen);
      expect(text).toContain("학생 고유코드");
      expect(text).not.toContain("연결코드");
    },
  );

  it.each(SCREENS)("%s: 그 외 사이트는 연결코드로 안내한다", (_n, Screen) => {
    mocks.site.features.studentEnrollment = false;
    const text = textOf(Screen);
    expect(text).toContain("연결코드");
    expect(text).not.toContain("학생 고유코드");
  });
});
