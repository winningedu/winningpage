// PUT /api/admin/admission/guidelines/bulk 계약 검증. 대입모집요강 행을 (연도, 대학) 키로 한 번에 upsert 한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HWP_SECTION_JSON_KEYS } from "../../../src/lib/admissionDoc.js";
import { HWP_SECTION_HTML_KEYS } from "../../../src/lib/admissionParsing.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { guidelinesBulkSchema } from "../../../shared/admission/contract.js";
import {
  SECTION_HTML_KEYS,
  SECTION_JSON_KEYS,
} from "../../../shared/admission/guidelineRow.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/admission/guidelines/bulk" };

const call = (body?: unknown) => callRoute(handler, { method: "PUT", body });

function grant(resource_key: string, level: "view" | "edit") {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key, level }],
    error: null,
  });
}

// parseAdmissionRowsFromXlsx 가 만드는 payload 와 같은 모양(id, raw/json/html 은 선택).
const row = (over: Record<string, unknown> = {}) => ({
  admission_year: 2026,
  university_key: "snu",
  university_name: "서울대",
  region: "서울",
  campus: null,
  source_name: "",
  source_version: "",
  jungsi_guideline_url: null,
  official_source_url: null,
  memo: null,
  detail_status: null,
  matched_hwp_name: null,
  matched_text_name: null,
  is_active: true,
  ...over,
});

const writes = () =>
  kit.state.upserts.filter((x) => x.table === "admission_university_resources");

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  grant("admissionGuidelines", "edit");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PUT /api/admin/admission/guidelines/bulk", () => {
  test("모든 행을 순서대로 한 번의 upsert(연도, 대학 키)로 쓰고 건수를 돌려준다", async () => {
    const items = [
      row({ university_key: "a" }),
      row({ university_key: "b", id: "6f1c1b0e-8f0a-4d63-9a43-2f6f3f0f6a11" }),
    ];

    const r = await call({ items });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ upserted: 2 });
    // 서버 응답이 브라우저가 검증하는 계약을 통과한다.
    expect(guidelinesBulkSchema.safeParse(r.body).success).toBe(true);
    expect(writes()).toEqual([
      {
        table: "admission_university_resources",
        row: items,
        onConflict: "admission_year,university_key",
      },
    ]);
    expect(kit.state.upserts).toHaveLength(1);
  });

  test.each([
    [
      "연도, 대학 키, 지역이 비면 이름을 묶어 알린다",
      { admission_year: undefined, university_key: "", region: " " },
      "3번째 행: admission_year, university_key, region가 비어 있습니다.",
    ],
    [
      "대학명이 비면 따로 알린다",
      { university_name: "  " },
      "3번째 행: university_name이 비어 있습니다.",
    ],
    [
      "연도가 양의 정수가 아님",
      { admission_year: 2026.5 },
      '3번째 행: admission_year 값 "2026.5"이(가) 양의 정수가 아닙니다.',
    ],
    [
      "연도가 문자열",
      { admission_year: "2026" },
      '3번째 행: admission_year 값 "2026"이(가) 양의 정수가 아닙니다.',
    ],
    [
      "문자열 칸에 숫자",
      { campus: 5 },
      '3번째 행: campus 값 "5"이(가) 문자열이 아닙니다.',
    ],
    [
      "source_version 은 null 이 될 수 없다",
      { source_version: null },
      '3번째 행: source_version 값 "null"이(가) 문자열이 아닙니다.',
    ],
    [
      "is_active 가 불리언이 아님",
      { is_active: "true" },
      '3번째 행: is_active 값 "true"이(가) true/false 가 아닙니다.',
    ],
    [
      "id 가 uuid 가 아님",
      { id: "7" },
      '3번째 행: id 값 "7"이(가) uuid 가 아닙니다.',
    ],
    [
      "원문 칸에 숫자",
      { selection_method: 3 },
      '3번째 행: selection_method 값 "3"이(가) 문자열이 아닙니다.',
    ],
    [
      "json 칸에 문자열",
      { selection_method_json: "x" },
      '3번째 행: selection_method_json 값 "x"이(가) 객체 또는 null 이 아닙니다.',
    ],
    [
      "html 칸에 숫자",
      { recruitment_result_html: 1 },
      '3번째 행: recruitment_result_html 값 "1"이(가) 문자열이 아닙니다.',
    ],
    [
      "모르는 키",
      { recruitment_quota_html: "<p/>" },
      "3번째 행: 허용하지 않는 컬럼이 있습니다: recruitment_quota_html.",
    ],
  ])("%s: 400 이고 아무것도 쓰지 않는다", async (_name, over, detail) => {
    const r = await call({
      items: [row(), row({ university_key: "b" }), row(over)],
    });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ message: detail }],
    });
    expect(kit.state.upserts).toHaveLength(0);
  });

  test("행이 객체가 아니면 400", async () => {
    const r = await call({ items: [row(), null] });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      errors: [{ message: "2번째 행: 행 형식이 올바르지 않습니다." }],
    });
  });

  test("raw, json, html 선택 컬럼은 그대로 통과해 쓰인다", async () => {
    const section = {
      previous_year_changes: "원문",
      previous_year_changes_json: { v: 1 },
      previous_year_changes_html: "<p>x</p>",
      recruitment_quota: "",
      recruitment_quota_json: null,
      recruitment_result_html: null,
    };
    const item = row({
      id: "6f1c1b0e-8f0a-4d63-9a43-2f6f3f0f6a11",
      ...section,
    });

    const r = await call({ items: [item] });

    expect(r.status).toBe(200);
    expect(writes()[0]?.row).toEqual([item]);
  });

  test("섹션 json, html 키 목록은 파서의 상수와 같다", () => {
    expect(SECTION_JSON_KEYS).toEqual(HWP_SECTION_JSON_KEYS);
    expect(SECTION_HTML_KEYS).toEqual(HWP_SECTION_HTML_KEYS);
  });

  test("빈 items 는 DB 를 부르지 않고 upserted 0", async () => {
    const r = await call({ items: [] });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ upserted: 0 });
    expect(kit.state.upserts).toHaveLength(0);
    expect(
      kit.state.reads.filter(
        (x) => x.table === "admission_university_resources",
      ),
    ).toHaveLength(0);
  });

  test.each([[undefined], [{}], [{ items: "x" }]])(
    "본문 %j 은 400",
    async (body) => {
      const r = await call(body);

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({
        code: "VALIDATION_FAILED",
        errors: [{ message: "items 는 행 배열이어야 합니다." }],
      });
      expect(kit.state.upserts).toHaveLength(0);
    },
  );

  test("보기 권한만 있으면 403 이고 쓰지 않는다", async () => {
    grant("admissionGuidelines", "view");

    const r = await call({ items: [row()] });

    expect(r.status).toBe(403);
    expect(kit.state.upserts).toHaveLength(0);
  });

  test("입결 메뉴 권한만으로는 403", async () => {
    grant("admissionResults", "edit");

    expect((await call({ items: [row()] })).status).toBe(403);
  });

  test("DB 쓰기 오류는 500 이고 DB 문구를 싣지 않는다", async () => {
    kit.state.insertErrors.admission_university_resources = {
      message: "secret db text",
    };

    const r = await call({ items: [row()] });

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret db text");
  });
});
