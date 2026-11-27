import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import termsRoutes from "./termsRoutes";

vi.mock("@/pages/terms/TermsDocPage", () => ({
  default: ({ code }: { code: string }) => <p>약관 {code}</p>,
}));

describe("termsRoutes", () => {
  it("교사, 기관관리자 이용약관 경로가 teacher_service 를 읽는다", () => {
    const route = termsRoutes.find(
      (item) => item.path === "/terms/teacher/service",
    );
    expect(route?.Component).toBeDefined();

    render(createElement(route?.Component as () => React.ReactElement));

    expect(screen.getByText("약관 teacher_service")).toBeInTheDocument();
  });

  it("학생 가입약관 V2 에 없는 DB 전환 안내 경로는 두지 않는다", () => {
    expect(
      termsRoutes.find((item) => item.path === "/terms/student/db-transfer"),
    ).toBeUndefined();
  });
});
