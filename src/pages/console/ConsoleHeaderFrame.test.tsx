// 콘솔 헤더 틀: 인쇄 화면이 위쪽 4rem 여백을 걷어낼 수 있도록 본문 칸에 이름표를 둔다.

import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";

vi.mock("@/components/Header", () => ({ default: () => <header /> }));

import ConsoleHeaderFrame from "./ConsoleHeaderFrame";

it("본문 칸은 pt-16 을 유지하고 console-frame-body 이름표를 가진다", () => {
  const router = createMemoryRouter(
    [{ path: "/", Component: ConsoleHeaderFrame, children: [{ index: true }] }],
    { initialEntries: ["/"] },
  );
  const { container } = render(<RouterProvider router={router} />);
  const body = container.querySelector(".console-frame-body");
  expect(body?.classList.contains("pt-16")).toBe(true);
});
