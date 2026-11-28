// openGoalSession 이 이용 거부 사유(tenantReason)를 스쿨멘토에서만 싣는지 고정한다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({
  result: { allowed: false, reason: null as string | null },
}));

vi.mock("../supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  createSupabaseAdmin: () => ({}),
}));
vi.mock("../serviceAccess.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../serviceAccess.js")>()),
  hasPaidServiceAccess: async () => access.result,
}));

import { openGoalSession } from "./repo.js";

// user() 미들웨어를 지난 요청의 컨텍스트. openGoalSession 은 c.var 의 DB 클라이언트와 본인 id 만 읽는다.
const req = { var: { supabaseAdmin: {}, user: { id: "u1" } } } as never;

beforeEach(() => vi.unstubAllEnvs());

describe("openGoalSession tenantReason", () => {
  it("스쿨멘토의 기관 거부 사유를 그대로 싣는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    access.result = { allowed: false, reason: "catch_all" };
    const session = await openGoalSession(req);
    expect(session.allowed).toBe(false);
    expect(session.tenantReason).toBe("catch_all");
  });

  it("위닝의 사유(period_expired 등)는 싣지 않는다", async () => {
    vi.stubEnv("SITE", "winning");
    access.result = { allowed: false, reason: "period_expired" };
    const session = await openGoalSession(req);
    expect(session.tenantReason).toBeNull();
  });
});
