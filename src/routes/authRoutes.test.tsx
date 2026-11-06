import { afterEach, describe, expect, it, vi } from "vitest";

// authRoutes 는 모듈 로드 때 사이트 플래그로 학생 가입 화면을 고른다.
// 값을 바꿔 다시 검증하려면 모듈을 새로 평가해야 한다.
async function loadStudentSignupRoute(schoolSignup: boolean) {
  vi.resetModules();
  vi.doMock("@/config/site", () => ({
    site: { features: { schoolSignup } },
  }));
  const { default: authRoutes } = await import("./authRoutes");
  const flow = authRoutes.find((route) => route.children);
  const route = flow?.children?.find(
    (child) => child.path === "/signup/student",
  );
  return {
    Component: route?.Component,
    SchoolSignup: (await import("@/pages/signup/school/SchoolSignup")).default,
    StudentForm: (await import("@/pages/signup/StudentForm")).default,
  };
}

afterEach(() => {
  vi.doUnmock("@/config/site");
});

describe("authRoutes /signup/student", () => {
  it("학교 가입 사이트는 학교 가입 화면을 쓴다", async () => {
    const { Component, SchoolSignup } = await loadStudentSignupRoute(true);

    expect(Component).toBe(SchoolSignup);
  });

  it("위닝은 기존 학생 가입 폼을 쓴다", async () => {
    const { Component, StudentForm } = await loadStudentSignupRoute(false);

    expect(Component).toBe(StudentForm);
  });
});
