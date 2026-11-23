import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  HQ_DASHBOARD_RESOURCE_KEY,
  hasHqDashboardViewPermission,
} from "./permission.js";

function fakeAdmin(
  rows: { resource_key: string; level: string }[] | null,
  error: unknown = null,
) {
  return {
    rpc: async () => ({ data: rows, error }),
  } as unknown as SupabaseClient;
}

it("리소스 키는 hqDashboard", () => {
  expect(HQ_DASHBOARD_RESOURCE_KEY).toBe("hqDashboard");
});

describe("hasHqDashboardViewPermission", () => {
  it("view 또는 edit 이면 true", async () => {
    for (const level of ["view", "edit"]) {
      expect(
        await hasHqDashboardViewPermission(
          fakeAdmin([{ resource_key: HQ_DASHBOARD_RESOURCE_KEY, level }]),
          "p1",
        ),
      ).toBe(true);
    }
  });

  it("다른 키만 있거나 none 이면 false", async () => {
    expect(
      await hasHqDashboardViewPermission(
        fakeAdmin([{ resource_key: "tenants", level: "edit" }]),
        "p1",
      ),
    ).toBe(false);
    expect(
      await hasHqDashboardViewPermission(
        fakeAdmin([{ resource_key: HQ_DASHBOARD_RESOURCE_KEY, level: "none" }]),
        "p1",
      ),
    ).toBe(false);
  });

  it("조회가 실패하면 예외를 던진다", async () => {
    await expect(
      hasHqDashboardViewPermission(fakeAdmin(null, { message: "x" }), "p1"),
    ).rejects.toThrow();
  });
});
