// GET /api/goal/admin/cuts/summary 계약 검증.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { cutsSummaryResponse } from "../../../../shared/goal/admin-cuts.js";
import { seedAdmin } from "../../../_lib/admin-sections/sectionTestKit.js";
import {
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";
import { gateReads } from "../../../_lib/gatedReads.testkit.js";
import {
  type CutsDb,
  createCutsAdmin,
  createCutsDb,
} from "../../../_lib/goal/cutsTestKit.js";
import { callHandler } from "../../../_lib/tenantRoute.testkit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as CutsDb,
  wrap: null as null | ((admin: never) => unknown),
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => {
    const admin = createCutsAdmin(kit.state, kit.db);
    return kit.wrap ? kit.wrap(admin as never) : admin;
  },
}));

import { app } from "../../app.js";

const handler = { app, path: "/api/goal/admin/cuts/summary" };

const MENU = "goalUniversityCuts";
const call = () => callHandler(handler, undefined, "GET");

beforeEach(() => {
  kit.wrap = null;
  kit.state = createKitState();
  kit.db = createCutsDb({
    goal_university_cuts: [
      { id: 1, cut_type: "normal", is_active: true, avg_cut: 2.1 },
      { id: 2, cut_type: "special", is_active: true, avg_cut: 3.3 },
      { id: 3, cut_type: "jungsi", is_active: false, avg_cut: 88 },
      { id: 4, cut_type: "normal", is_active: true, avg_cut: null },
    ],
    goal_university_options: [
      { university_key: "A", department_key: "a", has_jungsi: true },
      { university_key: "A", department_key: "b", has_jungsi: false },
      { university_key: "B", department_key: "a", has_jungsi: false },
    ],
  });
});

describe("GET /api/goal/admin/cuts/summary", () => {
  test("보기 권한으로 여섯 건수와 정시 컷 없는 조합 수를 돌려준다", async () => {
    seedAdmin(kit.state, "view", MENU);
    const r = await call();
    expect(() => cutsSummaryResponse.parse(r.body)).not.toThrow();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      total: 4,
      active: 3,
      normal: 2,
      special: 1,
      jungsi: 1,
      missing: 1,
      comboTotal: 3,
      comboNoJungsi: 2,
    });
  });

  test("메뉴 권한이 없으면 403 이고 DB 를 읽지 않는다", async () => {
    seedAdmin(kit.state, "none", MENU);
    const r = await call();
    expect(r.status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });
});

describe("읽기 시작", () => {
  test("건수 읽기와 옵션 읽기를 함께 시작한다", async () => {
    seedAdmin(kit.state, "view", MENU);
    const gated = gateReads(
      createCutsAdmin(kit.state, kit.db),
      (target) =>
        target.kind === "from" &&
        (target.name === "goal_university_cuts" ||
          target.name === "goal_university_options"),
    );
    kit.wrap = () => gated.admin;

    const request = call();
    await vi.waitFor(() =>
      expect(gated.gate.started.length).toBeGreaterThan(0),
    );
    await gated.gate.settle();
    expect([...new Set(gated.gate.started)].sort()).toEqual([
      "from:goal_university_cuts",
      "from:goal_university_options",
    ]);
    gated.gate.release();

    expect((await request).status).toBe(200);
  });
});
