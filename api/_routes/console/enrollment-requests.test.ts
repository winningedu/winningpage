// GET /api/console/enrollment-requests 계약 검증(W13 승인 대기 목록). 범위는 count 와 같고, 이름은 담임만 그대로 본다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./enrollment-requests.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const pending = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  tenant_id: "tenant-1",
  status: "pending",
  student_id: `s-${id}`,
  from_grade: "고1",
  from_class_id: "c-from",
  from_number: 4,
  to_grade: "고1",
  to_class_id: "c-A",
  to_number: 7,
  created_at: "2026-03-02T01:00:00Z",
  ...over,
});

const CHANGES = [
  pending("late", { created_at: "2026-03-03T01:00:00Z" }),
  pending("early", { to_grade: "고2", created_at: "2026-03-01T01:00:00Z" }),
  pending("other-class", {
    to_class_id: "c-Z",
    created_at: "2026-03-02T05:00:00Z",
  }),
  pending("no-target", {
    to_class_id: null,
    to_grade: null,
    to_number: null,
    created_at: "2026-03-02T06:00:00Z",
  }),
  pending("done", { status: "applied" }),
  pending("other-tenant", { tenant_id: "tenant-2" }),
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.enrollment_changes = (f) => matchRows(CHANGES, f);
  kit.state.rows.classes = (f) =>
    matchRows(
      [
        {
          id: "c-from",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고1",
          group_id: "g-1",
          name: "5",
        },
        {
          id: "c-A",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고2",
          group_id: null,
          name: "3",
        },
        {
          id: "c-Z",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고2",
          group_id: null,
          name: "9",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = (f) =>
    matchRows([{ id: "g-1", tenant_id: "tenant-1", name: "A레벨" }], f);
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s-late", name: "김하늘" },
        { id: "s-early", name: "윤하린" },
        { id: "s-other-class", name: "박서준" },
        { id: "s-no-target", name: "이도윤" },
      ],
      f,
    );
});

type Item = { changeId: string; studentName: string };
const ids = (r: { body: unknown }) =>
  (r.body as { items: Item[] }).items.map((i) => i.changeId);

describe("GET /api/console/enrollment-requests", () => {
  test("school admin sees every pending request of the tenant oldest first, names masked, with from and to and the grade-change flag", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(["early", "other-class", "no-target", "late"]);
    expect(r.body).toMatchObject({ total: 4, page: 1, pageCount: 1 });
    expect((r.body as { items: unknown[] }).items[0]).toEqual({
      changeId: "early",
      studentId: "s-early",
      studentName: "윤*린",
      from: { grade: "고1", groupName: "A레벨", className: "5", number: 4 },
      to: { grade: "고2", groupName: null, className: "3", number: 7 },
      gradeChanges: true,
      createdAt: "2026-03-01T01:00:00Z",
    });
    const noTarget = (r.body as { items: { changeId: string }[] }).items.find(
      (i) => i.changeId === "no-target",
    );
    expect(noTarget).toMatchObject({
      to: { grade: null, groupName: null, className: null, number: null },
    });
  });

  test("same masked names among requests into one class get a trailing star, another class does not", async () => {
    kit.state.rows.enrollment_changes = (f) =>
      matchRows(
        [
          ...CHANGES,
          pending("dup", { student_id: "s-dup" }),
          pending("dup-z", { student_id: "s-dup-z", to_class_id: "c-Z" }),
        ],
        f,
      );
    const baseProfiles = kit.state.rows.profiles;
    kit.state.rows.profiles = (f) => [
      ...((baseProfiles?.(f) ?? []) as unknown[]),
      ...matchRows(
        [
          { id: "s-dup", name: "김지늘" },
          { id: "s-dup-z", name: "김가늘" },
        ],
        f,
      ),
    ];

    const all = await get({ pageSize: "10" });

    const name = (id: string) =>
      (all.body as { items: Item[] }).items.find((i) => i.changeId === id)
        ?.studentName;
    expect(name("late")).toBe("김*늘*");
    expect(name("dup")).toBe("김*늘*");
    expect(name("dup-z")).toBe("김*늘");
    // 쪽에 한 줄만 보여도 다른 쪽에 있는 같은 학급의 겹침은 표시된다
    const page = await get({ pageSize: "1", page: "2" });
    expect(ids(page)).toEqual(["dup"]);
    expect((page.body as { items: Item[] }).items[0]?.studentName).toBe(
      "김*늘*",
    );
  });

  test("a homeroom sees only requests into own classes and real names", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    const r = await get();

    expect(ids(r)).toEqual(["early", "late"]);
    expect(
      (r.body as { items: Item[] }).items.map((i) => i.studentName),
    ).toEqual(["윤하린", "김하늘"]);
  });

  test("pageSize and page slice the list while total stays the full count", async () => {
    const r = await get({ pageSize: "3", page: "2" });

    expect(ids(r)).toEqual(["late"]);
    expect(r.body).toMatchObject({ total: 4, page: 2, pageCount: 2 });
  });

  test("a malformed page is a 400", async () => {
    expect((await get({ page: "0" })).status).toBe(400);
  });
});
