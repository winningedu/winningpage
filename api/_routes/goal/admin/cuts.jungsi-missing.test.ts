// GET /api/goal/admin/cuts/jungsi-missing 계약 검증.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { jungsiMissingResponse } from "../../../../shared/goal/admin-cuts.js";
import { seedAdmin } from "../../../_lib/admin-sections/sectionTestKit.js";
import {
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";
import {
  type CutsDb,
  createCutsAdmin,
  createCutsDb,
} from "../../../_lib/goal/cutsTestKit.js";
import { callHandler } from "../../../_lib/tenantRoute.testkit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as CutsDb,
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createCutsAdmin(kit.state, kit.db),
}));

import { app } from "../../app.js";

const handler = { app, path: "/api/goal/admin/cuts/jungsi-missing" };

const MENU = "goalUniversityCuts";
const call = () => callHandler(handler, undefined, "GET");

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createCutsDb({
    goal_university_options: [
      {
        university_key: "가대",
        university_name: "가대",
        department_key: "국문",
        department_name: "국문",
        has_normal: true,
        has_special: true,
        has_jungsi: true,
      },
      {
        university_key: "나대",
        university_name: "나대",
        department_key: "영문",
        department_name: "영문",
        has_normal: true,
        has_special: false,
        has_jungsi: false,
      },
    ],
  });
});

describe("GET /api/goal/admin/cuts/jungsi-missing", () => {
  test("정시 컷이 없는 조합의 대학명과 학과명만 돌려준다", async () => {
    seedAdmin(kit.state, "view", MENU);
    const r = await call();
    expect(() => jungsiMissingResponse.parse(r.body)).not.toThrow();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [{ university_name: "나대", department_name: "영문" }],
    });
  });

  test("메뉴 권한이 없으면 403", async () => {
    seedAdmin(kit.state, "none", MENU);
    expect((await call()).status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });
});
