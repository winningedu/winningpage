import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiagnosisV3Pages } from "@/lib/diagnosis-v3/types";
import LaterPages from "./LaterPages";
import { laterPages } from "./laterPagesFixture";
import ReportV3View from "./ReportV3View";
import { FRONT_PAGES } from "./testPages";

vi.mock("@/config/site", () => ({
  site: { brandName: "TEST", features: { callmentor: true } },
}));

/** Discriminators and codes the components switch on; every other string is display copy. */
const CODE_KEYS = new Set([
  "kind",
  "code",
  "stateCode",
  "cell",
  "highlighted",
  "subject",
  "verdict",
  "dim",
  "level",
  "factor",
  "letter",
  "area",
]);

/** Appends a COPY_TEXT line-break marker to every display string of a payload. */
const withBreaks = (value: unknown, key?: string): unknown => {
  if (typeof value === "string") {
    return key !== undefined && CODE_KEYS.has(key)
      ? value
      : `${value}<br>둘째 줄`;
  }
  if (Array.isArray(value)) return value.map((item) => withBreaks(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, withBreaks(v, k)]),
    );
  }
  return value;
};

/** Text nodes still showing the marker, with their parent element's text for the failure message. */
const literalBreaks = (root: HTMLElement) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.includes("<br")) {
      found.push(node.parentElement?.textContent ?? "");
    }
  }
  return found;
};

describe("v3 report line breaks", () => {
  it("renders every <br> marker of the payload as a line break, never as text", () => {
    const front = withBreaks(FRONT_PAGES) as typeof FRONT_PAGES;
    const later = withBreaks(laterPages) as DiagnosisV3Pages;
    const { container } = render(
      <ReportV3View pages={front} laterPages={<LaterPages pages={later} />} />,
    );
    expect(literalBreaks(container)).toEqual([]);
    expect(container.querySelectorAll("br").length).toBeGreaterThan(0);
  });
});
