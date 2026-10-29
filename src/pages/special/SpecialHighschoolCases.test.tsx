import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SpecialHighschoolCases from "./SpecialHighschoolCases";

vi.mock("@/components/admission/AcceptanceRateHero", () => ({
  default: () => null,
}));
vi.mock("@/components/special/SpecialHighschoolCaseCard", () => ({
  default: () => null,
}));
vi.mock("./specialHighschoolData", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./specialHighschoolData")>();
  return {
    ...actual,
    fetchSpecialHighschoolCases: async () =>
      actual.SPECIAL_HS_TABS.map((item, index) => ({
        id: index,
        school_type: item.key,
      })),
  };
});

describe("SpecialHighschoolCases 분류 탭", () => {
  it("모바일에서 탭 글자가 세로로 쪼개지지 않도록 한 줄 유지와 작은 글자를 쓴다", async () => {
    render(<SpecialHighschoolCases />);
    const tabs = await screen.findAllByRole("tab");
    await vi.waitFor(() =>
      expect(screen.getAllByRole("tab").length).toBeGreaterThan(1),
    );
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("whitespace-nowrap", "text-lg", "sm:text-2xl");
    }
    expect(tabs.length).toBeGreaterThan(0);
  });

  it("탭 목록이 가로 스크롤 가능하고 스크롤바를 숨긴다", async () => {
    render(<SpecialHighschoolCases />);
    await vi.waitFor(() =>
      expect(screen.getAllByRole("tab").length).toBeGreaterThan(1),
    );
    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveClass("overflow-x-auto", "gap-3", "sm:gap-4");
    expect(tablist.className).toContain("[scrollbar-width:none]");
  });
});
