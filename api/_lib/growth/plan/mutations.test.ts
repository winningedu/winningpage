import { describe, expect, test } from "vitest";
import { decideMutation, validatePlanItemBody } from "./mutations.js";
import type { PlanItemRow } from "./types.js";

const ID = "3f2b8c1e-9a4d-4e6b-8c2a-1d5e7f9a0b3c";
const REF = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("validatePlanItemBody", () => {
  test("check 는 itemId 와 boolean done 을 받는다", () => {
    expect(
      validatePlanItemBody({ action: "check", itemId: ID, done: true }),
    ).toEqual({
      ok: true,
      action: { action: "check", itemId: ID, done: true },
    });
    expect(
      validatePlanItemBody({ action: "check", itemId: ID, done: false }).ok,
    ).toBe(true);
  });

  test("본문이 객체가 아니거나 알 수 없는 action 이면 거절한다", () => {
    expect(validatePlanItemBody(null).ok).toBe(false);
    expect(validatePlanItemBody("x").ok).toBe(false);
    expect(validatePlanItemBody([]).ok).toBe(false);
    expect(validatePlanItemBody({ action: "nope", itemId: ID }).ok).toBe(false);
  });

  test("itemId 가 UUID 가 아니면 거절한다", () => {
    expect(
      validatePlanItemBody({ action: "check", itemId: "abc", done: true }).ok,
    ).toBe(false);
    expect(validatePlanItemBody({ action: "check", done: true }).ok).toBe(
      false,
    );
  });

  test("check 의 done 이 boolean 이 아니면 거절한다", () => {
    expect(
      validatePlanItemBody({ action: "check", itemId: ID, done: "true" }).ok,
    ).toBe(false);
    expect(validatePlanItemBody({ action: "check", itemId: ID }).ok).toBe(
      false,
    );
  });

  test("set-deadline 은 null 또는 실제 존재하는 YYYY-MM-DD 만 받는다", () => {
    expect(
      validatePlanItemBody({
        action: "set-deadline",
        itemId: ID,
        deadline: null,
      }),
    ).toEqual({
      ok: true,
      action: { action: "set-deadline", itemId: ID, deadline: null },
    });
    expect(
      validatePlanItemBody({
        action: "set-deadline",
        itemId: ID,
        deadline: "2026-11-30",
      }).ok,
    ).toBe(true);
    expect(
      validatePlanItemBody({
        action: "set-deadline",
        itemId: ID,
        deadline: "2028-02-29",
      }).ok,
    ).toBe(true);
    for (const bad of [
      "2026-02-30",
      "2027-02-29",
      "2026-13-01",
      "2026-1-5",
      "20261130",
      "2026-11-30T00:00:00Z",
      "",
      20261130,
    ]) {
      expect(
        validatePlanItemBody({
          action: "set-deadline",
          itemId: ID,
          deadline: bad,
        }).ok,
      ).toBe(false);
    }
    expect(
      validatePlanItemBody({ action: "set-deadline", itemId: ID }).ok,
    ).toBe(false);
  });

  test("program-done 은 HTTP 바디로 받지 않는다", () => {
    expect(
      validatePlanItemBody({
        action: "program-done",
        itemId: ID,
        program: "deep",
        refId: REF,
      }),
    ).toEqual({ ok: false, reason: "허용되지 않는 액션" });
  });
});

const NOW = "2026-10-06T10:00:00.000Z";

