import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

function renderSheet(nonModal = false, onOpenChange = vi.fn()) {
  render(
    <div>
      <button type="button">바깥 버튼</button>
      <Sheet open onOpenChange={onOpenChange} nonModal={nonModal}>
        <SheetContent>
          <SheetTitle>서랍</SheetTitle>
          <SheetDescription>설명</SheetDescription>
        </SheetContent>
      </Sheet>
    </div>,
  );
  return onOpenChange;
}

describe("Sheet", () => {
  test("기본값은 오버레이를 그린다", () => {
    renderSheet();
    expect(document.querySelector("[data-slot=sheet-overlay]")).not.toBeNull();
  });

  test("nonModal 은 오버레이를 그리지 않는다", () => {
    renderSheet(true);
    expect(screen.getByRole("dialog", { name: "서랍" })).toBeVisible();
    expect(document.querySelector("[data-slot=sheet-overlay]")).toBeNull();
  });

  test("nonModal 은 바깥을 눌러도 닫히지 않는다", () => {
    const onOpenChange = renderSheet(true);
    const outside = screen.getByText("바깥 버튼");
    fireEvent.pointerDown(outside);
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test("기본값은 바깥을 누르면 닫힌다", () => {
    const onOpenChange = renderSheet();
    const overlay = document.querySelector("[data-slot=sheet-overlay]");
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay as Element);
    fireEvent.mouseDown(overlay as Element);
    fireEvent.click(overlay as Element);
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  test("nonModal 도 ESC 로는 닫힌다", () => {
    const onOpenChange = renderSheet(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });
});
