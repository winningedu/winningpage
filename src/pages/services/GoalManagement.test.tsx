import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import GoalManagement from "./GoalManagement";

describe("GoalManagement 소개 랜딩", () => {
  it("하단 목표관리 이용권 안내 섹션이 없다", () => {
    render(
      <MemoryRouter>
        <GoalManagement />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("heading", { name: /이용권 ?안내/ }),
    ).toBeNull();
    expect(screen.queryByText("이용권 구매하러 가기")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
