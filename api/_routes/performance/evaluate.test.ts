import { describe, expect, test, vi } from "vitest";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeDb,
  createFakeSupabase,
} from "../../_lib/fakeSupabase.testkit.js";
import {
  authOnlyDb,
  SESSION_ID,
  validationFailedFor,
} from "../../_lib/performance/route.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import { app } from "../app.js";

const route = { app, path: "/api/performance/evaluate" };
const GOOD = { sessionId: SESSION_ID, submissionId: SESSION_ID };

describe("evaluate 요청 형식", () => {
  test.each([
    ["sessionId 없음", { ...GOOD, sessionId: undefined }, "sessionId"],
    [
      "submissionId 가 uuid 아님",
      { ...GOOD, submissionId: "x" },
      "submissionId",
    ],
    ["regenerate 가 불리언 아님", { ...GOOD, regenerate: "yes" }, "regenerate"],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, body, field) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { method: "POST", body });
      expect(validationFailedFor(res, field)).toBe(true);
    },
  );
});

describe("evaluate 도메인 규칙", () => {
  test("이용권이 없으면 403 NO_ENTITLEMENT 이고 charged 는 false 가 아니라 확장 멤버가 없다", async () => {
    const supabase = createFakeSupabase(
      createFakeDb({
        rpcs: {
          fn_tenant_usage_state: () => [{ allowed: false, deny_reason: null }],
          fn_program_access_state: () => [
            {
              allowed: false,
              program_key: "suhaeng",
              reason: null,
              expires_at: null,
            },
          ],
        },
      }),
    );
    Object.assign(supabase.auth, {
      getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
    });
    state.db = supabase;
    const res = await callRoute(route, { method: "POST", body: GOOD });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "NO_ENTITLEMENT" });
  });
});
