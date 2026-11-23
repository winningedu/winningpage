import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page05Obstacles from "./Page05Obstacles";
import { FRONT_PAGES } from "./testPages";

const p5 = FRONT_PAGES.p5;
const TOC = "방해 요인과 마음 상태";

describe("Page05Obstacles", () => {
  it("groups obstacle options by area, marks the picked ones and counts them", () => {
    const { container } = render(<Page05Obstacles page={p5} tocTitle={TOC} />);
    const groups = container.querySelectorAll("[data-group]");
    expect(groups).toHaveLength(2);
    const picked = container.querySelectorAll('[data-selected="true"]');
    expect(picked).toHaveLength(1);
    expect(picked[0]).toHaveTextContent("중요한 과목이 자꾸 뒤로 밀려요.");
    expect(within(groups[0] as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(groups[1] as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(screen.getByText("5 / 16")).toBeInTheDocument();
  });

  it("shows mind bars, note and interpretation lines", () => {
    render(<Page05Obstacles page={p5} tocTitle={TOC} />);
    expect(
      screen.getByRole("img", { name: "자기효능감 75" }),
    ).toBeInTheDocument();
    expect(screen.getByText(p5.mind.note)).toBeInTheDocument();
    for (const line of p5.interpretation.areas) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    expect(screen.getByText(p5.interpretation.weak)).toBeInTheDocument();
  });

  it("cross check shows items, the skipped note, or nothing when absent", () => {
    const { rerender } = render(<Page05Obstacles page={p5} tocTitle={TOC} />);
    const row = screen
      .getByRole("table")
      .querySelector("tbody tr") as HTMLElement;
    expect(row).toHaveTextContent("8-3");
    expect(row).toHaveTextContent("우선순위 41");
    expect(within(row).getByText("일치")).toBeInTheDocument();

    rerender(
      <Page05Obstacles
        page={{
          ...p5,
          crossCheck: { kind: "skipped", text: "교차 확인 생략" },
        }}
        tocTitle={TOC}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("교차 확인 생략")).toBeInTheDocument();

    const { crossCheck: _c, ...simple } = p5;
    rerender(<Page05Obstacles page={simple} tocTitle={TOC} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("교차 확인 생략")).toBeNull();
  });
});
