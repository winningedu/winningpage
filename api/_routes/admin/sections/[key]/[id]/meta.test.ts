// PATCH /api/admin/sections/:key/:id/meta 계약 검증(saveAdmissionMeta 경로).

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSectionAdmin,
  createSectionDb,
  type SectionDb,
  seedAdmin,
} from "../../../../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
}));

vi.mock("../../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createSectionAdmin(kit.state, kit.db),
}));

import handler from "./meta.js";

const patch = (key: string, id: string, body: unknown) =>
  callHandler(handler, body, "PATCH", { key, id });

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createSectionDb({});
});

describe("PATCH /api/admin/sections/:key/:id/meta", () => {
  test("메타를 고치고 행을 돌려준다(보호 컬럼은 뗀다)", async () => {
    seedAdmin(kit.state, "edit", "admissionGuidelines");
    kit.db.tables.admission_university_resources = [
      { id: "g1", university_name: "A대" },
    ];
    const r = await patch("admissionGuidelines", "g1", {
      values: { id: "x", created_at: "t", university_name: "B대" },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: "g1", university_name: "B대" });
    expect(kit.db.calls.find((c) => c.op === "update")?.values).toEqual({
      university_name: "B대",
    });
  });

  test("고정 값과 sort_order 밀기는 하지 않는다", async () => {
    seedAdmin(kit.state, "edit", "admissionGuidelines");
    kit.db.tables.admission_university_resources = [{ id: "g1" }];
    await patch("admissionGuidelines", "g1", { values: { sort_order: 1 } });
    expect(kit.db.calls.filter((c) => c.op === "select")).toHaveLength(0);
  });

  test("meta 섹션이 아니면 400", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [{ id: "f1" }];
    expect((await patch("faqs", "f1", { values: {} })).status).toBe(400);
  });

  test("모르는 필드 400, 없는 행 404, 보기 권한 403", async () => {
    seedAdmin(kit.state, "edit", "admissionGuidelines");
    kit.db.tables.admission_university_resources = [{ id: "g1" }];
    expect(
      (await patch("admissionGuidelines", "g1", { values: { oops: 1 } }))
        .status,
    ).toBe(400);
    expect(
      (await patch("admissionGuidelines", "zz", { values: {} })).status,
    ).toBe(404);
    seedAdmin(kit.state, "view", "admissionGuidelines");
    expect(
      (await patch("admissionGuidelines", "g1", { values: {} })).status,
    ).toBe(403);
  });
});
