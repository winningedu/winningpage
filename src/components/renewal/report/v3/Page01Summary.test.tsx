import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page01Summary from "./Page01Summary";
import { FRONT_PAGES } from "./testPages";

const p1 = FRONT_PAGES.p1;

describe("Page01Summary", () => {
  it("shows title, lead, profile, radar, three KPIs, traits and the one thing", () => {
    const { container } = render(
      <Page01Summary page={p1} tocTitle="진단 요약" />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      p1.title,
    );
    expect(screen.getByText(p1.lead)).toBeInTheDocument();
    const { period: _period, ...textRows } = p1.profile;
    for (const value of Object.values(textRows)) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(container.querySelectorAll("[data-axis]")).toHaveLength(7);
    expect(container.querySelector("[data-target-ring]")).not.toBeNull();
    expect(screen.getByText(p1.kpi1.label)).toBeInTheDocument();
    expect(screen.getByText(p1.kpi1.subtitle)).toBeInTheDocument();
    expect(screen.getByText("68.4")).toBeInTheDocument();
    expect(screen.getByText(p1.kpi3.sub)).toBeInTheDocument();
    expect(
      screen.getByText(p1.typeSummary?.body as string),
    ).toBeInTheDocument();
    for (const trait of p1.traits) {
      expect(screen.getByText(trait.heading)).toBeInTheDocument();
    }
    expect(screen.getByText(p1.one.title)).toBeInTheDocument();
    expect(screen.getByText(p1.one.actions[1] as string)).toBeInTheDocument();
    expect(screen.getByText("1 / 16")).toBeInTheDocument();
  });

  it("joins the period fields in the layout, PDF p1 style (22 r16)", () => {
    render(<Page01Summary page={p1} tocTitle="진단 요약" />);
    expect(screen.getByText("11/10(화) ~ 12/7(월) (4주)")).toBeInTheDocument();
    expect(screen.getByText("재진단 12/8(화)")).toBeInTheDocument();
  });

  it("SIMPLE response hides the student type block", () => {
    const { typeSummary: _type, ...simple } = p1;
    render(<Page01Summary page={simple} tocTitle="진단 요약" />);
    expect(
      screen.queryByText("목표 실행 불균형형", { exact: false }),
    ).toBeNull();
    expect(screen.queryByText(p1.typeSummary?.body as string)).toBeNull();
  });
});
