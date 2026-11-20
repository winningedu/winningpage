import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

  test("취소 버튼은 false 로 끝나고 취소가 왼쪽, 실행이 오른쪽에 놓인다", async () => {
    render(<ConfirmAdminHost />);

    let result: Promise<boolean> | undefined;
    act(() => {
      result = confirmAdmin({ title: "진행할까요?" });
    });

    const dialog = await screen.findByRole("alertdialog");
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "취소",
      "확인",
    ]);
    fireEvent.click(buttons[0]);

    await expect(result).resolves.toBe(false);
  });

  test("Esc 는 false 로 끝난다", async () => {
    render(<ConfirmAdminHost />);

    let result: Promise<boolean> | undefined;
    act(() => {
      result = confirmAdmin({ title: "진행할까요?" });
    });

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await expect(result).resolves.toBe(false);
  });

  test("destructive 이면 처음 포커스가 취소에 가고 실행 버튼은 destructive 모양이다", async () => {
    render(<ConfirmAdminHost />);

    act(() => {
      void confirmAdmin({
        title: "관리자 권한을 줄까요?",
        description: "전 회원 정보를 볼 수 있게 됩니다.",
        confirmLabel: "권한 부여",
        destructive: true,
      });
    });

    const cancel = await screen.findByRole("button", { name: "취소" });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(screen.getByRole("button", { name: "권한 부여" })).toHaveAttribute(
      "data-slot",
      "alert-dialog-action",
    );
    expect(screen.getByRole("button", { name: "권한 부여" }).className).toMatch(
      /text-destructive/,
    );
  });

  test("destructive 가 아니면 처음 포커스가 실행 버튼에 간다", async () => {
    render(<ConfirmAdminHost />);

    act(() => {
      void confirmAdmin({ title: "진행할까요?" });
    });

    const action = await screen.findByRole("button", { name: "확인" });
    await waitFor(() => expect(action).toHaveFocus());
  });

  test("열려 있는 동안 들어온 두 번째 호출은 줄을 서고, 앞 창이 닫힌 뒤 뜬다", async () => {
    render(<ConfirmAdminHost />);

    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    act(() => {
      first = confirmAdmin({ title: "첫 번째" });
      second = confirmAdmin({ title: "두 번째" });
    });

    expect(await screen.findByText("첫 번째")).toBeVisible();
    expect(screen.queryByText("두 번째")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await expect(first).resolves.toBe(true);

    expect(await screen.findByText("두 번째")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await expect(second).resolves.toBe(false);
  });
});
