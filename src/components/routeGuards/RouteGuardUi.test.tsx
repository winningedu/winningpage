import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ServiceBlockedError } from "@/lib/routeMiddleware";
import { GoalAccessBoundary } from "./RouteGuardUi";

function renderBoundary(error: Error) {
  const router = createMemoryRouter([
    {
      path: "/",
      loader: () => {
        throw error;
      },
      Component: () => null,
      ErrorBoundary: GoalAccessBoundary,
    },
  ]);
  return render(<RouterProvider router={router} />);
}

describe("GoalAccessBoundary 서비스 막힘", () => {
  it("사유 문구를 보이고 구매 링크는 없다", async () => {
    renderBoundary(new ServiceBlockedError("term_cap"));
    expect(
      await screen.findByText(
        "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("기타 소속은 소속코드 입력 버튼을 보인다", async () => {
    renderBoundary(new ServiceBlockedError("catch_all"));
    expect(
      await screen.findByRole("button", { name: "소속코드 입력" }),
    ).toBeInTheDocument();
  });
});
