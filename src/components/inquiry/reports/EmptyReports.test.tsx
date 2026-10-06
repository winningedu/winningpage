import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import EmptyReports from "./EmptyReports";

describe("EmptyReports", () => {
  it("안내 문구와 정보 입력으로 가는 시작 버튼을 그린다", () => {
    render(
      <MemoryRouter>
        <EmptyReports />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("아직 만든 심화탐구가 없어요. 정보 입력에서 시작해요"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute(
      "href",
      "/app/inquiry",
    );
  });
});
