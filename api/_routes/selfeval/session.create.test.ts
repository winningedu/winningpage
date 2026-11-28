// POST /api/selfeval/session create: 한도, 미완 세션, 성장 스냅샷 읽기는 함께 시작하되 응답 우선순위는 그대로다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";

const m = vi.hoisted(() => ({
  state: { admin: null as unknown },
  readSelfevalAccess: vi.fn(),
  readSelfevalQuota: vi.fn(),
  loadOpenSession: vi.fn(),
  loadGrowthSnapshot: vi.fn(),
  insertSession: vi.fn(),
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => m.state.admin,
}));
vi.mock("../../_lib/selfeval/access.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/access.js")>()),
  readSelfevalAccess: m.readSelfevalAccess,
  readSelfevalQuota: m.readSelfevalQuota,
}));
vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  loadOpenSession: m.loadOpenSession,
  loadGrowthSnapshot: m.loadGrowthSnapshot,
  insertSession: m.insertSession,
}));

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/session" };

const CREATE_BODY = {
  action: "create",
  academicYear: 2026,
  gradeLabel: "고2",
  semester: 1,
  area: "subject",
  subject: "생명과학",
  targetChars: 500,
  targetCharsMode: "with_space",
  career: { career: null, department: null, universities: [] },
  growthApplied: false,
};

const create = () => callRoute(route, { method: "POST", body: CREATE_BODY });

beforeEach(() => {
  vi.resetAllMocks();
  m.state.admin = createAdminFake({ permissions: [] });
  m.readSelfevalAccess.mockResolvedValue({ allowed: true, tenantReason: null });
  m.readSelfevalQuota.mockResolvedValue({
    quotaRemaining: null,
    capReason: null,
  });
  m.loadOpenSession.mockResolvedValue(null);
  m.loadGrowthSnapshot.mockResolvedValue(null);
  m.insertSession.mockResolvedValue({ ok: false });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("selfeval/session create 읽기", () => {
  test("한도, 미완 세션, 성장 스냅샷 읽기를 함께 시작한다", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    m.readSelfevalQuota.mockReturnValue(
      gate.then(() => ({ quotaRemaining: null, capReason: null })),
    );
    m.loadOpenSession.mockReturnValue(gate.then(() => null));
    m.loadGrowthSnapshot.mockReturnValue(gate.then(() => null));

    const request = create();
    await vi.waitFor(() => {
      expect(m.readSelfevalQuota).toHaveBeenCalledTimes(1);
      expect(m.loadOpenSession).toHaveBeenCalledTimes(1);
      expect(m.loadGrowthSnapshot).toHaveBeenCalledTimes(1);
    });
    release();

    await request;
  });

  test("한도가 0 이면 성장 스냅샷 읽기가 실패해도 409 QUOTA_EXHAUSTED 다", async () => {
    m.readSelfevalQuota.mockResolvedValue({
      quotaRemaining: 0,
      capReason: null,
    });
    m.loadGrowthSnapshot.mockRejectedValue(new Error("읽지 않아야 하는 결과"));

    const res = await create();

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "QUOTA_EXHAUSTED" });
  });

  test("미완 세션이 있으면 성장 스냅샷 읽기가 실패해도 409 SESSION_OPEN 이다", async () => {
    m.loadOpenSession.mockResolvedValue({ id: "open-1" });
    m.loadGrowthSnapshot.mockRejectedValue(new Error("읽지 않아야 하는 결과"));

    const res = await create();

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "SESSION_OPEN",
      openSessionId: "open-1",
    });
  });
});