function item(over: Partial<PlanItemRow> = {}): PlanItemRow {
  return {
    id: ID,
    report_id: "r1",
    profile_id: "p1",
    program: "school",
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
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

const doneManual = {
  status: "done",
  done_source_program: "manual",
  done_ref_id: null,
  done_at: "2026-10-05T00:00:00Z",
} as const;
const doneDeep = {
  status: "done",
  done_source_program: "deep",
  done_ref_id: REF,
  done_at: "2026-10-05T00:00:00Z",
} as const;

describe("decideMutation check", () => {
  const check = (done: boolean) =>
    ({ action: "check", itemId: ID, done }) as const;

  test("미완 항목을 체크하면 수동 완료로 바꾼다", () => {
    expect(decideMutation(item(), check(true), NOW)).toEqual({
      kind: "update",
      patch: {
        status: "done",
        done_source_program: "manual",
        done_ref_id: null,
        done_at: NOW,
      },
    });
  });

  test("이미 완료면 체크는 noop", () => {
    expect(decideMutation(item(doneManual), check(true), NOW)).toEqual({
      kind: "noop",
      reason: "already_done",
    });
  });

  test("수동 완료는 체크 해제로 되돌린다", () => {
    expect(decideMutation(item(doneManual), check(false), NOW)).toEqual({
      kind: "update",
      patch: {
        status: "pending",
        done_source_program: null,
        done_ref_id: null,
        done_at: null,
      },
    });
  });

  test("미완 항목의 해제는 noop", () => {
    expect(decideMutation(item(), check(false), NOW)).toEqual({
      kind: "noop",
      reason: "already_pending",
    });
  });

  test("하위 프로그램이 확정한 항목은 해제할 수 없다", () => {
    for (const program of ["self", "deep"] as const) {
      const row = item({ ...doneDeep, done_source_program: program, program });
      expect(decideMutation(row, check(false), NOW)).toEqual({
        kind: "reject",
        code: "PROGRAM_DONE_LOCKED",
        message: "하위 프로그램에서 확정된 항목은 여기서 되돌릴 수 없어요",
      });
    }
  });
});

describe("decideMutation set-deadline", () => {
  const setDeadline = (deadline: string | null) =>
    ({ action: "set-deadline", itemId: ID, deadline }) as const;

  test("과목 선택 시기 항목만 마감일을 정한다", () => {
    expect(
      decideMutation(
        item({ period: "course_selection" }),
        setDeadline("2026-11-30"),
        NOW,
      ),
    ).toEqual({ kind: "update", patch: { deadline: "2026-11-30" } });
    expect(
      decideMutation(
        item({ period: "course_selection", deadline: "2026-11-30" }),
        setDeadline(null),
        NOW,
      ),
    ).toEqual({ kind: "update", patch: { deadline: null } });
  });

  test("다른 시기 항목은 거절한다", () => {
    for (const period of ["semester", "vacation"] as const) {
      expect(
        decideMutation(item({ period }), setDeadline("2026-11-30"), NOW),
      ).toMatchObject({ kind: "reject", code: "DEADLINE_NOT_ALLOWED" });
    }
  });

  test("같은 값이면 noop", () => {
    expect(
      decideMutation(
        item({ period: "course_selection", deadline: "2026-11-30" }),
        setDeadline("2026-11-30"),
        NOW,
      ),
    ).toEqual({ kind: "noop", reason: "same_deadline" });
    expect(
      decideMutation(
        item({ period: "course_selection" }),
        setDeadline(null),
        NOW,
      ),
    ).toEqual({ kind: "noop", reason: "same_deadline" });
  });
});

describe("decideMutation program-done", () => {
  const confirm = (program: "self" | "deep", refId = REF) =>
    ({ action: "program-done", itemId: ID, program, refId }) as const;

  test("프로그램이 같은 미완 항목은 확정 출처와 참조를 기록한다", () => {
    expect(
      decideMutation(item({ program: "deep" }), confirm("deep"), NOW),
    ).toEqual({
      kind: "update",
      patch: {
        status: "done",
        done_source_program: "deep",
        done_ref_id: REF,
        done_at: NOW,
      },
    });
  });

  test("항목 프로그램과 다르면 거절한다", () => {
    expect(
      decideMutation(item({ program: "self" }), confirm("deep"), NOW),
    ).toMatchObject({ kind: "reject", code: "PROGRAM_MISMATCH" });
    expect(decideMutation(item(), confirm("deep"), NOW)).toMatchObject({
      kind: "reject",
      code: "PROGRAM_MISMATCH",
    });
  });

  test("같은 refId 로 다시 확정하면 중복 확정 noop", () => {
    expect(
      decideMutation(
        item({ ...doneDeep, program: "deep" }),
        confirm("deep"),
        NOW,
      ),
    ).toEqual({ kind: "noop", reason: "duplicate_confirm" });
  });

  test("다른 refId 로 다시 확정하면 먼저 확정한 것을 유지한다", () => {
    const other = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    expect(
      decideMutation(
        item({ ...doneDeep, program: "deep" }),
        confirm("deep", other),
        NOW,
      ),
    ).toEqual({ kind: "noop", reason: "already_done" });
  });

  test("수동 완료된 항목에 확정이 오면 기존 완료를 유지한다", () => {
    expect(
      decideMutation(
        item({ ...doneManual, program: "deep" }),
        confirm("deep"),
        NOW,
      ),
    ).toEqual({ kind: "noop", reason: "already_done" });
  });
});
