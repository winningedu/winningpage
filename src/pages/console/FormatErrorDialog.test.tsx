// 형식 오류 확인 창: 제목에 이름이 없고, 틀린 칸마다 한 줄씩 보이며, 긴 목록은 창 안에서 스크롤된다.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FormatErrorDialog, { josaEunNeun } from "./FormatErrorDialog";

const GRADE_ITEM = {
  row: 3,
  name: "홍*동",
  cell: "학년",
  value: "3학년",
  message: "중1~고3 중에서 골라 적어요",
};

function open(items = [GRADE_ITEM], onClose: () => void = () => {}) {
  return render(<FormatErrorDialog open onClose={onClose} items={items} />);
}

describe("FormatErrorDialog", () => {
  it("제목은 줄 수만 말하고 이름을 넣지 않는다", () => {
    open([GRADE_ITEM, { ...GRADE_ITEM, cell: "반", value: "3반" }]);

    expect(
      screen.getByRole("heading", { name: "형식 오류 1줄을 고쳐 주세요" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading").textContent).not.toContain("홍*동");
  });

  it("첫 줄에 오류 줄 수와 저장하지 않는다는 말을 보인다", () => {
    open([GRADE_ITEM, { ...GRADE_ITEM, row: 5 }]);

    expect(
      screen.getByText("2줄에 형식 오류가 있어요. 오류 줄은 저장하지 않아요"),
    ).toBeTruthy();
  });

  it("칸마다 한 줄씩 행, 이름, 칸, 값, 이유를 보인다", () => {
    open();

    expect(
      screen.getByText('3행 홍*동: 학년 "3학년"은 중1~고3 중에서 골라 적어요'),
    ).toBeTruthy();
  });

  it("값이 비어 있으면 값 없이 이유만 보인다", () => {
    open([
      { ...GRADE_ITEM, value: "", message: "이름을 적어요", cell: "이름" },
    ]);

    expect(screen.getByText("3행 홍*동: 이름을 적어요")).toBeTruthy();
  });

  it("이름이 비어 있으면 행 번호 뒤에 바로 이유를 보인다", () => {
    open([
      {
        ...GRADE_ITEM,
        name: "",
        value: "",
        message: "이름을 적어요",
        cell: "",
      },
    ]);

    expect(screen.getByText("3행: 이름을 적어요")).toBeTruthy();
  });

  it("행이 없는 항목은 이유만 보인다", () => {
    open([
      { row: 0, name: "", cell: "", value: "", message: "저장하지 못했어요" },
    ]);

    expect(screen.getByText("저장하지 못했어요")).toBeTruthy();
  });

  it("조사는 받침이 있는 한글과 0,1,3,6,7,8 은 '은', 그 밖은 '는'이다", () => {
    expect(josaEunNeun("고2학년")).toBe("은");
    expect(josaEunNeun("반")).toBe("은");
    expect(josaEunNeun("2")).toBe("는");
    expect(josaEunNeun("3")).toBe("은");
    expect(josaEunNeun("A")).toBe("는");
    expect(josaEunNeun("초6")).toBe("은");
    expect(josaEunNeun("가")).toBe("는");
  });

  it("목록은 스크롤 영역 안에 있다", () => {
    open();

    const list = screen.getByText(/3행 홍\*동/).closest("div");
    expect(list?.className).toContain("max-h-80");
    expect(list?.className).toContain("overflow-y-auto");
  });

  it("확인을 누르면 닫는다", () => {
    const onClose = vi.fn();
    open([GRADE_ITEM], onClose);

    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(onClose).toHaveBeenCalled();
  });
});
