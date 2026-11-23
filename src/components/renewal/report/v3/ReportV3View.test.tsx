import "@testing-library/jest-dom/vitest";
import { render, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReportV3View from "./ReportV3View";
import { FRONT_PAGES } from "./testPages";

const later = (
  <section className="fd-report-sheet" aria-label="later">
    7 이후
  </section>
);

describe("ReportV3View", () => {
  it("renders the cover, pages 1 to 6 in order, then the later pages slot", () => {
    render(<ReportV3View pages={FRONT_PAGES} laterPages={later} />);
    const sheets = Array.from(document.querySelectorAll(".fd-report-sheet"));
    expect(sheets).toHaveLength(8);
    expect(sheets[0]).toHaveTextContent(FRONT_PAGES.cover.basis);
    for (let page = 1; page <= 6; page += 1) {
      expect(sheets[page]).toHaveTextContent(`${page} / 16`);
    }
    expect(sheets[7]).toHaveTextContent("7 이후");
    expect(
      within(sheets[1] as HTMLElement).getByRole("heading", { level: 2 }),
    ).toHaveTextContent(FRONT_PAGES.p1.title);
  });

  it("surfaces an error when the toc lacks one of pages 1 to 6", () => {
    const cover = {
      ...FRONT_PAGES.cover,
      toc: FRONT_PAGES.cover.toc.filter((entry) => entry.page !== 3),
    };
    expect(() =>
      renderToStaticMarkup(<ReportV3View pages={{ ...FRONT_PAGES, cover }} />),
    ).toThrow("v3 report toc has no page 3");
  });

  it("server PDF html snapshot keeps every A4 sheet inside the print area", () => {
    const html = renderToStaticMarkup(
      <ReportV3View pages={FRONT_PAGES} laterPages={later} />,
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    const root = host.firstElementChild as HTMLElement;
    expect(root).toHaveClass("fd-print-area");
    expect(root.querySelectorAll(".fd-report-sheet")).toHaveLength(8);
    for (let page = 1; page <= 6; page += 1) {
      expect(html).toContain(`${page} / 16`);
    }
  });
});
