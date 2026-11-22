import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./xlsxDownload", () => ({ downloadXlsx: vi.fn() }));

import BulkPanel from "./BulkPanel";
import { downloadXlsx } from "./xlsxDownload";

const config = {
  title: "위닝 수행 주제 DB",
  fields: [{ key: "title", label: "제목", type: "text" }],
  fixedValues: { knowledge_type: "topic_pattern" },
  defaults: {},
};

function renderPanel() {
  return render(
    <BulkPanel
      config={config}
      rows={[
        { id: "1", title: "가" },
        { id: "2", title: "나" },
      ]}
      onReload={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("BulkPanel", () => {
  test("엑셀 내려받기는 행 수를 이름에 담고 누르면 내려받는다", () => {
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "엑셀 내려받기 (2행)" }),
    );
    expect(downloadXlsx).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadXlsx).mock.calls[0]?.[1]).toBe(
      "위닝 수행 주제 DB",
    );
  });

  test("내려받기 버튼은 Download 아이콘을 장식으로 단다", () => {
    renderPanel();
    const button = screen.getByRole("button", { name: "엑셀 내려받기 (2행)" });
    const icon = button.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  test("파일 입력은 display none 이 아니라 sr-only 로 숨긴다", () => {
    renderPanel();
    const input = screen.getByLabelText("위닝 수행 주제 DB xlsx 파일 선택");
    expect(input.classList.contains("sr-only")).toBe(true);
    expect(input.classList.contains("hidden")).toBe(false);
  });

  test("엑셀 올리기 버튼이 파일 선택창을 연다", () => {
    renderPanel();
    const input = screen.getByLabelText(
      "위닝 수행 주제 DB xlsx 파일 선택",
    ) as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "엑셀 올리기" }));
    expect(click).toHaveBeenCalledTimes(1);
  });
});
