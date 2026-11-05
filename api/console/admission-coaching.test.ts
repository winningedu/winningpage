// GET /api/console/admission-coaching 계약 검증(W10 입시 상담코칭). 중3, 고3 학생만, 담임은 담당 학급의 실명, 관리자는 전교의 가린 이름.
// 상담 상태와 변경 일자는 counsel_statuses 에서 읽는다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./admission-coaching.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const enrollment = (
  student: string,
  grade: string,
  classId: string,
  number: number,
) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  student_id: student,
  grade,
  class_id: classId,
  number,
});

const axes = (scores: number[]) =>
  scores.map((score, i) => ({ name: `축${i + 1}`, score, status: "보통" }));

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor({ kind: "homeroom", class_ids: ["c-3"] });
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.classes = (f) =>
    matchRows(
      [
        {
          id: "c-3",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고3",
          group_id: null,
          name: "3",
        },
        {
          id: "c-2",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고2",
          group_id: null,
          name: "1",
        },
        {
          id: "c-m3",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "중3",
          group_id: null,
          name: "1",
        },
        {
          id: "c-old",
          tenant_id: "tenant-1",
          school_year: 2025,
          grade: "고3",
          group_id: null,
          name: "9",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = () => [];
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        enrollment("s2", "고3", "c-3", 2),
        enrollment("s1", "고3", "c-3", 1),
        enrollment("s3", "고2", "c-2", 1),
        enrollment("s4", "중3", "c-m3", 1),
      ],
      f,
    );
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "정민서" },
        { id: "s2", name: "한예준" },
        { id: "s3", name: "오세훈" },
        { id: "s4", name: "서예린" },
      ],
      f,
    );
  kit.state.rows.goal_students = (f) =>
    matchRows(
      [
        {
          profile_id: "s1",
          week_ideal: 10,
          ideal_university: "가나대",
          ideal_department: "경영학과",
          min_university: "다라대",
          min_department: "경영학과",
        },
      ],
      f,
    );
  kit.state.rows.counsel_statuses = (f) =>
    matchRows(
      [
        {
          student_id: "s1",
          tenant_id: "tenant-1",
          school_year: 2026,
          status: "needed",
          changed_at: "2026-10-28T03:00:00Z",
        },
        // 지난 학년도 상태는 보이지 않는다(결정 64, 학년도별로 처음 값에서 다시 시작).
        {
          student_id: "s2",
          tenant_id: "tenant-1",
          school_year: 2025,
          status: "done",
          changed_at: "2025-10-28T03:00:00Z",
        },
      ],
      f,
    );
  kit.state.rows.goal_student_state = () => [];
  kit.state.rows.goal_daily_records = () => [];
  kit.state.rows.diagnosis_reports = (f) =>
    matchRows(
      [
        {
          attempt_id: "a1",
          profile_id: "s1",
          diagnosed_at: "2026-03-10T05:00:00Z",
          payload: {
            learningAxes: axes([60, 70, 80, 75, 65, 90]),
            readiness: { areas: axes([71, 72, 70, 75, 80, 69]) },
          },
        },
      ],
      f,
    );
});

describe("GET /api/console/admission-coaching", () => {
  test("homeroom sees own grade-3 students by number with real names, targets, execution score and urgency; missing data is null", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 2, hasGrade3InScope: true });
    const items = (res.body as { items: unknown[] }).items;
    expect(items).toEqual([
      {
        studentId: "s1",
        name: "정민서",
        grade: "고3",
        groupName: null,
        className: "3",
        number: 1,
        idealTarget: { university: "가나대", department: "경영학과" },
        minTarget: { university: "다라대", department: "경영학과" },
        execScore: 73,
        urgency: "mid",
        counselStatus: "needed",
        counselChangedAt: "2026-10-28T03:00:00Z",
      },
      {
        studentId: "s2",
        name: "한예준",
        grade: "고3",
        groupName: null,
        className: "3",
        number: 2,
        idealTarget: null,
        minTarget: null,
        execScore: null,
        urgency: null,
        counselStatus: "unset",
        counselChangedAt: null,
      },
    ]);
  });

  test("school admin sees every grade-3 class of this year with masked names, never other grades", async () => {
    kit.state.actor = schoolAdminActor();

    const res = await get();

    const items = (res.body as { items: { name: string; grade: string }[] })
      .items;
    expect(items.map((i) => [i.name, i.grade])).toEqual([
      ["서*린", "중3"],
      ["정*서", "고3"],
      ["한*준", "고3"],
    ]);
  });

  test("same masked names in one class get a trailing star, even when they sit on different pages", async () => {
    kit.state.actor = schoolAdminActor();
    const baseProfiles = kit.state.rows.profiles;
    kit.state.rows.profiles = (f) =>
      ((baseProfiles?.(f) ?? []) as { id: string; name: string }[]).map(
        (p) => ({
          ...p,
          name: p.id === "s2" ? "정하서" : p.name,
        }),
      );
    // s1 정민서와 s2 정하서는 둘 다 정*서, 고3 3반 한 학급이다.

    const res = await get({ pageSize: "1", page: "2" });

    expect(
      (res.body as { items: { name: string }[] }).items.map((i) => i.name),
    ).toEqual(["정*서*"]);
  });

  test("a homeroom teacher without a grade-3 class gets an empty list and hasGrade3InScope false", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-2"],
    });

    const res = await get();

    expect(res.body).toMatchObject({
      total: 0,
      items: [],
      hasGrade3InScope: false,
    });
  });

  test("a grade-3 class with no students still counts as in scope", async () => {
    kit.state.rows.student_enrollments = () => [];

    const res = await get();

    expect(res.body).toMatchObject({ total: 0, hasGrade3InScope: true });
  });

  test("grade narrows to one of 중3 or 고3; other grades and bad pages are 400", async () => {
    kit.state.actor = schoolAdminActor();

    const only = await get({ grade: "중3" });

    expect(
      (only.body as { items: { studentId: string }[] }).items.map(
        (i) => i.studentId,
      ),
    ).toEqual(["s4"]);
    expect((await get({ grade: "고2" })).status).toBe(400);
    expect((await get({ page: "0" })).status).toBe(400);
  });

  test("pages the list", async () => {
    kit.state.actor = schoolAdminActor();

    const res = await get({ page: "2", pageSize: "2" });

    expect(res.body).toMatchObject({ total: 3, page: 2, pageCount: 2 });
    expect((res.body as { items: unknown[] }).items).toHaveLength(1);
  });
});
