import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { RELIABILITY_NOTES } from "@/lib/inquiry/labels";
import { type LocalAsset, onelineAsset } from "./infoLogic";
import SelectedAssets from "./SelectedAssets";

const REC: LocalAsset = {
  key: "record:r1",
  input: { kind: "record", activityRecordId: "r1" },
  reliability: "A",
  summary: "항상성 기전 정리",
};
const ONE = onelineAsset("한 줄 주제", "oneline:1");

function setup(items: LocalAsset[], disabled = false) {
  const onRemove = vi.fn();
  const onMove = vi.fn();
  render(
    <SelectedAssets
      items={items}
      disabled={disabled}
      onRemove={onRemove}
      onMove={onMove}
    />,
  );
  return { onRemove, onMove };
}

describe("SelectedAssets", () => {
  test("자산이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <SelectedAssets
        items={[]}
        disabled={false}
        onRemove={vi.fn()}
        onMove={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("첫 항목에만 출발 활동 표시를 붙인다", () => {
    setup([REC, ONE]);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0] as HTMLElement).getByText("출발 활동")).toBeVisible();
    expect(within(rows[1] as HTMLElement).queryByText("출발 활동")).toBeNull();
  });

  test("신뢰도 C 는 배지가 아니라 문장으로 보여 주고 A 는 보여 주지 않는다", () => {
    setup([REC, ONE]);
    expect(screen.getByText(RELIABILITY_NOTES.C)).toBeVisible();
    expect(screen.queryByText(RELIABILITY_NOTES.A)).toBeNull();
  });

  test("제거 버튼을 누르면 key 를 알린다", () => {
    const { onRemove } = setup([REC, ONE]);
    fireEvent.click(screen.getByRole("button", { name: "한 줄 주제 제거" }));
    expect(onRemove).toHaveBeenCalledWith("oneline:1");
  });

  test("순서 이동 버튼이 위아래를 알리고 끝 항목에서는 막힌다", () => {
    const { onMove } = setup([REC, ONE]);
    expect(
      screen.getByRole("button", { name: "항상성 기전 정리 위로" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "한 줄 주제 아래로" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "한 줄 주제 위로" }));
    expect(onMove).toHaveBeenCalledWith("oneline:1", "up");
  });

  test("disabled 면 버튼이 모두 잠긴다", () => {
    setup([REC, ONE], true);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
