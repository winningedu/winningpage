import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import EmptyAssetsDialog from "./EmptyAssetsDialog";

describe("EmptyAssetsDialog", () => {
  test("열리면 두 선택지를 보여 준다", () => {
    render(
      <EmptyAssetsDialog open onPickActivity={vi.fn()} onProceed={vi.fn()} />,
    );
    expect(
      screen.getByRole("dialog", { name: "고른 활동이 없어요" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "활동 고르러 가기" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "예비 주제로 추천받기" }),
    ).toBeVisible();
  });

  test("활동 고르러 가기를 누르면 onPickActivity 를 부른다", () => {
    const onPickActivity = vi.fn();
    render(
      <EmptyAssetsDialog
        open
        onPickActivity={onPickActivity}
        onProceed={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "활동 고르러 가기" }));
    expect(onPickActivity).toHaveBeenCalled();
  });

  test("예비 주제로 추천받기를 누르면 onProceed 를 부른다", () => {
    const onProceed = vi.fn();
    render(
      <EmptyAssetsDialog open onPickActivity={vi.fn()} onProceed={onProceed} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "예비 주제로 추천받기" }),
    );
    expect(onProceed).toHaveBeenCalled();
  });

  test("닫혀 있으면 그리지 않는다", () => {
    render(
      <EmptyAssetsDialog
        open={false}
        onPickActivity={vi.fn()}
        onProceed={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
