import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddonProduct } from "@/lib/products";

const mocks = vi.hoisted(() => ({
  addons: [] as unknown[],
  allowed: {} as Record<string, boolean | null>,
  apiFetch: vi.fn(),
  entitlementCalls: [] as string[],
}));

vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "student-1" } }),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.in = () => Promise.resolve({ data: [], error: null });
      return builder;
    },
  },
}));
vi.mock("@/lib/products", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/products")>()),
  useProducts: () => ({
    services: [],
    addons: mocks.addons,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMatchedTenantIds: () => ({ ids: [], loaded: true }),
}));
vi.mock("@/lib/entitlement", () => ({
  fetchEntitlement: async (serviceKey: string) => {
    mocks.entitlementCalls.push(serviceKey);
    return { allowed: mocks.allowed[serviceKey] ?? null };
  },
}));
vi.mock("@/lib/parentLink", () => ({
  getApprovedParentLink: async () => ({ parentId: "parent-1" }),
}));
vi.mock("@/lib/apiFetch", () => ({
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
  apiFetch: mocks.apiFetch,
}));

import StudentEnrollmentRequest from "./StudentEnrollmentRequest";

function addon(serviceKey: string, serviceName: string): AddonProduct {
  return {
    id: `${serviceKey}-extra`,
    name: `[추가 1회] ${serviceName}`,
    listPrice: 2000,
    price: 2000,
    badge: null,
    recommended: false,
    isOrderable: true,
    tenantId: null,
    saleEndsAt: null,
    serviceKey,
    serviceName,
  };
}

beforeEach(() => {
  mocks.addons = [
    addon("suhaeng", "위닝 수행평가"),
    addon("inquiry", "위닝 심화탐구"),
  ];
  mocks.allowed = { suhaeng: true, inquiry: false };
  mocks.apiFetch.mockReset();
  mocks.entitlementCalls = [];
});

describe("StudentEnrollmentRequest 추가 이용권", () => {
  it("이용권이 있는 서비스의 추가 이용권만 보인다", async () => {
    render(<StudentEnrollmentRequest />);
    expect(await screen.findByText("[추가 1회] 위닝 수행평가")).toBeTruthy();
    expect(screen.queryByText("[추가 1회] 위닝 심화탐구")).toBeNull();
  });

  it("이용권이 있는 서비스가 없으면 섹션을 그리지 않는다", async () => {
    mocks.allowed = { suhaeng: false, inquiry: null };
    render(<StudentEnrollmentRequest />);
    await waitFor(() => expect(mocks.entitlementCalls).toHaveLength(2));
    await Promise.resolve();
    expect(screen.queryByText(/이용권 추가/)).toBeNull();
  });

  it("2회를 고르면 합계가 4,000원이고 요청 body 에 수량이 담긴다", async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        orderId: "order_1",
        amount: 4000,
        parentName: "학부모",
      }),
    });
    render(<StudentEnrollmentRequest />);
    const plus = await screen.findByRole("button", {
      name: "위닝 수행평가 추가 수량 늘리기",
    });
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(screen.getAllByText("4,000원").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "결제 요청" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalled());
    const body = JSON.parse(mocks.apiFetch.mock.calls[0]?.[1].body);
    expect(body.items).toEqual([{ id: "suhaeng-extra", quantity: 2 }]);
  });

  it("이용권 없음 응답이면 안내 문구를 모달로 보인다", async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "addon_requires_live_grant" }),
    });
    render(<StudentEnrollmentRequest />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "위닝 수행평가 추가 수량 늘리기",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "결제 요청" }));
    expect(
      await screen.findByText(
        "이용 중인 서비스의 추가 이용권만 요청할 수 있어요.",
      ),
    ).toBeTruthy();
  });
});
