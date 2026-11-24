import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
} from "react-router";
import { describe, expect, test } from "vitest";
import { ConfirmAdminHost } from "./confirmAdmin";
import { useUnsavedGuard } from "./useUnsavedGuard";

function Screen({ dirty }: { dirty: boolean }) {
  useUnsavedGuard(dirty, (next) => next.pathname.startsWith("/member/1"));
  const location = useLocation();
  return (
    <div>
      <p>현재 {location.pathname}</p>
      <Link to="/member/1/pay">같은 회원 탭</Link>
      <Link to="/other">다른 화면</Link>
    </div>
  );
}

function renderScreen(dirty: boolean) {
  const router = createMemoryRouter(
    [{ path: "*", element: <Screen dirty={dirty} /> }],
    { initialEntries: ["/member/1"] },
  );
  render(
    <>
      <RouterProvider router={router} />
      <ConfirmAdminHost />
    </>,
  );
  return router;
}

describe("useUnsavedGuard", () => {
  test("고친 내용이 있으면 다른 화면으로 나갈 때 확인을 묻고 계속 수정하면 머문다", async () => {
    const router = renderScreen(true);

    fireEvent.click(screen.getByRole("link", { name: "다른 화면" }));

    expect(
      await screen.findByText("저장하지 않은 변경이 있어요"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("이 화면을 나가면 고친 내용이 사라져요."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계속 수정" }));

    await waitFor(() =>
      expect(screen.queryByText("저장하지 않은 변경이 있어요")).toBeNull(),
    );
    expect(router.state.location.pathname).toBe("/member/1");
  });

  test("나가기를 고르면 이동한다", async () => {
    const router = renderScreen(true);

    fireEvent.click(screen.getByRole("link", { name: "다른 화면" }));
    fireEvent.click(await screen.findByRole("button", { name: "나가기" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
  });

  test("같은 회원 안의 탭 이동은 막지 않는다", async () => {
    const router = renderScreen(true);

    fireEvent.click(screen.getByRole("link", { name: "같은 회원 탭" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/member/1/pay"),
    );
    expect(screen.queryByText("저장하지 않은 변경이 있어요")).toBeNull();
  });

  test("고친 내용이 없으면 막지 않는다", async () => {
    const router = renderScreen(false);

    fireEvent.click(screen.getByRole("link", { name: "다른 화면" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
  });

  test("고친 내용이 있으면 새로고침과 탭 닫기에서 브라우저 확인이 뜬다", () => {
    renderScreen(true);

    const event = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  test("고친 내용이 없으면 beforeunload 를 막지 않는다", () => {
    renderScreen(false);

    const event = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });
});
