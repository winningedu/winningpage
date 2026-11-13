// POST /api/console/school-year/rollover/preview 계약 검증(W11 ③ 미리보기). 읽기만 하고 아무것도 쓰지 않는다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./preview.js";

const post = (body: unknown) => callHandler(handler, body);

// 2027-03-05 KST 는 2027학년도다. 기관(2026)은 달력보다 뒤라 넘기기 방식이다.
const rolloverDay = () =>
  vi.setSystemTime(new Date("2027-03-05T00:00:00+09:00"));

const enrollment = (over: Record<string, unknown>) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  rolloverDay();
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학원" });
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        enrollment({
          student_id: "s1",
          grade: "고1",
          class_id: "c-4",
          number: 7,
          version: 3,
        }),
        enrollment({
          student_id: "s2",
          grade: "고1",
          class_id: "c-4",
          number: 8,
        }),
        enrollment({
          student_id: "s3",
          grade: "고3",
          class_id: "c-3",
          number: 1,
        }),
        enrollment({
          student_id: "s4",
          grade: "고2",
          class_id: null,
          number: null,
        }),
        enrollment({
          student_id: "s5",
          grade: "고1",
          class_id: "c-4",
          number: 9,
          status: "graduated",
        }),
        enrollment({
          student_id: "s6",
          tenant_id: "tenant-2",
          grade: "고1",
          class_id: "c-x",
          number: 1,
        }),
      ],
      f,
    );
  kit.state.rows.classes = (f) =>
    matchRows(
      [
        {
          id: "c-4",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고1",
          group_id: "g-a",
          name: "4",
        },
        {
          id: "c-3",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고3",
          group_id: null,
          name: "3",
        },
        {
          id: "c-next",
          tenant_id: "tenant-1",
          school_year: 2027,
          grade: "고2",
          group_id: "g-a",
          name: "3",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = (f) =>
    matchRows(
      [{ id: "g-a", tenant_id: "tenant-1", name: "A레벨", deleted_at: null }],
      f,
    );
  kit.state.rows.teacher_class_assignments = (f) =>
    matchRows([{ tenant_id: "tenant-1", class_id: "c-next" }], f);
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김하늘" },
        { id: "s2", name: "윤하린" },
        { id: "s3", name: "박서준" },
        { id: "s4", name: "이도윤" },
      ],
      f,
    );
});

const TEXT = [
  "이름\t기존 학년그룹\t그룹\t반\t번호\t새 학년그룹\t그룹\t반\t번호",
  "김하늘\t1학년\tA레벨\t4\t7\t2학년\tA레벨\t3\t1",
  "윤하린\t1학년\tA레벨\t4\t8\t2학년\tA레벨\t5\t2",
  "박서준\t3학년\t없음\t3\t1\t\t\t\t",
  "없는사람\t1학년\t\t4\t1\t2학년\t\t3\t1",
].join("\n");

describe("POST /api/console/school-year/rollover/preview", () => {
  test("matches pasted rows to current students, masks names, and returns the rows, the apply list and the summary", async () => {
    const r = await post({ toYear: 2027, text: TEXT });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      rows: [
        {
          line: 2,
          displayName: "김*늘",
          from: { grade: "고1", groupName: "A레벨", className: "4", number: 7 },
          to: { grade: "고2", groupName: "A레벨", className: "3", number: 1 },
          studentId: "s1",
          result: "applied",
        },
        {
          line: 3,
          displayName: "윤*린",
          from: { grade: "고1", groupName: "A레벨", className: "4", number: 8 },
          to: { grade: "고2", groupName: "A레벨", className: "5", number: 2 },
          studentId: "s2",
          result: "no_homeroom",
        },
        {
          line: 4,
          displayName: "박*준",
          from: { grade: "고3", groupName: null, className: "3", number: 1 },
          to: null,
          studentId: "s3",
          result: "graduating",
        },
        {
          line: 5,
          displayName: "없*사람",
          from: null,
          to: null,
          studentId: null,
          result: "student_not_found",
        },
      ],
      pendingRows: [
        {
          name: "없는사람",
          grade: "고2",
          groupId: null,
          className: "3",
          number: 1,
        },
      ],
      summary: { graduate: 1, promote: 3, waiting: 1 },
      applyRows: [
        { studentId: "s1", groupId: "g-a", className: "3", number: 1 },
        { studentId: "s2", groupId: "g-a", className: "5", number: 2 },
      ],
    });
  });

  describe("mid-year (the tenant is already at the calendar school year)", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2026-11-13T12:00:00+09:00"));
    });

    const MIDYEAR_TEXT = [
      "김하늘\t1학년\tA레벨\t4\t7\t1학년\tA레벨\t5\t2",
      "없는사람\t1학년\t\t4\t1\t\t\t\t",
    ].join("\n");

    test("the year to ask for is the tenant's own year: grade stays, only the class slot changes, the version rides along, and the missing person is a pending row", async () => {
      const r = await post({ toYear: 2026, text: MIDYEAR_TEXT });

      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        rows: [
          {
            studentId: "s1",
            from: { grade: "고1" },
            result: "class_changed",
            to: { grade: "고1", groupName: "A레벨", className: "5", number: 2 },
          },
          { studentId: null, result: "student_not_found" },
        ],
        applyRows: [
          {
            studentId: "s1",
            groupId: "g-a",
            className: "5",
            number: 2,
            version: 3,
          },
        ],
        pendingRows: [
          {
            name: "없는사람",
            grade: "고1",
            groupId: null,
            className: "4",
            number: 1,
          },
        ],
        summary: { graduate: 0, promote: 0, waiting: 0 },
      });
    });

    test("the next year is refused here, and the tenant's own year is refused while a rollover is due", async () => {
      expect((await post({ toYear: 2027, text: MIDYEAR_TEXT })).status).toBe(
        400,
      );
      rolloverDay();
      expect((await post({ toYear: 2026, text: MIDYEAR_TEXT })).status).toBe(
        400,
      );
    });
  });

  test("reads only: no inserts, updates or rpc besides the actor lookup", async () => {
    await post({ toYear: 2027, text: TEXT });

    expect(kit.state.inserts).toEqual([]);
    expect(kit.state.updates).toEqual([]);
    expect(kit.state.events.filter((e) => e.startsWith("rpc:"))).toEqual([
      "rpc:fn_console_actor",
    ]);
  });

  test("a homeroom teacher is refused (403)", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-4"],
    });
    expect((await post({ toYear: 2027, text: TEXT })).status).toBe(403);
  });

  test.each([
    ["no text", { toYear: 2027 }],
    ["empty text", { toYear: 2027, text: "  \n " }],
    ["text not a string", { toYear: 2027, text: 3 }],
    ["no toYear", { text: TEXT }],
    [
      "a toYear that is not the tenant's next year",
      { toYear: 2028, text: TEXT },
    ],
    ["too many rows", { toYear: 2027, text: "김하늘,,,,\n".repeat(3001) }],
  ])("%s is a 400", async (_n, body) => {
    expect(await post(body)).toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } },
    });
  });
});
