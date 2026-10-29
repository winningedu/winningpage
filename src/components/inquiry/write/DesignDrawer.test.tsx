import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { TopicView } from "@/lib/inquiry/types";
import { makeDesign } from "../design/designFixture";
import DesignDrawer from "./DesignDrawer";

describe("DesignDrawer", () => {
  test("열리면 설계 리포트를 압축 형태로 보여 준다", () => {
    render(
      <DesignDrawer
        open
        onOpenChange={vi.fn()}
        design={makeDesign()}
        topic={{ id: "t" } as TopicView}
      />,
    );
    expect(screen.getByRole("dialog", { name: "설계 리포트" })).toBeVisible();
    expect(screen.getByRole("table", { name: "탐구 개요" })).toBeVisible();
  });

  test("모바일에서는 화면 폭을 채우고 48rem을 넘지 않는다", () => {
    render(
      <DesignDrawer
        open
        onOpenChange={vi.fn()}
        design={makeDesign()}
        topic={{ id: "t" } as TopicView}
      />,
    );
    const popup = screen.getByRole("dialog", { name: "설계 리포트" });
    expect(popup.className).toContain("w-full");
    expect(popup.className).toContain("max-w-[48rem]");
    expect(popup.className.split(" ")).not.toContain("w-[48rem]");
  });

  test("닫혀 있으면 그리지 않는다", () => {
    render(
      <DesignDrawer
        open={false}
        onOpenChange={vi.fn()}
        design={makeDesign()}
        topic={{ id: "t" } as TopicView}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("xl 이상 비모달", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test("팝업은 body 로 포털돼도 헤더 높이 변수 없이 4rem 아래에서 시작한다", () => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
      render(
        <DesignDrawer
          open
          onOpenChange={vi.fn()}
          design={makeDesign()}
          topic={{ id: "t" } as TopicView}
        />,
      );
      const popup = screen.getByRole("dialog", { name: "설계 리포트" });
      expect(popup.className).toContain("data-[side=right]:top-16");
      expect(popup.className).toContain(
        "data-[side=right]:h-[calc(100dvh-4rem)]",
      );
      expect(popup.className).not.toContain("--header-height");
    });
  });
});
