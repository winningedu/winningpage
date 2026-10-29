import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GoalTabs from "./GoalTabs";

const TABS = [
  { value: "weekly", label: "주간" },
  { value: "monthly", label: "월간" },
];

describe("GoalTabs variant", () => {
  it("boxed: 선택 탭은 accent 테두리/글자, 비선택 탭은 회색 테두리 + ink-sub 글자의 박스다", () => {
    render(
      <GoalTabs
        tabs={TABS}
        value="weekly"
        onChange={() => {}}
        variant="boxed"
      />,
    );

    const selected = screen.getByRole("tab", { name: "주간" });
    const unselected = screen.getByRole("tab", { name: "월간" });
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(selected).toHaveClass(
      "border",
      "rounded-lg",
      "border-accent",
      "text-accent",
    );
    expect(unselected).toHaveClass(
      "border",
      "rounded-lg",
      "border-[#E3E3E3]",
      "text-ink-sub",
    );
    expect(unselected).not.toHaveClass("border-accent");
  });

  it("기본 variant는 박스 없이 글자색만 다르다", () => {
    render(<GoalTabs tabs={TABS} value="weekly" onChange={() => {}} />);

    const selected = screen.getByRole("tab", { name: "주간" });
    expect(selected).toHaveClass("text-ink-strong");
    expect(selected).not.toHaveClass("border");
  });
});
