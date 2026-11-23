// POST /api/selfeval/pick-records 의 연계 판정과 연계 편집 동작. DB 계층과 모델은 가짜로 바꾼다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
} from "../../_lib/fakeSupabase.testkit.js";

const m = vi.hoisted(() => ({
  state: { supabase: null as unknown },
  callStructured: vi.fn(),
  loadSession: vi.fn(),
  loadActivityRecords: vi.fn(),
  loadUsedActivityIds: vi.fn(),
  loadSessionActivities: vi.fn(),
  loadRecordLinks: vi.fn(),
  insertModelLinks: vi.fn(),
  saveRecordLink: vi.fn(),
  replaceSessionActivities: vi.fn(),
  updateSession: vi.fn(),
  claimStep: vi.fn(),
  finishStep: vi.fn(),
  terminateSession: vi.fn(),
  reverseCredit: vi.fn(),
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => m.state.supabase,
}));
vi.mock("../../_lib/ai/gemini.js", () => ({
  callStructured: m.callStructured,
}));
vi.mock("../../_lib/selfeval/access.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/access.js")>()),
  readSelfevalAccess: async () => ({ allowed: true }),
}));
vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  loadSession: m.loadSession,
  loadActivityRecords: m.loadActivityRecords,
  loadUsedActivityIds: m.loadUsedActivityIds,
  loadSessionActivities: m.loadSessionActivities,
  loadRecordLinks: m.loadRecordLinks,
  insertModelLinks: m.insertModelLinks,
  saveRecordLink: m.saveRecordLink,
  replaceSessionActivities: m.replaceSessionActivities,
  updateSession: m.updateSession,
  claimStep: m.claimStep,
  finishStep: m.finishStep,
  terminateSession: m.terminateSession,
  reverseCredit: m.reverseCredit,
}));

import handler from "./pick-records.js";

const record = (id: string, p: Record<string, unknown> = {}) => ({
  id,
  sourceProgram: "performance",
  status: "confirmed",
  gradeLabel: null,
  semester: null,
  subjectGroup: "수학",
  subject: "수학",
  topic: `주제${id}`,
  concept: `개념${id} 공통개념`,
  method: `방법${id}`,
  result: "결과를 보고 한계를 판단함 1 2",
  limitation: `한계${id}`,
  numbers: ["3", "4"],
  sources: [],
  createdAt: "2026-01-01T00:00:00Z",
  submittedAt: "2026-02-01T00:00:00Z",
  ...p,
});

const session = (stepState: unknown = {}) => ({
  id: "s1",
  profile_id: "me",
  status: "in_progress",
  current_step: 1,
  area: "subject",
  subject: "수학",
  activity_name: null,
  target_chars: 500,
  growth_snapshot: null,
  growth_applied: false,
  plan_item_id: null,
  step_state: stepState,
});

const okState = {
  steps: {
    link: {
      status: "ok",
      attempts: 1,
      startedAt: null,
      finishedAt: null,
      issues: [],
    },
  },
};

const call = (body: Record<string, unknown>) =>
  callHandler(
    handler as never,
    { sessionId: "s1", ...body },
    { authorization: "Bearer t" },
  );

beforeEach(() => {
  vi.resetAllMocks();
  const supabase = createFakeSupabase(createFakeDb({}));
  Object.assign(supabase.auth, {
    getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
  });
  m.state.supabase = supabase;
  m.loadSession.mockResolvedValue(session());
  m.loadActivityRecords.mockResolvedValue([
    record("core", { topic: "핵심주제" }),
    record("a"),
    record("b", { subjectGroup: "국어", subject: "국어" }),
  ]);
  m.loadUsedActivityIds.mockResolvedValue(new Set());
  m.loadSessionActivities.mockResolvedValue([]);
  m.loadRecordLinks.mockResolvedValue([]);
  m.claimStep.mockResolvedValue({ kind: "claimed", attempts: 1 });
  m.finishStep.mockResolvedValue(true);
});

const modelReply = (judgments: unknown[]) => ({
  text: JSON.stringify({ judgments }),
  finishReason: "STOP",
});

