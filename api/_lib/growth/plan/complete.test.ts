import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../intake/collectDb.js";
import { completePlanItemFromProgram } from "./complete.js";
import * as planDb from "./planDb.js";
import type { PlanItemRow } from "./types.js";

vi.mock("./planDb.js", () => ({
  loadPlanItem: vi.fn(),
  updatePlanItem: vi.fn(),
}));

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const REF_A = "22222222-2222-4222-8222-222222222222";
const REF_B = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-10-06T00:00:00.000Z";
const db = {} as Db;

function row(over: Partial<PlanItemRow> = {}): PlanItemRow {
  return {
    id: ITEM_ID,
    report_id: "r1",
    profile_id: "u1",
    program: "deep",
    title: "t",
    description: null,
    priority: "required",
    axis: null,
    category: null,
    period: "semester",
    period_label: null,
    deadline: null,
    status: "pending",
    done_source_program: null,
    done_ref_id: null,
    done_at: null,
    carried_from_report_id: null,
    sort_order: 0,
    updated_at: "2026-10-05T00:00:00.000Z",
    ...over,
  };
}

const input = {
  itemId: ITEM_ID,
  program: "deep" as const,
  refId: REF_A,
  nowIso: NOW,
};

describe("completePlanItemFromProgram", () => {
  beforeEach(() => vi.resetAllMocks());

  it("항목이 없으면 ITEM_NOT_FOUND", async () => {
    vi.mocked(planDb.loadPlanItem).mockResolvedValue(null);
    const r = await completePlanItemFromProgram(db, "u1", input);
    expect(r).toMatchObject({ ok: false, code: "ITEM_NOT_FOUND" });
  });

  it("프로그램이 다르면 PROGRAM_MISMATCH 이고 쓰지 않는다", async () => {
    vi.mocked(planDb.loadPlanItem).mockResolvedValue(row({ program: "self" }));
    const r = await completePlanItemFromProgram(db, "u1", input);
    expect(r).toMatchObject({ ok: false, code: "PROGRAM_MISMATCH" });
    expect(planDb.updatePlanItem).not.toHaveBeenCalled();
  });

  it("미완 항목은 확정하고 읽은 updated_at 으로 잠근다", async () => {
    const done = row({ status: "done", done_ref_id: REF_A });
    vi.mocked(planDb.loadPlanItem).mockResolvedValue(row());
    vi.mocked(planDb.updatePlanItem).mockResolvedValue(done);
    const r = await completePlanItemFromProgram(db, "u1", input);
    expect(r).toEqual({ ok: true, changed: true, item: done });
    expect(planDb.updatePlanItem).toHaveBeenCalledWith(
      db,
      "u1",
      ITEM_ID,
      expect.objectContaining({
        status: "done",
        done_source_program: "deep",
        done_ref_id: REF_A,
        done_at: NOW,
      }),
      "2026-10-05T00:00:00.000Z",
    );
  });

  it("같은 refId 재확정은 변경 없이 성공", async () => {
    vi.mocked(planDb.loadPlanItem).mockResolvedValue(
      row({ status: "done", done_ref_id: REF_A }),
    );
    const r = await completePlanItemFromProgram(db, "u1", input);
    expect(r).toMatchObject({
      ok: true,
      changed: false,
      reason: "duplicate_confirm",
    });
    expect(planDb.updatePlanItem).not.toHaveBeenCalled();
  });

  it("다른 refId 는 먼저 확정된 것을 유지한다", async () => {
    vi.mocked(planDb.loadPlanItem).mockResolvedValue(
      row({ status: "done", done_ref_id: REF_B }),
    );
    const r = await completePlanItemFromProgram(db, "u1", input);
    expect(r).toMatchObject({
      ok: true,
      changed: false,
      reason: "already_done",
    });
  });

  it("갱신이 0행이면 CONFLICT", async () => {
    vi.mocked(planDb.loadPlanItem).mockResolvedValue(row());
    vi.mocked(planDb.updatePlanItem).mockResolvedValue(null);
    const r = await completePlanItemFromProgram(db, "u1", input);
    expect(r).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});
