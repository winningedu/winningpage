import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
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
});
