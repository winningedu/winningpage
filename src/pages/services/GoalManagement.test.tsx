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
    expect(screen.queryByRole("heading", { name: /이용권 ?안내/ })).toBeNull();
    expect(screen.queryByText("이용권 구매하러 가기")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});

// QA4 29번: 가장 큰 네 간격(15rem 이상)을 성장설계 소개 페이지 기준(8.375rem)으로 맞춘다.
describe("GoalManagement 섹션 간격", () => {
  it.each([
    /이런 학생에게/,
    /아이의 일주일 목표 관리를/,
    /목표관리로 달라지는 것들/,
    /자주 묻는 질문/,
  ])("%s 섹션 위 간격은 성장설계와 같은 8.375rem이다", (heading) => {
    render(
      <MemoryRouter>
        <GoalManagement />
      </MemoryRouter>,
    );
    const section = screen
      .getByRole("heading", { name: heading })
      .closest("section");
    expect(section).toHaveClass("lg:pt-33.5");
    expect(section?.className).not.toMatch(/lg:pt-(60|60\.75|64\.5|71\.75)/);
  });
});
