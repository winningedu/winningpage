import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  hasWebAnalyticsViewPermission,
  WEB_ANALYTICS_RESOURCE_KEY,
} from "./permission.js";

function fakeAdmin(
  rows: { resource_key: string; level: string }[] | null,
  error: unknown = null,
) {
  return {
    rpc: async () => ({ data: rows, error }),
  } as unknown as SupabaseClient;
}

it("리소스 키는 webAnalytics", () => {
  expect(WEB_ANALYTICS_RESOURCE_KEY).toBe("webAnalytics");
});

describe("hasWebAnalyticsViewPermission", () => {
  it("view 또는 edit 이면 true", async () => {
    for (const level of ["view", "edit"]) {
      expect(
        await hasWebAnalyticsViewPermission(
          fakeAdmin([{ resource_key: WEB_ANALYTICS_RESOURCE_KEY, level }]),
          "p1",
        ),
      ).toBe(true);
    }
  });

  it("다른 키만 있거나 none 이면 false", async () => {
    expect(
      await hasWebAnalyticsViewPermission(
        fakeAdmin([{ resource_key: "tenants", level: "edit" }]),
        "p1",
      ),
    ).toBe(false);
    expect(
      await hasWebAnalyticsViewPermission(
        fakeAdmin([
          { resource_key: WEB_ANALYTICS_RESOURCE_KEY, level: "none" },
        ]),
        "p1",
      ),
    ).toBe(false);
  });

  it("조회가 실패하면 예외를 던진다", async () => {
    await expect(
      hasWebAnalyticsViewPermission(fakeAdmin(null, { message: "x" }), "p1"),
    ).rejects.toThrow();
  });
});
