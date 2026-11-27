import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import PricingTab from "./PricingTab";

const renderTab = (ui: ReactNode, canEdit = true) =>
  render(
    <SectionEditAccessProvider value={canEdit}>
      <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
    </SectionEditAccessProvider>,
  );

describe("PricingTab", () => {
  test("추가한 행의 입력칸도 접근 가능한 이름을 가진다", () => {
    renderTab(<PricingTab initial={{ pricing: {}, updatedAt: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "행 추가" }));
    const boxes = screen.getAllByRole("textbox");
    expect(boxes.length).toBe(8);
    for (const box of boxes) {
      expect(
        box.getAttribute("aria-label") || box.closest("label")?.textContent,
      ).toBeTruthy();
    }
    expect(screen.getAllByLabelText("모델명").length).toBe(2);
    expect(screen.getAllByLabelText("캐시 입력").length).toBe(2);
  });

  test("행마다 삭제 버튼은 행 번호가 든 이름을 가진다", () => {
    renderTab(<PricingTab initial={{ pricing: {}, updatedAt: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "행 추가" }));

    expect(screen.getByRole("button", { name: "삭제 1번째 행" })).toBeVisible();
    expect(screen.getByRole("button", { name: "삭제 2번째 행" })).toBeVisible();
  });

  test("view 권한이면 행 추가, 삭제, 저장 버튼이 없고 단가는 보인다", () => {
    renderTab(
      <PricingTab
        initial={{
          pricing: {
            "gemini-x": {
              input_usd_per_1m: 1,
              output_usd_per_1m: 2,
              cached_input_usd_per_1m: 0.5,
            },
          },
          updatedAt: null,
        }}
      />,
      false,
    );

    expect(screen.getByDisplayValue("gemini-x")).toBeVisible();
    expect(screen.queryByRole("button", { name: "행 추가" })).toBeNull();
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^삭제/ })).toBeNull();
  });

  test("edit 권한이면 행 추가, 삭제, 저장 버튼이 보인다", () => {
    renderTab(<PricingTab initial={{ pricing: {}, updatedAt: null }} />, true);

    expect(screen.getByRole("button", { name: "행 추가" })).toBeVisible();
    expect(screen.getByRole("button", { name: "저장" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^삭제/ })).toBeVisible();
  });
});
