// GET /api/console/school-year 계약 검증(W11, 결정 32). 학년도 넘기기를 이미 했는지 화면이 알 수 있어야 한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  tenant: { school_year: 2025, org_type: "학원" } as Record<string, unknown>,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./school-year.js";

const get = () => callHandler(handler, undefined, "GET");

const active = (grade: string | null, schoolYear = 2025) => ({
  tenant_id: "tenant-1",
  school_year: schoolYear,
  status: "active",
  grade,
});

const rollover = (
  toGrade: string | null,
  decidedAt: string,
  over: Record<string, unknown> = {},
) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  kind: "rollover",
  status: "applied",
  to_grade: toGrade,
  decided_at: decidedAt,
  ...over,
});

beforeEach(() => {
  // 2026-03-05 KST 는 2026학년도다(학년도는 3월에 시작한다).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-05T00:00:00+09:00"));
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.tenant = { school_year: 2025, org_type: "학원" };
  kit.state.rows.tenants = () => kit.tenant;
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        active("고1"),
        active("고1"),
        active("고2"),
        active("고3"),
        active(null),
        active("고1", 2024),
        { ...active("고3"), status: "graduated" },
      ],
      f,
    );
  kit.state.rows.enrollment_changes = (f) =>
    matchRows(
      [
        rollover("고2", "2026-03-02T01:00:00Z"),
        rollover("고2", "2026-03-02T01:00:05Z"),
        rollover(null, "2026-03-02T01:00:03Z"),
        rollover("고2", "2026-03-01T00:00:00Z", { kind: "request" }),
        rollover("고2", "2026-03-01T00:00:00Z", {
          kind: "request",
          school_year: 2025,
        }),
      ],
      f,
    );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/console/school-year", () => {
  test("before this cycle's rollover: next year is the target, grade counts of active students, graduation of the top grade", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      schoolYear: 2025,
      toYear: 2026,
      rolledOver: false,
      gradeCounts: [
        { grade: "고1", count: 2 },
        { grade: "고2", count: 1 },
        { grade: "고3", count: 1 },
      ],
      graduatingGrades: ["고3"],
    });
  });

  test("after the rollover: rolledOver is true and the last run is reported with its time and counts", async () => {
    kit.tenant = { school_year: 2026, org_type: "학원" };

    const r = await get();

    expect(r.body).toMatchObject({
      schoolYear: 2026,
      toYear: 2026,
      rolledOver: true,
      lastRollover: {
        at: "2026-03-02T01:00:05Z",
        graduated: 1,
        promoted: 2,
      },
    });
  });

  test("reports which way a roster upload works: rollover while behind the calendar, midyear once at it", async () => {
    expect((await get()).body).toMatchObject({ mode: "rollover" });
    kit.tenant = { school_year: 2026, org_type: "학원" };
    expect((await get()).body).toMatchObject({ mode: "midyear" });
  });

  test("before the rollover there is no last run", async () => {
    expect((await get()).body).toMatchObject({ lastRollover: null });
  });

  test("a tenant two years behind rolls one year at a time", async () => {
    kit.tenant = { school_year: 2024, org_type: "학원" };
    expect((await get()).body).toMatchObject({
      schoolYear: 2024,
      toYear: 2025,
      rolledOver: false,
    });
  });

  test("a school also graduates the third year of middle school", async () => {
    kit.tenant = { school_year: 2025, org_type: "학교" };
    expect((await get()).body).toMatchObject({
      graduatingGrades: ["중3", "고3"],
    });
  });

  test("a homeroom teacher is refused (403)", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-1"],
    });
    expect((await get()).status).toBe(403);
  });
});
