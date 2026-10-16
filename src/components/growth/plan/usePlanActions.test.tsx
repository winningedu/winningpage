import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }));

vi.mock("@/lib/growth/api", () => ({ patchPlanItem: patchMock }));

import { growthQueryKeys } from "@/lib/growth/queries";
import { usePlanActions } from "./usePlanActions";

const item = {
  id: "i1",
  program: "school",
  done: false,
  doneSource: null,
  doneAt: null,
};

const planResponse = {
  ok: true,
  plan: {
    groups: [{ items: [item] }],
    carried: [],
    progress: { total: 1, done: 0, remaining: 1, percent: 0 },
    metrics: null,
    nextDeadline: null,
  },
};

describe("usePlanActions.check", () => {
  it("낙관적 갱신 전에 같은 키의 진행 중 조회를 취소한다", async () => {
    const client = new QueryClient();
    const key = growthQueryKeys.plan("u1");
    client.setQueryData(key, planResponse);
    const order: string[] = [];
    vi.spyOn(client, "cancelQueries").mockImplementation(async (filters) => {
      order.push(`cancel:${JSON.stringify(filters?.queryKey)}`);
    });
    const setSpy = vi.spyOn(client, "setQueryData");
    setSpy.mockImplementation(((k: unknown, u: unknown) => {
      order.push("set");
      return QueryClient.prototype.setQueryData.call(
        client,
        k as never,
        u as never,
      );
    }) as never);
    patchMock.mockResolvedValue({ kind: "timeout" });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePlanActions("u1"), { wrapper });
    await act(async () => {
      await result.current.check("i1", true);
    });

    expect(order[0]).toBe(`cancel:${JSON.stringify(key)}`);
    expect(order[1]).toBe("set");
  });
});
