// OverlayScrollbars cascade-layer 버그 — src/index.css가 overlayscrollbars.css를
// @layer 없이 import해 `[data-overlayscrollbars]{position:relative}`가 Tailwind v4
// @layer utilities의 absolute를 항상 이긴다(unlayered > layered). ScrollArea 루트에
// 직접 absolute 포지셔닝을 걸면 무시되고 목록이 정상 흐름에 남아 아래로 밀린다 —
// 포지셔닝은 ScrollArea 밖의 plain wrapper가 맡아야 한다.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UniversitySelect from "./UniversitySelect";

vi.mock("@/lib/goal/universitySearch", () => ({
  searchUniversities: vi.fn().mockResolvedValue([]),
  fetchDepartmentsForUniversity: vi.fn().mockResolvedValue([]),
}));

describe("UniversitySelect 드롭다운 위치", () => {
  it("listbox는 absolute 포지셔닝 wrapper 안에 있고, ScrollArea 자신에는 absolute가 없다", () => {
    render(
      <UniversitySelect
        target="upper"
        value={{ university: "", department: "" }}
        onChange={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "상한 목표 대학교" }));

    const listbox = screen.getByRole("listbox");
    const scrollAreaRoot = listbox.closest('[data-slot="scroll-area"]');
    expect(scrollAreaRoot).not.toBeNull();
    expect(scrollAreaRoot?.className).not.toMatch(/\babsolute\b/);

    // 포지셔닝 클래스(absolute + top-[calc(...)])는 ScrollArea 밖의 별도 wrapper에 있어야
    // OverlayScrollbars의 `[data-overlayscrollbars]{position:relative}`(unlayered)에
    // 덮이지 않는다.
    const positionedWrapper = scrollAreaRoot?.parentElement;
    expect(positionedWrapper?.className).toMatch(/\babsolute\b/);
    expect(positionedWrapper?.hasAttribute("data-overlayscrollbars")).toBe(
      false,
    );
  });
});
