import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import RequireEntitlement from "./RequireEntitlement";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
const fetchEntitlementMock = vi.hoisted(() => vi.fn());

vi.mock("@/config/site", () => ({
  site: { features: siteState },
}));
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "u1", isReady: true }),
}));
vi.mock("@/lib/entitlement", () => ({
  fetchEntitlement: fetchEntitlementMock,
}));

const denied = (tenantReason: string | null) => ({
  allowed: false,
  quotaRemaining: null,
  quotaTotal: null,
  planEndsAt: null,
  planLabel: null,
  tenantReason,
  limitKind: null,
});

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/app/growth"]}>
      <Routes>
        <Route
          path="/app/growth"
          element={
            <RequireEntitlement serviceKey="growth">
              <p>안쪽 화면</p>
            </RequireEntitlement>
          }
        />
        <Route path="/pricing" element={<p>결제 페이지</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  queryClient.clear();
  fetchEntitlementMock.mockReset();
});
afterEach(cleanup);

describe("RequireEntitlement forbidden", () => {
  it("위닝은 결제 페이지로 보낸다", async () => {
    siteState.tenantServiceGate = false;
    fetchEntitlementMock.mockResolvedValue(denied(null));
    renderGuard();
    expect(await screen.findByText("결제 페이지")).toBeInTheDocument();
  });

  it("스쿨멘토는 이동하지 않고 사유 문구를 보인다", async () => {
    siteState.tenantServiceGate = true;
    fetchEntitlementMock.mockResolvedValue(denied("outside_period"));
    renderGuard();
    expect(
      await screen.findByText(
        "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("결제 페이지")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("스쿨멘토 기타 소속은 소속코드 입력 버튼을 보인다", async () => {
    siteState.tenantServiceGate = true;
    fetchEntitlementMock.mockResolvedValue(denied("catch_all"));
    renderGuard();
    expect(
      await screen.findByRole("button", { name: "소속코드 입력" }),
    ).toBeInTheDocument();
  });
});
