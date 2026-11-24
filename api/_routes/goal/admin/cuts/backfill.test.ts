// GET, POST /api/goal/admin/cuts/backfill 계약 검증.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { seedAdmin } from "../../../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../../_lib/console/consoleTestKit.js";
import {
  type CutsDb,
  createCutsAdmin,
  createCutsDb,
} from "../../../../_lib/goal/cutsTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as CutsDb,
}));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createCutsAdmin(kit.state, kit.db),
}));

import handler from "./backfill.js";

const MENU = "goalUniversityCuts";
const preview = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", {
    yearMode: "prefer2026",
    preserveMode: "preserve",
    ...query,
  });
const apply = (body: Record<string, unknown>, method = "POST") =>
  callHandler(handler, body, method);

const ar = (
  university: string,
  department: string,
  track: string,
  grade: number,
  over: Record<string, unknown> = {},
) => ({
  university_name: university,
  department_name: department,
  main_track: track,
  grade_70: grade,
  result_year: 2026,
  screening_category: "일반",
  is_active: true,
  ...over,
});

const cutRow = (id: number, over: Record<string, unknown>) => ({
  id,
  cut_type: "normal",
  university_key: "",
  university_name: "",
  department_key: "",
  department_name: "",
  source: "admission_results",
  is_active: true,
  note: null,
  ...over,
});

const A = "에이대학교";
const B = "비이대학교";
const C = "씨대학교";
const D = "디대학교";

function seed() {
  kit.db = createCutsDb({
    admission_results: [
      ar(A, "국문", "교과", 2),
      ar(B, "영문", "교과", 3),
      ar(C, "사학", "종합", 4),
      ar(D, "철학", "교과", 5),
      // 아래 셋은 소스 조건에서 빠진다: 비활성, 등급 범위 밖, 자격 제한 전형.
      ar("제트대학교", "x", "교과", 3, { is_active: false }),
      ar("제트대학교", "y", "교과", 0.5),
      ar("제트대학교", "z", "교과", 3, { screening_category: "농어촌" }),
    ],
    goal_university_cuts: [
      // 관리자가 만든 행(보존 대상)
      cutRow(1, {
        university_key: D,
        university_name: D,
        department_key: "철학",
        department_name: "철학",
        source: "manual",
      }),
      // 유도 행인데 손대지 않음(덮어써도 되는 겹침)
      cutRow(2, {
        cut_type: "special",
        university_key: D,
        university_name: D,
        department_key: "철학",
        department_name: "철학",
      }),
      // 이번 산출에 없는 유도 행(고아)
      cutRow(3, {
        university_key: "제트대학교",
        university_name: "제트대학교",
        department_key: "폐지",
        department_name: "폐지",
      }),
      // 수기 행은 고아가 아니다
      cutRow(4, {
        university_key: "와이대학교",
        university_name: "와이대학교",
        department_key: "수기",
        department_name: "수기",
        source: "manual",
      }),
      // key 와 name 이 달라 name 축 유일 인덱스와 충돌할 행(산출에서 제외, 자신은 고아)
      cutRow(5, {
        university_key: `${A} 구`,
        university_name: A,
        department_key: "국문 구",
        department_name: "국문",
      }),
    ],
  });
}

beforeEach(() => {
  kit.state = createKitState();
  seed();
});

describe("GET /api/goal/admin/cuts/backfill", () => {
  test("보존 모드 미리보기: 산출, 겹침, 보존, name 축 충돌, 고아를 센다", async () => {
    seedAdmin(kit.state, "view", MENU);
    const r = await preview();
    expect(r.status).toBe(200);
    const body = r.body as {
      sourceRowCount: number;
      applyCount: number;
      orphanCount: number;
      stats: { totalRows: number; normalCount: number; specialCount: number };
      analysis: Record<string, number>;
    };
    // 소스 4행 -> 학과 4쌍 x (normal, special) = 8행
    expect(body.sourceRowCount).toBe(4);
    expect(body.stats).toMatchObject({
      totalRows: 8,
      normalCount: 4,
      specialCount: 4,
    });
    expect(body.analysis).toMatchObject({
      overlapCount: 2,
      manualCount: 1,
      inactiveCount: 0,
      notedCount: 0,
      preservedCount: 1,
      nameAxisCount: 1,
    });
    // 8 - name 축 1 - 보존 1
    expect(body.applyCount).toBe(6);
    // 3번(폐지)과 5번(name 축 충돌 행). 수기 4번은 아니다.
    expect(body.orphanCount).toBe(2);
    expect(kit.db.calls.every((c) => c.op === "select")).toBe(true);
  });

  test("덮어쓰기 모드는 보존 행도 반영 대상에 둔다(name 축 충돌만 뺀다)", async () => {
    seedAdmin(kit.state, "view", MENU);
    const r = await preview({ preserveMode: "overwrite" });
    expect((r.body as { applyCount: number }).applyCount).toBe(7);
  });

  test("소스 조회는 화면이 걸던 조건 그대로 건다", async () => {
    seedAdmin(kit.state, "view", MENU);
    await preview({ yearMode: "only2026" });
    const read = kit.db.calls.find(
      (c) => c.table === "admission_results" && !c.head,
    );
    expect(read?.filters).toEqual([
      ["is_active", "eq", true],
      ["grade_70", "gte", 1],
      ["grade_70", "lte", 9],
      ["screening_category", "in", ["일반", "추천형"]],
      ["result_year", "eq", 2026],
    ]);
    expect(read?.orders).toEqual([["id", true]]);
  });

  test("모르는 yearMode 는 400", async () => {
    seedAdmin(kit.state, "view", MENU);
    expect((await preview({ yearMode: "all" })).status).toBe(400);
    expect((await preview({ preserveMode: "x" })).status).toBe(400);
  });

  test("메뉴 권한이 없으면 403 이고 DB 를 읽지 않는다", async () => {
    seedAdmin(kit.state, "none", MENU);
    expect((await preview()).status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });
});
