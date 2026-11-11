// GET /api/console/graduates 계약 검증(W13 졸업생 탭). 졸업 후 2년 안만 보이고(결정 9) 이름은 가린다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

import handler from "./graduates.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const row = (over: Record<string, unknown>) => ({
  tenant_id: "tenant-1",
  status: "active",
  graduated_at: null,
  number: null,
  ...over,
});

const graduate = (
  id: string,
  studentId: string,
  schoolYear: number,
  graduatedAt: string,
  over: Record<string, unknown> = {},
) =>
  row({
    id,
    student_id: studentId,
    school_year: schoolYear,
    status: "graduated",
    graduated_at: graduatedAt,
    grade: "고3",
    class_id: "c-3",
    number: 1,
    ...over,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T00:00:00+09:00"));
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        graduate("g1", "s1", 2025, "2026-03-02T01:00:00Z"),
        graduate("g6", "s6", 2025, "2026-03-02T01:00:00Z", { number: 6 }),
        graduate("g2", "s2", 2024, "2025-03-02T01:00:00Z", { number: 2 }),
        graduate("g-old", "s3", 2023, "2024-03-02T01:00:00Z"),
        graduate("g-x", "s4", 2025, "2026-03-02T01:00:00Z", {
          tenant_id: "tenant-2",
        }),
        row({
          id: "a1",
          student_id: "s1",
          school_year: 2024,
          grade: "고2",
          class_id: "c-2",
          number: 3,
        }),
        row({
          id: "a2",
          student_id: "s2",
          school_year: 2023,
          grade: "고2",
          class_id: "c-2",
          number: 5,
        }),
        row({
          id: "a3",
          student_id: "s5",
          school_year: 2026,
          grade: "고1",
          class_id: "c-3",
        }),
      ],
      f,
    );
  kit.state.rows.classes = (f) =>
    matchRows(
      [
        {
          id: "c-3",
          tenant_id: "tenant-1",
          school_year: 2025,
          grade: "고3",
          group_id: null,
          name: "1",
        },
        {
          id: "c-2",
          tenant_id: "tenant-1",
          school_year: 2024,
          grade: "고2",
          group_id: null,
          name: "2",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = () => [];
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김서연" },
        { id: "s2", name: "윤하린" },
        { id: "s3", name: "박서준" },
        { id: "s6", name: "정하윤" },
      ],
      f,
    );
});

afterEach(() => {
  vi.useRealTimers();
});

type Item = { studentId: string };
const ids = (r: { body: unknown }) =>
  (r.body as { items: Item[] }).items.map((i) => i.studentId);

describe("GET /api/console/graduates", () => {
  test("without year it lists the newest graduation year and says which year it used, years list all", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(["s1", "s6"]);
    expect(r.body).toMatchObject({
      year: 2025,
      years: [2025, 2024],
      total: 2,
      page: 1,
      pageCount: 1,
    });
  });

  test("an item has the masked name, the graduation year, the last class and number, and the class history", async () => {
    const r = await get();

    expect((r.body as { items: unknown[] }).items[0]).toEqual({
      studentId: "s1",
      name: "김*연",
      graduatedYear: 2025,
      last: { grade: "고3", className: "1", number: 1 },
      history: [
        { schoolYear: 2025, grade: "고3", className: "1" },
        { schoolYear: 2024, grade: "고2", className: "2" },
      ],
    });
  });

  test("same masked names among graduates of one class get a trailing star", async () => {
    const baseEnrollments = kit.state.rows.student_enrollments;
    kit.state.rows.student_enrollments = (f) => [
      ...((baseEnrollments?.(f) ?? []) as unknown[]),
      ...matchRows(
        [
          graduate("g7", "s7", 2025, "2026-03-02T01:00:00Z", { number: 7 }),
          graduate("g8", "s8", 2025, "2026-03-02T01:00:00Z", {
            number: 8,
            class_id: "c-2",
          }),
        ],
        f,
      ),
    ];
    const baseProfiles = kit.state.rows.profiles;
    kit.state.rows.profiles = (f) => [
      ...((baseProfiles?.(f) ?? []) as unknown[]),
      ...matchRows(
        [
          { id: "s7", name: "김하연" },
          { id: "s8", name: "김서연" },
        ],
        f,
      ),
    ];

    const r = await get({ pageSize: "10" });

    const name = (id: string) =>
      (r.body as { items: { studentId: string; name: string }[] }).items.find(
        (i) => i.studentId === id,
      )?.name;
    expect(name("s1")).toBe("김*연*");
    expect(name("s7")).toBe("김*연*");
    expect(name("s8")).toBe("김*연");
  });

  test("year narrows to one graduation year and q matches the real name, years still list all", async () => {
    const byYear = await get({ year: "2024" });
    expect(ids(byYear)).toEqual(["s2"]);
    expect(byYear.body).toMatchObject({ year: 2024, years: [2025, 2024] });

    expect(ids(await get({ year: "2024", q: "하린" }))).toEqual(["s2"]);
  });

  test("pageSize and page slice the list", async () => {
    const r = await get({ pageSize: "1", page: "2" });
    expect(ids(r)).toEqual(["s6"]);
    expect(r.body).toMatchObject({ total: 2, pageCount: 2 });
  });

  test("a homeroom teacher is refused (403)", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-3"],
    });
    expect((await get()).status).toBe(403);
  });

  test("with no graduates at all, year is null and the list is empty", async () => {
    kit.state.rows.student_enrollments = () => [];
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ year: null, years: [], total: 0 });
  });

  test("a malformed year is a 400", async () => {
    expect((await get({ year: "abc" })).status).toBe(400);
  });
});
