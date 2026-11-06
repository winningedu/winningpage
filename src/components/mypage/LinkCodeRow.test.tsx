// 마이페이지 학생 고유코드 행(사 #111). 학부모 매칭에 쓰여 스쿨멘토에서는 복사 버튼을 둔다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LinkCodeRow from "./LinkCodeRow";

const writeText = vi.fn();

function renderRow(over: Partial<Parameters<typeof LinkCodeRow>[0]> = {}) {
  return render(
    <LinkCodeRow
      label="학생 고유코드"
      code="AB12CD34"
      copyable
      reissuing={false}
      onReissue={() => {}}
      {...over}
    />,
  );
}

afterEach(() => {
  writeText.mockReset();
});

describe("LinkCodeRow", () => {
  it("라벨과 코드를 보이고 복사 버튼이 코드를 클립보드에 넣는다", async () => {
    writeText.mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderRow();

    expect(screen.getByText("학생 고유코드")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("AB12CD34"));
    expect(await screen.findByText("복사했어요")).toBeInTheDocument();
  });

  it("복사에 실패하면 직접 복사 안내를 보인다", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    renderRow();

    fireEvent.click(screen.getByRole("button", { name: "복사" }));

    expect(
      await screen.findByText(
        "복사하지 못했어요. 직접 선택해서 복사해 주세요.",
      ),
    ).toBeInTheDocument();
  });

  it("복사를 켜지 않으면(위닝) 복사 버튼이 없다", () => {
    renderRow({ copyable: false });

    expect(
      screen.queryByRole("button", { name: "복사" }),
    ).not.toBeInTheDocument();
  });

  it("재발급 버튼이 onReissue 를 부른다", () => {
    const onReissue = vi.fn();
    renderRow({ onReissue });

    fireEvent.click(screen.getByRole("button", { name: "재발급" }));

    expect(onReissue).toHaveBeenCalled();
  });
});
