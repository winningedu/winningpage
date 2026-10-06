import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, getDemoAccessStateMock, alertMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getDemoAccessStateMock: vi.fn(),
  alertMock: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

vi.mock("@/lib/demoAccess", () => ({
  getDemoAccessState: getDemoAccessStateMock,
}));

vi.mock("@/lib/paidServiceAccess", () => ({
  alertServiceNotReady: alertMock,
}));

import InDepthResearch from "./InDepthResearch";

function renderPage() {
  render(
    <MemoryRouter>
      <InDepthResearch />
    </MemoryRouter>,
  );
}

describe("InDepthResearch 히어로 CTA", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    getDemoAccessStateMock.mockReset();
    alertMock.mockReset();
  });

  it("로그인 상태면 /app/inquiry 로 이동한다", async () => {
    getDemoAccessStateMock.mockResolvedValue("user");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/inquiry"),
    );
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("어드민도 데모 라우트 없이 /app/inquiry 로 이동한다", async () => {
    getDemoAccessStateMock.mockResolvedValue("admin");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/inquiry"),
    );
  });

  it("비로그인이면 로그인 후 /app/inquiry 로 돌아오도록 보낸다", async () => {
    getDemoAccessStateMock.mockResolvedValue("guest");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent("/app/inquiry")}`,
      ),
    );
    expect(alertMock).not.toHaveBeenCalled();
  });
});
