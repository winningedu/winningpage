// POST /api/selfeval/manual-logs 의 이용권 확인. DB 계층과 모델은 가짜로 바꾼다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
} from "../../_lib/fakeSupabase.testkit.js";

const m = vi.hoisted(() => ({
  state: { supabase: null as unknown },
  access: vi.fn(),
  loadSession: vi.fn(),
  claimUploadAttempt: vi.fn(),
  extractText: vi.fn(),
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => m.state.supabase,
}));
vi.mock("../../_lib/selfeval/access.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/access.js")>()),
  readSelfevalAccess: m.access,
}));
vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  loadSession: m.loadSession,
}));
vi.mock("../../_lib/selfeval/manualLogsDb.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../_lib/selfeval/manualLogsDb.js")
  >()),
  claimUploadAttempt: m.claimUploadAttempt,
}));
vi.mock("../../_lib/selfeval/manualLogsModel.js", () => ({
  extractFromFile: vi.fn(),
  extractFromText: m.extractText,
}));

import handler from "./manual-logs.js";

const SID = "11111111-1111-4111-8111-111111111111";
const call = (body: Record<string, unknown>) =>
  callHandler(
    handler as never,
    { sessionId: SID, ...body },
    { authorization: "Bearer t" },
  );

beforeEach(() => {
  vi.resetAllMocks();
  const supabase = createFakeSupabase(createFakeDb({}));
  Object.assign(supabase.auth, {
    getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
  });
  m.state.supabase = supabase;
  m.access.mockResolvedValue({ allowed: true, tenantReason: null });
  m.loadSession.mockResolvedValue({
    id: SID,
    status: "in_progress",
    academic_year: 2026,
  });
  m.claimUploadAttempt.mockResolvedValue(true);
});

describe("manual-logs access", () => {
  test("answers 409 SESSION_NOT_OPEN when the claim finds the session locked", async () => {
    const { SessionNotOpenError } = await import(
      "../../_lib/selfeval/manualLogsDb.js"
    );
    m.claimUploadAttempt.mockRejectedValue(new SessionNotOpenError());
    const res = await call({ action: "upload", text: "수행 기록" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "SESSION_NOT_OPEN" } });
    expect(m.extractText).not.toHaveBeenCalled();
  });

  test("rejects a student without an entitlement before reading the session or calling the model", async () => {
    m.access.mockResolvedValue({ allowed: false, tenantReason: null });
    const res = await call({ action: "upload", text: "수행 기록" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "NO_ENTITLEMENT" } });
    expect(m.loadSession).not.toHaveBeenCalled();
    expect(m.claimUploadAttempt).not.toHaveBeenCalled();
    expect(m.extractText).not.toHaveBeenCalled();
  });

  test("counts the upload attempt in the database, not in instance memory", async () => {
    m.extractText.mockResolvedValue(
      JSON.stringify({
        contains_person_name: false,
        memos: [{ written_at: "2026-04-03", text: "광합성 실험을 했다" }],
      }),
    );
    m.claimUploadAttempt.mockResolvedValue(false);
    const res = await call({ action: "upload", text: "수행 기록" });
    expect(res.status).toBe(429);
    expect(m.claimUploadAttempt).toHaveBeenCalledWith(
      expect.anything(),
      "me",
      SID,
      10,
    );
    expect(m.extractText).not.toHaveBeenCalled();
  });
});
