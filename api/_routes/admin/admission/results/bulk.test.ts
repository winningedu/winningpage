// POST /api/admin/admission/results/bulk 계약 검증. 한 번에 500행까지 받아 검증하고,
// id 없는 행은 insert, id 있는 행은 upsert 한다. 하나라도 어긋나면 아무것도 쓰지 않는다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ADMISSION_RESULTS_BULK_XLSX_COLUMNS,
  MAIN_TRACK_OPTIONS,
  RESULT_YEAR_OPTIONS,
  SCREENING_CATEGORY_OPTIONS,
} from "../../../../../src/lib/admissionResultsBulkXlsx.js";
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

import handler, { RESULT_OPTIONS } from "./bulk.js";

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

  test.each([
    [
      "필수 문자열이 비면 이름을 묶어 알린다",
      { university_key: " ", department_key: "" },
      "3번째 행: university_key, department_key가 비어 있습니다.",
    ],
    [
      "필수 문자열이 아예 없어도 같은 문구",
      { university_name: undefined },
      "3번째 행: university_name가 비어 있습니다.",
    ],
    [
      "허용하지 않는 학년도",
      { result_year: 2030 },
      "3번째 행: result_year는 2025/2026 중 하나여야 합니다(입력값: 2030).",
    ],
    [
      "허용하지 않는 중심전형",
      { main_track: "없음" },
      '3번째 행: main_track "없음"은(는) 허용 값(교과|종합|논술|실기|기타)이 아닙니다.',
    ],
    [
      "허용하지 않는 전형유형",
      { screening_category: "없음" },
      '3번째 행: screening_category "없음"은(는) 허용 값(일반|추천형|지역인재|농어촌|기회균형|특성화고|특수교육|논술|실기|성인학습자|재외국민|기타)이 아닙니다.',
    ],
    [
      "등급 범위 초과",
      { grade_50: 100 },
      "3번째 행: grade_50 값(100)이 numeric(4,2) 범위(절댓값 100 미만)를 벗어났습니다.",
    ],
    [
      "등급이 숫자가 아님",
      { grade_avg10: "abc" },
      '3번째 행: grade_avg10 값 "abc"이(가) 숫자가 아닙니다.',
    ],
    [
      "환산점수가 숫자가 아님",
      { converted_score: "x" },
      '3번째 행: converted_score 값 "x"이(가) 숫자가 아닙니다.',
    ],
    [
      "경쟁률 범위 초과",
      { competition_rate: 10000 },
      "3번째 행: competition_rate 값(10000)이 numeric(6,2) 범위(절댓값 10,000 미만)를 벗어났습니다.",
    ],
    [
      "모집인원이 정수가 아님",
      { quota: 1.5 },
      '3번째 행: quota 값 "1.5"이(가) 정수가 아닙니다.',
    ],
    [
      "variant_seq 가 정수가 아님",
      { variant_seq: null },
      '3번째 행: variant_seq 값 "null"이(가) 정수가 아닙니다.',
    ],
    [
      "is_active 가 불리언이 아님",
      { is_active: "true" },
      '3번째 행: is_active 값 "true"이(가) true/false 가 아닙니다.',
    ],
    [
      "문자열 칸에 숫자",
      { note: 5 },
      '3번째 행: note 값 "5"이(가) 문자열이 아닙니다.',
    ],
    [
      "id 가 양의 정수가 아님",
      { id: 0 },
      '3번째 행: id 값 "0"이(가) 양의 정수가 아닙니다.',
    ],
    [
      "모르는 키",
      { extra: 1 },
      "3번째 행: 허용하지 않는 컬럼이 있습니다: extra.",
    ],
  ])(
    "%s: 400 이고 아무것도 읽거나 쓰지 않는다",
    async (_name, over, detail) => {
      const r = await call({ items: [row(), row({ id: 1 }), row(over)] });

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION_FAILED", detail });
      expect(kit.state.inserts).toHaveLength(0);
      expect(kit.state.upserts).toHaveLength(0);
      expect(
        kit.state.reads.filter(
          (x) => x.table === "admission_results" && x.select !== undefined,
        ),
      ).toHaveLength(0);
    },
  );

  test("행이 객체가 아니면 400", async () => {
    const r = await call({ items: [row(), "x"] });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "2번째 행: 행 형식이 올바르지 않습니다.",
    });
  });

  test("0 인 등급과 경쟁률, 음수 점수는 값으로 받는다", async () => {
    const r = await call({
      items: [row({ grade_50: 0, competition_rate: 0, percentile: -1 })],
    });

    expect(r.status).toBe(200);
  });

  test("옵션 목록은 어드민 엑셀 파서의 상수와 같다", () => {
    expect(RESULT_OPTIONS.mainTrack).toEqual(MAIN_TRACK_OPTIONS);
    expect(RESULT_OPTIONS.screeningCategory).toEqual(
      SCREENING_CATEGORY_OPTIONS,
    );
    expect(RESULT_OPTIONS.resultYear).toEqual(RESULT_YEAR_OPTIONS);
  });

  test("쓰는 컬럼은 입력 키와 같고 파서 컬럼에서 id 를 뺀 것과 일치한다", async () => {
    await call({ items: [row()] });

    const [written] = (writes("inserts")[0]?.row ?? []) as unknown as object[];
    expect(Object.keys(written ?? {}).sort()).toEqual(
      ADMISSION_RESULTS_BULK_XLSX_COLUMNS.filter((c) => c !== "id").sort(),
    );
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
