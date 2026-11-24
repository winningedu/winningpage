// POST /api/admin/admission/results/bulk 계약 검증. 한 번에 500행까지 받아 검증하고,
// id 없는 행은 insert, id 있는 행은 upsert 한다. 하나라도 어긋나면 아무것도 쓰지 않는다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./bulk.js";

const call = (body?: unknown) => callHandler(handler, body, "POST");

function grant(resource_key: string, level: "view" | "edit") {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key, level }],
    error: null,
  });
}

// parseAdmissionResultRowsFromXlsx 가 만드는 payload 와 같은 모양(id 제외).
const row = (over: Record<string, unknown> = {}) => ({
  result_year: 2026,
  university_key: "snu",
  university_name: "서울대",
  department_key: "cs",
  department_name: "컴퓨터공학",
  main_track: "교과",
  screening_category: "일반",
  admission_track: "지역균형",
  grade_50: 1.2,
  grade_70: 1.5,
  grade_85: null,
  grade_90: null,
  grade_avg: null,
  grade_min: null,
  grade_avg10: null,
  grade_min10: null,
  grade_first_avg: null,
  converted_score: null,
  percentile: null,
  quota: 10,
  competition_rate: 3.5,
  waitlist_rank: null,
  subject_reflection: null,
  variant_seq: 0,
  source_sheet: null,
  source_row: null,
  note: null,
  is_active: true,
  ...over,
});

const writes = (kind: "inserts" | "upserts") =>
  kit.state[kind].filter((x) => x.table === "admission_results");

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  grant("admissionResults", "edit");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/admission/results/bulk", () => {
  test("id 없는 행은 한 번의 insert 로 순서대로 쓰고 건수를 돌려준다", async () => {
    const items = [row({ university_key: "a" }), row({ university_key: "b" })];

    const r = await call({ items });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ inserted: 2, updated: 0 });
    expect(writes("inserts")).toEqual([
      { table: "admission_results", row: items },
    ]);
    expect(writes("upserts")).toHaveLength(0);
  });

  test("id 있는 행은 id 존재를 먼저 확인하고 insert 다음에 upsert(onConflict id) 한다", async () => {
    kit.state.rows.admission_results = (f) =>
      matchRows([{ id: 5 }, { id: 6 }, { id: 7 }], f);
    const fresh = row({ university_key: "new" });
    const items = [
      row({ id: 5, university_key: "a" }),
      fresh,
      row({ id: 6, university_key: "b" }),
    ];

    const r = await call({ items });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ inserted: 1, updated: 2 });
    expect(
      kit.state.reads.filter(
        (x) => x.table === "admission_results" && x.select !== undefined,
      ),
    ).toEqual([expect.objectContaining({ select: "id" })]);
    expect(
      kit.state.events.filter((e) => e.endsWith(":admission_results")),
    ).toEqual(["insert:admission_results", "upsert:admission_results"]);
    expect(writes("inserts")[0]?.row).toEqual([fresh]);
    expect(writes("upserts")).toEqual([
      {
        table: "admission_results",
        row: [items[0], items[2]],
        onConflict: "id",
      },
    ]);
  });

  test("없는 id 가 하나라도 있으면 404 이고 insert 도 하지 않는다", async () => {
    kit.state.rows.admission_results = (f) => matchRows([{ id: 5 }], f);

    const r = await call({
      items: [row({ university_key: "new" }), row({ id: 5 }), row({ id: 9 })],
    });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_FOUND",
      detail: "없는 id 가 있습니다: 9",
    });
    expect(kit.state.inserts).toHaveLength(0);
    expect(kit.state.upserts).toHaveLength(0);
  });

  test("빈 items 는 DB 를 부르지 않고 0, 0", async () => {
    const r = await call({ items: [] });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ inserted: 0, updated: 0 });
    expect(
      kit.state.reads.filter((x) => x.table === "admission_results"),
    ).toHaveLength(0);
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("500행은 받고 501행은 400 이며 쓰지 않는다", async () => {
    const ok = await call({ items: Array.from({ length: 500 }, () => row()) });
    expect(ok.status).toBe(200);

    kit.state.inserts.length = 0;
    const r = await call({ items: Array.from({ length: 501 }, () => row()) });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(kit.state.inserts).toHaveLength(0);
  });

  test.each([[undefined], [{}], [{ items: "x" }]])(
    "본문 %j 은 400",
    async (body) => {
      const r = await call(body);

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    },
  );

  test("보기 권한만 있으면 403 이고 쓰지 않는다", async () => {
    grant("admissionResults", "view");

    const r = await call({ items: [row()] });

    expect(r.status).toBe(403);
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("DB 쓰기 오류는 500 이고 DB 문구를 싣지 않는다", async () => {
    kit.state.insertErrors.admission_results = { message: "secret db text" };

    const r = await call({ items: [row()] });

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret db text");
  });
});
