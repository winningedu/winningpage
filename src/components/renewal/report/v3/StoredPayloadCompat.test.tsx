import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiagnosisV3Pages } from "@/lib/diagnosis-v3/types";
import LaterPages from "./LaterPages";
import { laterPages } from "./laterPagesFixture";
import ReportV3View from "./ReportV3View";
import { FRONT_PAGES } from "./testPages";

vi.mock("@/config/site", () => ({
  site: {
    brandName: "TEST",
    features: { callmentor: true },
    logo: { horizontal: "/logo.svg" },
  },
}));

// v3 payloads stored before 2026-11-23 lack these fields; stored reports render as saved.
const { rungs: _rungs, ...oldLadder } = FRONT_PAGES.p2.ladder;
const { examOpsVerdict: _verdict, ...oldP3 } = FRONT_PAGES.p3;
const {
  title: _title,
  points: _points,
  ...oldUrgency
} = laterPages.p11.urgency;
const oldFront = {
  ...FRONT_PAGES,
  p2: { ...FRONT_PAGES.p2, ladder: oldLadder },
  p3: oldP3,
};
const oldLater: DiagnosisV3Pages = {
  ...laterPages,
  p11: { ...laterPages.p11, urgency: oldUrgency },
};

describe("v3 payload stored before the weekend self-study field", () => {
  it("renders the minimum load line alone, without a weekend line or placeholder text", () => {
    const { container } = render(<LaterPages pages={laterPages} />);
    expect(laterPages.p11.numbers).not.toHaveProperty("weekend");
    expect(screen.getByText("MINLOAD text")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("평소 주말 자습");
    expect(container).not.toHaveTextContent(/undefined|NaN/);
  });
});

describe("v3 payload stored before the ladder, exam verdict and urgency points fields", () => {
  it("renders every page without those blocks and without placeholder text", () => {
    const { container } = render(
      <ReportV3View
        pages={oldFront}
        laterPages={<LaterPages pages={oldLater} />}
      />,
    );
    expect(container).not.toHaveTextContent(/undefined|NaN/);
    // rungs still show their fill state, the urgency keeps its level and text
    expect(container.querySelectorAll("[data-rung]")).toHaveLength(3);
    expect(screen.getByText("URG label")).toBeInTheDocument();
    expect(screen.getByText("URG text")).toBeInTheDocument();
    expect(screen.queryByText("10점")).toBeNull();
    expect(
      screen.getByText(FRONT_PAGES.p3.examOps.heading),
    ).toBeInTheDocument();
  });
});
