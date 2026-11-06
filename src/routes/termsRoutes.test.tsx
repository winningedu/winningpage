import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import termsRoutes from "./termsRoutes";

vi.mock("@/pages/terms/TermsDocPage", () => ({
  default: ({ code }: { code: string }) => <p>약관 {code}</p>,
}));

describe("termsRoutes", () => {
  it("학교 가입의 DB 전환 안내 약관 경로가 student_db_transfer 를 읽는다", () => {
    const route = termsRoutes.find(
      (item) => item.path === "/terms/student/db-transfer",
    );
    expect(route?.Component).toBeDefined();

    render(createElement(route?.Component as () => React.ReactElement));

    expect(screen.getByText("약관 student_db_transfer")).toBeInTheDocument();
  });
});
