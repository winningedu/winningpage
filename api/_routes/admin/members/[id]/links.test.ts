// GET /api/admin/members/:id/links 계약 검증. 연결된 학부모, 학생과 상대 프로필.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSectionAdmin,
  type SectionDb,
} from "../../../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../../_lib/console/consoleTestKit.js";
import {
  MEMBER_ID,
  OTHER_ID,
  seedMembersDb,
} from "../../../../_lib/members/membersTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
}));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createSectionAdmin(kit.state, kit.db),
}));

import handler from "./links.js";

const get = (id: string) => callHandler(handler, undefined, "GET", { id });

const PARENT = "7d3e4c5d-6f70-4182-8c9d-1e2f3a4b5c6d";
const OTHER_PARENT = "9f506e7f-8192-43a4-8ebf-3a4b5c6d7e8f";
const CHILD = "8e4f5d6e-7081-4293-9dae-2f3a4b5c6d7e";

const TABLES = {
  profiles: [
    { id: MEMBER_ID, member_type: "student", name: "학생" },
    {
      id: PARENT,
      member_type: "parent",
      name: "학부모",
      email: "p@x.kr",
      phone: "01011112222",
      role: "parent",
    },
    {
      id: CHILD,
      member_type: "student",
      name: "자녀",
      email: "c@x.kr",
      phone: "01033334444",
    },
    { id: OTHER_PARENT, member_type: "parent", name: "다른 학부모" },
  ],
  parent_child_links: [
    { id: "l-1", parent_id: PARENT, student_id: MEMBER_ID, status: "approved" },
    {
      id: "l-2",
      parent_id: OTHER_PARENT,
      student_id: MEMBER_ID,
      status: "pending",
    },
    { id: "l-3", parent_id: PARENT, student_id: "gone", status: "rejected" },
    {
      id: "l-4",
      parent_id: OTHER_PARENT,
      student_id: CHILD,
      status: "approved",
    },
    { id: "l-5", parent_id: PARENT, student_id: CHILD, status: "pending" },
  ],
};

beforeEach(() => {
  kit.state = createKitState();
  kit.db = seedMembersDb(kit.state, "view", TABLES);
});

describe("GET /api/admin/members/:id/links", () => {
  test("학생이면 student_id 로 묶인 학부모를 돌려준다(대기, 승인만)", async () => {
    const r = await get(MEMBER_ID);

    expect(r.status).toBe(200);
    expect(
      (r.body as { items: Record<string, unknown>[] }).items.map((x) => [
        x.linkId,
        x.status,
        (x.profile as { id: string }).id,
      ]),
    ).toEqual([
      ["l-1", "approved", PARENT],
      ["l-2", "pending", OTHER_PARENT],
    ]);
    expect(
      (r.body as { items: { profile: unknown }[] }).items[0]?.profile,
    ).toMatchObject({
      id: PARENT,
      name: "학부모",
      email: "p@x.kr",
      phone: "01011112222",
    });
    const link = kit.db.calls.find((c) => c.table === "parent_child_links");
    expect(link?.filters).toEqual([
      ["student_id", "eq", MEMBER_ID],
      ["status", "in", ["pending", "approved"]],
    ]);
  });

  test("학부모면 parent_id 로 묶인 학생을 돌려준다", async () => {
    const r = await get(PARENT);

    const link = kit.db.calls.find((c) => c.table === "parent_child_links");
    expect(link?.filters[0]).toEqual(["parent_id", "eq", PARENT]);
    expect(
      (
        r.body as { items: { linkId: string; profile: { id: string } }[] }
      ).items.map((x) => [x.linkId, x.profile.id]),
    ).toEqual([
      ["l-1", MEMBER_ID],
      ["l-5", CHILD],
    ]);
  });

  test("상대 프로필을 못 찾으면 profile 은 null", async () => {
    kit.db.tables.parent_child_links = [
      {
        id: "l-9",
        parent_id: "ghost",
        student_id: MEMBER_ID,
        status: "approved",
      },
    ];

    const r = await get(MEMBER_ID);

    expect(r.body).toEqual({
      items: [{ linkId: "l-9", status: "approved", profile: null }],
    });
  });

  test("연결이 없으면 빈 목록이고 상대 프로필을 읽지 않는다", async () => {
    kit.db.tables.parent_child_links = [];

    const r = await get(MEMBER_ID);

    expect(r.body).toEqual({ items: [] });
    expect(
      kit.db.calls.filter(
        (c) =>
          c.table === "profiles" &&
          c.filters.some(
            ([col]) => col === "id" && c.filters.some(([, k]) => k === "in"),
          ),
      ),
    ).toHaveLength(0);
  });

  test("members 권한이 없으면 403 이고 읽지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "none", TABLES);

    expect((await get(MEMBER_ID)).status).toBe(403);
    expect(kit.db.calls.some((c) => c.table === "parent_child_links")).toBe(
      false,
    );
  });

  test("없는 회원은 404 NOT_FOUND 이고 parent_child_links 를 읽지 않는다", async () => {
    const r = await get(OTHER_ID);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
    expect(kit.db.calls.some((c) => c.table === "parent_child_links")).toBe(
      false,
    );
  });

  test("uuid 가 아닌 id 는 400 이고 읽지 않는다", async () => {
    const r = await get("x");

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(kit.db.calls.some((c) => c.table === "parent_child_links")).toBe(
      false,
    );
  });

  test("읽기 오류는 500 INTERNAL_ERROR", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.db.errors.push({
      table: "parent_child_links",
      op: "select",
      error: { code: "42501" },
    });

    const r = await get(MEMBER_ID);

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
