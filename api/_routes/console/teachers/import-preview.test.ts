// POST /api/console/teachers/import-preview 계약 검증(W15 미리보기). 행 판정만 하고 아무것도 쓰지 않는다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  schoolAdminActor,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./import-preview.js";

const post = (body: unknown) => callHandler(handler, body);

const row = (over: Record<string, string> = {}) => ({
  name: "김교사",
  phone: "010-1111-2222",
  grade: "고1",
  group: "",
  className: "3반",
  ...over,
});

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ org_type: "학교", school_year: 2026 });
  kit.state.rows.teachers = () => [];
  kit.state.rows.class_groups = () => [];
  kit.state.rows.classes = () => [];
  kit.state.rows.teacher_class_assignments = () => [];
});

describe("POST /api/console/teachers/import-preview", () => {
  test("행마다 판정만 돌려주고 DB 를 쓰지 않는다(신규, 형식 오류, 파일 안 학급 중복)", async () => {
    const r = await post({
      rows: [
        row(),
        row({ name: "이교사", phone: "010-3333-4444", className: "3반" }),
        row({ name: "", phone: "010-5555-6666", className: "4반" }),
      ],
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      rows: [
        { index: 0, verdict: "new" },
        { index: 1, verdict: "class_duplicate" },
        { index: 2, verdict: "format_error" },
      ],
    });
    expect(kit.state.inserts).toEqual([]);
    expect(kit.state.updates).toEqual([]);
    expect(
      kit.state.events.filter((e) => e !== "rpc:fn_console_actor"),
    ).toEqual([]);
  });
  test("이미 같은 교사가 맡은 학급은 동일, 이름이 다르면 변경으로 판정한다", async () => {
    kit.state.rows.teachers = (f) =>
      Array.isArray(f.phone) || Array.isArray(f.name)
        ? [{ id: "t1", name: "김교사", phone: "01011112222", deleted_at: null }]
        : [
            {
              id: "t1",
              name: "김교사",
              phone: "01011112222",
              deleted_at: null,
            },
          ];
    kit.state.rows.classes = () => [
      { id: "c1", grade: "고1", group_id: null, name: "3" },
      { id: "c2", grade: "고1", group_id: null, name: "4" },
    ];
    kit.state.rows.teacher_class_assignments = () => [
      { teacher_id: "t1", class_id: "c1" },
      { teacher_id: "t1", class_id: "c2" },
    ];

    const r = await post({
      rows: [
        row(),
        row({ name: "박교사", phone: "010-7777-8888", className: "4반" }),
      ],
    });

    expect(r.body).toEqual({
      rows: [
        { index: 0, verdict: "same" },
        { index: 1, verdict: "changed" },
      ],
    });
  });

  describe("학원의 다학년 학급(적용이 fn_class_ensure 의 이름 우선으로 그 학급에 넣는다)", () => {
    beforeEach(() => {
      kit.state.rows.tenants = () => ({
        org_type: "사기업",
        school_year: 2026,
      });
      kit.state.rows.teachers = (f) =>
        Array.isArray(f.phone) || Array.isArray(f.name)
          ? []
          : [
              {
                id: "t1",
                name: "김교사",
                phone: "01011112222",
                deleted_at: null,
              },
            ];
      kit.state.rows.classes = () => [
        { id: "c-g", grade: "고1", group_id: null, name: "A" },
        { id: "c-m", grade: null, group_id: null, name: "A" },
      ];
      kit.state.rows.teacher_class_assignments = () => [
        { teacher_id: "t1", class_id: "c-m" },
      ];
    });

    test("같은 그룹과 이름의 다학년 학급이 학년 학급보다 먼저라 그 학급의 담임과 견준다", async () => {
      const same = await post({ rows: [row({ className: "A" })] });
      const other = await post({
        rows: [
          row({
            name: "박교사",
            phone: "010-7777-8888",
            grade: "고2",
            className: "A",
          }),
        ],
      });

      expect(
        (same.body as { rows: { verdict: string }[] }).rows[0]?.verdict,
      ).toBe("same");
      expect(
        (other.body as { rows: { verdict: string }[] }).rows[0]?.verdict,
      ).toBe("changed");
    });

    test("학년이 달라도 같은 다학년 학급을 가리키는 두 행은 학급 중복이다", async () => {
      kit.state.rows.teacher_class_assignments = () => [];

      const r = await post({
        rows: [
          row({ className: "A" }),
          row({
            name: "이교사",
            phone: "010-3333-4444",
            grade: "고2",
            className: "A",
          }),
        ],
      });

      expect(
        (r.body as { rows: { verdict: string }[] }).rows.map((x) => x.verdict),
      ).toEqual(["new", "class_duplicate"]);
    });

    test("다학년 학급이 아닌 이름은 지금처럼 그 학년의 학급과 견준다", async () => {
      kit.state.rows.classes = () => [
        { id: "c-g", grade: "고1", group_id: null, name: "B" },
        { id: "c-m", grade: null, group_id: null, name: "A" },
      ];
      kit.state.rows.teacher_class_assignments = () => [
        { teacher_id: "t1", class_id: "c-g" },
      ];

      const r = await post({ rows: [row({ className: "B" })] });

      expect((r.body as { rows: { verdict: string }[] }).rows[0]?.verdict).toBe(
        "same",
      );
    });
  });

  test("행이 없거나 200개를 넘으면 400 이다", async () => {
    expect((await post({ rows: [] })).status).toBe(400);
    expect(
      (await post({ rows: Array.from({ length: 201 }, () => row()) })).status,
    ).toBe(400);
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect((await post({ rows: [row()] })).status).toBe(403);
  });
});
