import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page04Cycle from "./Page04Cycle";
import { FRONT_PAGES } from "./testPages";

const p4 = FRONT_PAGES.p4;

describe("Page04Cycle", () => {
  it("shows the 7-stage radar with breaks, total, narratives and prescription", () => {
    const { container } = render(
      <Page04Cycle page={p4} tocTitle="7단계 학습관리 사이클" />,
    );
    expect(container.querySelectorAll("[data-axis]")).toHaveLength(7);
    expect(
      container.querySelectorAll('[data-axis][data-broken="true"]'),
    ).toHaveLength(1);
    expect(screen.getByText("64.4")).toBeInTheDocument();
    expect(screen.getByText(p4.cycle.gradeText)).toBeInTheDocument();
    expect(screen.getByText(p4.cycle.caption)).toBeInTheDocument();
    expect(screen.getByText(p4.scoreNote)).toBeInTheDocument();
    for (const item of p4.breaks) {
      expect(screen.getByText(item.heading)).toBeInTheDocument();
      expect(screen.getByText(item.body)).toBeInTheDocument();
    }
    expect(screen.getByText(p4.why?.body as string)).toBeInTheDocument();
    expect(screen.getByText(p4.rx.intro)).toBeInTheDocument();
    expect(screen.getByText("4 / 16")).toBeInTheDocument();
  });

  it("hides the why-record box when the log stage is not in the lowest three", () => {
    const { why: _why, ...rest } = p4;
    render(<Page04Cycle page={rest} tocTitle="7단계 학습관리 사이클" />);
    expect(screen.queryByText(p4.why?.heading as string)).toBeNull();
  });
});
