// GET, POST /api/goal/admin/cuts/backfill 계약 검증.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  backfillApplyResponse,
  backfillPreviewResponse,
} from "../../../../shared/goal/admin-cuts.js";
import { seedAdmin } from "../../../_lib/admin-sections/sectionTestKit.js";
import {
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";
import { gateReads } from "../../../_lib/gatedReads.testkit.js";
import {
  type CutsCall,
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

const handler = { app, path: "/api/goal/admin/cuts/backfill" };

beforeEach(() => {
  kit.wrap = null;
});

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
    expect(() => backfillPreviewResponse.parse(r.body)).not.toThrow();
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

const goodBody = {
  yearMode: "prefer2026",
  preserveMode: "preserve",
  orphanMode: "deactivate",
  expectedApplyCount: 6,
  expectedOrphanCount: 2,
};
const writes = () => kit.db.calls.filter((c) => c.op !== "select");

describe("POST /api/goal/admin/cuts/backfill", () => {
  test("보기 권한만 있으면 403 이고 아무것도 읽거나 쓰지 않는다", async () => {
    seedAdmin(kit.state, "view", MENU);
    const r = await apply(goodBody);
    expect(r.status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });

  test("미리보기와 같으면 8개 키로 upsert 하고 보존, name 축 충돌 행은 빼며 고아는 끄기만 한다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const r = await apply(goodBody);
    expect(() => backfillApplyResponse.parse(r.body)).not.toThrow();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ applied: 6, deactivated: 2 });

    const [upsert, deactivate] = writes() as [CutsCall, CutsCall];
    expect(upsert.op).toBe("upsert");
    expect(upsert.onConflict).toBe("cut_type,university_key,department_key");
    const rows = upsert.values as Record<string, unknown>[];
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        [
          "avg_cut",
          "cut_type",
          "department_key",
          "department_name",
          "source",
          "source_year",
          "university_key",
          "university_name",
        ].sort(),
      );
    }
    const has = (univ: string, type: string) =>
      rows.some((row) => row.university_key === univ && row.cut_type === type);
    // 관리자가 만든 디/철학/normal 은 보존 모드라 빠진다. special 은 유도 행이라 들어간다.
    expect(has(D, "normal")).toBe(false);
    expect(has(D, "special")).toBe(true);
    // name 축 충돌 행(에이/국문/normal)은 빠진다.
    expect(has(A, "normal")).toBe(false);
    expect(has(A, "special")).toBe(true);

    expect(deactivate.op).toBe("update");
    expect(deactivate.values).toEqual({ is_active: false });
    expect(deactivate.filters).toEqual([["id", "in", [3, 5]]]);
    // 목록에서 사라질 뿐 행은 지워지지 않는다.
    const after = kit.db.tables.goal_university_cuts ?? [];
    expect(after.map((row) => row.id)).toEqual(
      expect.arrayContaining([1, 2, 3, 4, 5]),
    );
    expect(after.filter((row) => [3, 5].includes(row.id as number))).toEqual([
      expect.objectContaining({ is_active: false }),
      expect.objectContaining({ is_active: false }),
    ]);
  });

  test("고아를 그대로 두는 모드면 노출을 끄지 않는다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const r = await apply({ ...goodBody, orphanMode: "keep" });
    expect(r.body).toEqual({ applied: 6, deactivated: 0 });
    expect(writes().map((c) => c.op)).toEqual(["upsert"]);
  });

  test("덮어쓰기 모드는 보존 행도 반영한다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const r = await apply({
      ...goodBody,
      preserveMode: "overwrite",
      expectedApplyCount: 7,
    });
    expect(r.body).toEqual({ applied: 7, deactivated: 2 });
  });

  test("확인한 건수와 다시 계산한 건수가 다르면 409 이고 쓰지 않는다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    const stale = await apply({ ...goodBody, expectedApplyCount: 5 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "BACKFILL_PREVIEW_STALE" });
    const staleOrphan = await apply({ ...goodBody, expectedOrphanCount: 1 });
    expect(staleOrphan.status).toBe(409);
    expect(staleOrphan.body).toMatchObject({ code: "BACKFILL_PREVIEW_STALE" });
    expect(writes()).toHaveLength(0);
  });

  test("본문이 올바르지 않으면 400", async () => {
    seedAdmin(kit.state, "edit", MENU);
    expect((await apply({ ...goodBody, orphanMode: "delete" })).status).toBe(
      400,
    );
    expect((await apply({ ...goodBody, expectedApplyCount: -1 })).status).toBe(
      400,
    );
    expect((await apply({})).status).toBe(400);
    expect(kit.db.calls).toHaveLength(0);
  });

  test("중간 청크가 실패하면 이미 반영된 행 수를 알리고 멈춘다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    // 300개 대학 x (normal, special) = 600행이라 500행 청크가 둘이다.
    kit.db = createCutsDb({
      admission_results: Array.from({ length: 300 }, (_, i) =>
        ar(`대학${i}대학교`, "학과", "교과", 3),
      ),
      goal_university_cuts: [],
    });
    let upserts = 0;
    kit.db.fail = (call) => {
      if (call.op !== "upsert") return undefined;
      upserts += 1;
      return upserts === 2 ? { code: "XX000", message: "boom" } : undefined;
    };
    const r = await apply({
      ...goodBody,
      expectedApplyCount: 600,
      expectedOrphanCount: 0,
    });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      code: "BACKFILL_APPLY_FAILED",
      applied: 500,
      step: "upsert",
      range: "501~600",
    });
    expect(kit.db.tables.goal_university_cuts).toHaveLength(500);
  });

  test("중간 청크가 중복 위반으로 실패하면 매핑된 코드, 상태, 안내와 청크 정보를 보낸다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    kit.db = createCutsDb({
      admission_results: Array.from({ length: 300 }, (_, i) =>
        ar(`대학${i}대학교`, "학과", "교과", 3),
      ),
      goal_university_cuts: [],
    });
    let upserts = 0;
    kit.db.fail = (call) => {
      if (call.op !== "upsert") return undefined;
      upserts += 1;
      return upserts === 2
        ? {
            code: "23505",
            message: "duplicate key 홍길동",
            details:
              "Key (university_key, department_key)=(홍길동, x) already exists.",
          }
        : undefined;
    };
    const r = await apply({
      ...goodBody,
      expectedApplyCount: 600,
      expectedOrphanCount: 0,
    });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "DB_UNIQUE_VIOLATION",
      detail: "이미 등록된 값입니다(중복).",
      applied: 500,
      step: "upsert",
      range: "501~600",
      columns: ["university_key", "department_key"],
    });
    expect(r.body).not.toHaveProperty("dbCode");
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
  });

  test("고아 노출 끄기가 실패하면 반영된 행 수와 함께 알린다", async () => {
    seedAdmin(kit.state, "edit", MENU);
    kit.db.fail = (call) =>
      call.op === "update" ? { code: "XX000", message: "boom" } : undefined;
    const r = await apply(goodBody);
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      code: "BACKFILL_APPLY_FAILED",
      applied: 6,
      step: "deactivate",
    });
  });
});

describe("읽기 시작", () => {
  test("원천 행 읽기와 기존 컷 읽기를 함께 시작한다", async () => {
    seedAdmin(kit.state, "view", MENU);
    const gated = gateReads(
      createCutsAdmin(kit.state, kit.db),
      (target) =>
        target.kind === "from" &&
        (target.name === "admission_results" ||
          target.name === "goal_university_cuts"),
    );
    kit.wrap = () => gated.admin;

    const request = preview();
    await vi.waitFor(() =>
      expect(gated.gate.started.length).toBeGreaterThan(0),
    );
    await gated.gate.settle();
    expect([...new Set(gated.gate.started)].sort()).toEqual([
      "from:admission_results",
      "from:goal_university_cuts",
    ]);
    gated.gate.release();

    expect((await request).status).toBe(200);
  });
});
