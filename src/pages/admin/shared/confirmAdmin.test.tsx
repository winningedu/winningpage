import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ConfirmAdminHost, confirmAdmin } from "./confirmAdmin";

afterEach(() => {
  // 열려 있는 확인창이 다음 테스트로 새지 않게 닫는다.
  const cancel = screen.queryByRole("button", { name: "취소" });
  if (cancel) fireEvent.click(cancel);
});

describe("confirmAdmin", () => {
  test("확인 버튼을 누르면 true 로 끝난다", async () => {
    render(<ConfirmAdminHost />);

    let result: Promise<boolean> | undefined;
    act(() => {
      result = confirmAdmin({
        title: "정말 삭제하시겠습니까?",
        confirmLabel: "삭제",
      });
    });

    expect(await screen.findByText("정말 삭제하시겠습니까?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await expect(result).resolves.toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
});