describe("pick-records link", () => {
  test("judges once with the model, stores new links and returns the checked list", async () => {
    m.callStructured.mockResolvedValue(
      modelReply([
        {
          from: "R0",
          to: "R1",
          linked: true,
          link_type: "background",
          strength: "explicit",
          quote_from: "개념core 공통개념",
          quote_to: "개념a 공통개념",
        },
      ]),
    );
    const res = await call({ action: "link" });
    expect(res.status).toBe(200);
    expect(m.callStructured).toHaveBeenCalledTimes(1);
    expect(m.claimStep.mock.calls[0]?.[3]).toBe("link");
    expect(m.insertModelLinks).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({
      ok: true,
      linkStatus: "ok",
      linkUnchecked: false,
      maxSelect: 7,
      cached: false,
    });
  });

  test("does not call the model again once the link step is done", async () => {
    m.loadSession.mockResolvedValue(session(okState));
    m.loadRecordLinks.mockResolvedValue([
      {
        fromId: "core",
        toId: "a",
        type: "background",
        strength: "explicit",
        source: "model",
        confirmed: false,
        deleted: false,
        note: null,
        quoteFrom: "x",
        quoteTo: "y",
      },
    ]);
    const res = await call({ action: "link" });
    expect(m.callStructured).not.toHaveBeenCalled();
    expect(m.claimStep).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ cached: true, linkStatus: "ok" });
    const body = res.body as {
      links: unknown[];
      candidates: {
        activity: { id: string };
        linkState: { linked: boolean } | null;
      }[];
    };
    expect(body.links).toHaveLength(1);
    expect(
      body.candidates.find((c) => c.activity.id === "a")?.linkState?.linked,
    ).toBe(true);
  });

  test("falls back to top 3 with linkUnchecked when the model fails, and keeps the session", async () => {
    m.callStructured.mockRejectedValue(new Error("boom"));
    const res = await call({ action: "link" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      linkUnchecked: true,
      linkStatus: "unchecked",
      maxSelect: 3,
      linkError: "MODEL_UPSTREAM_FAILED",
    });
    expect(m.terminateSession).not.toHaveBeenCalled();
    expect(m.insertModelLinks).not.toHaveBeenCalled();
  });

  test("falls back without ending the session when attempts are exhausted", async () => {
    m.claimStep.mockResolvedValue({ kind: "exhausted", attempts: 10 });
    const res = await call({ action: "link" });
    expect(res.body).toMatchObject({
      linkUnchecked: true,
      linkError: "ATTEMPTS_EXHAUSTED",
    });
    expect(m.callStructured).not.toHaveBeenCalled();
    expect(m.terminateSession).not.toHaveBeenCalled();
  });

  test("requires the basic input step first", async () => {
    m.loadSession.mockResolvedValue({ ...session(), current_step: 0 });
    const res = await call({ action: "link" });
    expect(res.status).toBe(409);
  });
});

describe("pick-records link edits", () => {
  const stored = {
    fromId: "core",
    toId: "a",
    type: "background",
    strength: "implicit",
    source: "model",
    confirmed: false,
    deleted: false,
    note: null,
    quoteFrom: "x",
    quoteTo: "y",
  };
  beforeEach(() => {
    m.loadSession.mockResolvedValue(session(okState));
    m.loadRecordLinks.mockResolvedValue([stored]);
  });

  test("delete-link marks the pair deleted", async () => {
    const res = await call({
      action: "delete-link",
      fromId: "a",
      toId: "core",
    });
    expect(res.status).toBe(200);
    expect(m.saveRecordLink).toHaveBeenCalledWith(
      expect.anything(),
      "s1",
      expect.objectContaining({ fromId: "core", toId: "a", deleted: true }),
    );
  });

  test("confirm-link confirms an implicit link", async () => {
    await call({ action: "confirm-link", fromId: "core", toId: "a" });
    expect(m.saveRecordLink).toHaveBeenCalledWith(
      expect.anything(),
      "s1",
      expect.objectContaining({ confirmed: true }),
    );
  });

  test("add-link needs a note and stores a confirmed explicit student link", async () => {
    const bad = await call({
      action: "add-link",
      fromId: "core",
      toId: "b",
      type: "complement",
      note: " ",
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ error: { code: "NOTE_REQUIRED" } });
    expect(m.saveRecordLink).not.toHaveBeenCalled();
    const ok = await call({
      action: "add-link",
      fromId: "core",
      toId: "b",
      type: "complement",
      note: "국어에서 같은 소재를 다뤘어요",
    });
    expect(ok.status).toBe(200);
    expect(m.saveRecordLink).toHaveBeenCalledWith(
      expect.anything(),
      "s1",
      expect.objectContaining({
        source: "student",
        strength: "explicit",
        confirmed: true,
        note: "국어에서 같은 소재를 다뤘어요",
      }),
    );
  });

  test("delete-link on a missing pair is 404", async () => {
    const res = await call({ action: "delete-link", fromId: "a", toId: "b" });
    expect(res.status).toBe(404);
  });
});

describe("pick-records select limit", () => {
  test("rejects a selection above N with the count in the message", async () => {
    m.loadSession.mockResolvedValue({ ...session(), target_chars: 210 });
    m.loadActivityRecords.mockResolvedValue(
      ["core", "a", "b", "c"].map((id) => record(id)),
    );
    const res = await call({
      action: "select",
      coreId: "core",
      supportIds: ["a", "b", "c"],
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "TOO_MANY_SUPPORT",
        message: "활동은 최대 3건까지 고를 수 있어요.",
      },
    });
  });
});
