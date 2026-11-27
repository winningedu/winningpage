import { describe, expect, it, vi } from "vitest";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeDb,
  createFakeSupabase,
} from "../../_lib/fakeSupabase.testkit.js";
import {
  authOnlyDb,
  paidDb,
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

const route = { app, path: "/api/performance/discard-attachment" };
const GOOD = { sessionId: SESSION_ID, attachmentId: SESSION_ID };

describe("discard-attachment 요청 형식", () => {
  it.each([
    ["sessionId 없음", { ...GOOD, sessionId: undefined }, "sessionId"],
    ["sessionId 가 uuid 아님", { ...GOOD, sessionId: "x" }, "sessionId"],
    ["attachmentId 없음", { ...GOOD, attachmentId: undefined }, "attachmentId"],
    [
      "attachmentId 가 uuid 아님",
      { ...GOOD, attachmentId: "x" },
      "attachmentId",
    ],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, body, field) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { method: "POST", body });
      expect(validationFailedFor(res, field)).toBe(true);
    },
  );
});

describe("discard-attachment 도메인 규칙", () => {
  it("이용권이 없으면 403 NO_ENTITLEMENT 이다", async () => {
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

  it("남의 세션이면 403 NOT_SESSION_OWNER 이다", async () => {
    state.db = {
      ...paidDb(),
      from: () => {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.maybeSingle = async () => ({ data: null, error: null });
        return q;
      },
    };
    const res = await callRoute(route, { method: "POST", body: GOOD });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "NOT_SESSION_OWNER" });
  });
});
