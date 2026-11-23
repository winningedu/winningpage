import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimStep: vi.fn(),
  finishStep: vi.fn(),
  terminateSession: vi.fn(),
  reverseCredit: vi.fn(),
  loadRecordLinks: vi.fn(),
  insertModelLinks: vi.fn(),
}));
vi.mock("../db.js", () => ({
  claimStep: mocks.claimStep,
  finishStep: mocks.finishStep,
  terminateSession: mocks.terminateSession,
  reverseCredit: mocks.reverseCredit,
  loadRecordLinks: mocks.loadRecordLinks,
  insertModelLinks: mocks.insertModelLinks,
}));

import type { SessionRow } from "../rows.js";
import type { ActivityRecordLike, CandidateRow, RecordLink } from "../types.js";
import { runLinkStep } from "./link.js";

const db = {} as never;
const callStructured = vi.fn();
const deps = () => ({
  callStructured: callStructured as never,
  now: () => new Date().toISOString(),
  startedAt: Date.now(),
});
const session = {
  id: "s1",
  area: "subject",
  subject: "수학",
  activity_name: null,
} as SessionRow;

const row = (id: string, score: number | null): CandidateRow => ({
  activity: {
    id,
    sourceProgram: "performance",
    status: "confirmed",
    gradeLabel: null,
    semester: null,
    subjectGroup: "수학",
    subject: "수학",
    topic: `주제${id}`,
    concept: `개념${id} 공통개념`,
    method: null,
    result: null,
    limitation: null,
    numbers: [],
    sources: [],
    createdAt: "2026-01-01T00:00:00Z",
    submittedAt: "2026-02-01T00:00:00Z",
  } as ActivityRecordLike,
  fit:
    score === null ? null : { activityId: id, score, signals: [], reasons: [] },
  unavailableReason: null,
  alreadyUsed: false,
  role: null,
});

const reply = (judgments: unknown[]) => ({
  text: JSON.stringify({ judgments }),
  finishReason: "STOP",
});
const yes = (from: string, to: string, qf: string, qt: string) => ({
  from,
  to,
  linked: true,
  link_type: "background",
  strength: "explicit",
  quote_from: qf,
  quote_to: qt,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.claimStep.mockResolvedValue({ kind: "claimed", attempts: 1 });
  mocks.finishStep.mockResolvedValue(true);
  mocks.loadRecordLinks.mockResolvedValue([]);
});

describe("runLinkStep", () => {
  it("calls the model once with the core and fit-ordered candidates, then stores accepted links", async () => {
    callStructured.mockResolvedValue(
      reply([yes("R0", "R1", "개념core 공통개념", "개념hi 공통개념")]),
    );
    const out = await runLinkStep(
      db,
      "u1",
      session,
      deps(),
      [row("core", 70), row("lo", 45), row("hi", 90), row("plan", null)],
      "core",
    );
    expect(callStructured).toHaveBeenCalledTimes(1);
    const user = callStructured.mock.calls[0]?.[1] as string;
    expect(user.indexOf("개념hi")).toBeLessThan(user.indexOf("개념lo"));
    expect(user).not.toContain("개념plan");
    expect(mocks.claimStep).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "link",
      expect.any(Number),
    );
    expect(out).toMatchObject({ kind: "ok" });
    const inserted = mocks.insertModelLinks.mock.calls[0]?.[2] as RecordLink[];
    expect(inserted.map((l) => [l.fromId, l.toId])).toEqual([["core", "hi"]]);
  });

  it("does not insert a pair that is already stored, deleted or not", async () => {
    mocks.loadRecordLinks.mockResolvedValue([
      { fromId: "hi", toId: "core", deleted: true } as RecordLink,
    ]);
    callStructured.mockResolvedValue(
      reply([yes("R0", "R1", "개념core 공통개념", "개념hi 공통개념")]),
    );
    await runLinkStep(
      db,
      "u1",
      session,
      deps(),
      [row("core", 70), row("hi", 90)],
      "core",
    );
    expect(mocks.insertModelLinks).toHaveBeenCalledWith(db, "s1", []);
  });

  it("sends at most 19 candidates besides the core", async () => {
    callStructured.mockResolvedValue(reply([]));
    const rows = [
      row("core", 70),
      ...Array.from({ length: 25 }, (_, i) => row(`c${i}`, 50)),
    ];
    await runLinkStep(db, "u1", session, deps(), rows, "core");
    const user = callStructured.mock.calls[0]?.[1] as string;
    expect(user).toContain('"R19"');
    expect(user).not.toContain('"R20"');
  });

  it("skips the model when there is no candidate to compare", async () => {
    const out = await runLinkStep(
      db,
      "u1",
      session,
      deps(),
      [row("core", 70)],
      "core",
    );
    expect(out).toEqual({ kind: "skipped" });
    expect(mocks.claimStep).not.toHaveBeenCalled();
  });

  it("does not end the session when attempts run out", async () => {
    mocks.claimStep.mockResolvedValue({ kind: "exhausted", attempts: 10 });
    const out = await runLinkStep(
      db,
      "u1",
      session,
      deps(),
      [row("core", 70), row("a", 60)],
      "core",
    );
    expect(out).toEqual({ kind: "exhausted", terminal: false });
    expect(mocks.terminateSession).not.toHaveBeenCalled();
  });

  it("returns a failure outcome when the model keeps failing, without storing links", async () => {
    callStructured.mockRejectedValue(new Error("boom"));
    const out = await runLinkStep(
      db,
      "u1",
      session,
      deps(),
      [row("core", 70), row("a", 60)],
      "core",
    );
    expect(out).toMatchObject({ kind: "failure", terminal: false });
    expect(mocks.insertModelLinks).not.toHaveBeenCalled();
  });
});
