// PUT /api/admin/ai-telemetry-pricing 계약 검증. 단가표 통째 교체 저장.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  callsOf,
  createAdminFake,
  problemCode,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { app } from "../app.js";

const handler = { app, path: "/api/admin/ai-telemetry-pricing" };

const TABLE = {
  "gemini-x": {
    input_usd_per_1m: 1,
    output_usd_per_1m: 2,
    cached_input_usd_per_1m: 0.5,
  },
};

let settings: Respond;

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "aiTelemetry", level }] : [],
    tables: { app_settings: (query) => settings(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const put = (body: unknown = { pricing: TABLE }) =>
  callRoute(handler, { method: "PUT", body });

const writes = (admin: ReturnType<typeof createAdminFake>) =>
  admin.queries.filter((q) => q.table === "app_settings");

beforeEach(() => {
  settings = () => ({ data: null, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("메서드와 응답 헤더", () => {
  test("GET 은 Allow 를 실은 405 이고 쓰지 않는다", async () => {
    const admin = setup();
    const r = await callRoute(handler, { method: "GET" });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("PUT");
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
    expect(writes(admin)).toEqual([]);
  });

  test("저장 응답은 no-store 다", async () => {
    setup();
    const r = await put();
    expect(r.headers["cache-control"]).toBe("no-store");
  });
});

describe("권한", () => {
  test("edit 권한이면 저장하고 { pricing } 만 돌려준다", async () => {
    setup("edit");
    const r = await put();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ pricing: TABLE });
  });

  test("view 권한은 403 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await put();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(writes(admin)).toEqual([]);
  });

  test("권한 행이 없으면 403 이고 쓰지 않는다", async () => {
    const admin = setup(null);
    expect((await put()).status).toBe(403);
    expect(writes(admin)).toEqual([]);
  });
});

describe("저장", () => {
  test("app_settings 의 단가 키 한 행만 value 와 updated_at 으로 upsert 한다", async () => {
    const admin = setup();
    await put();
    const queries = writes(admin);
    expect(queries).toHaveLength(1);
    const [query] = queries;
    if (!query) throw new Error("쿼리가 없습니다.");
    const [row, options] = argsOf(query, "upsert") as [
      Record<string, unknown>,
      unknown,
    ];
    expect(Object.keys(row).sort()).toEqual(["key", "updated_at", "value"]);
    expect(row.key).toBe("ai_model_pricing");
    expect(row.value).toEqual(TABLE);
    expect(Number.isNaN(Date.parse(String(row.updated_at)))).toBe(false);
    expect(options).toEqual({ onConflict: "key" });
    expect(callsOf(query, "delete")).toEqual([]);
  });

  test("저장 오류는 500 이다", async () => {
    setup();
    settings = () => ({ data: null, error: { message: "boom" } });
    expect((await put()).status).toBe(500);
  });
});

describe("입력 검증", () => {
  test.each([
    ["pricing 없음", {}],
    ["pricing 이 배열", { pricing: [] }],
    [
      "음수 단가",
      {
        pricing: {
          m: {
            input_usd_per_1m: -1,
            output_usd_per_1m: 0,
            cached_input_usd_per_1m: 0,
          },
        },
      },
    ],
    ["단가 항목 누락", { pricing: { m: { input_usd_per_1m: 1 } } }],
    [
      "모델 21개",
      {
        pricing: Object.fromEntries(
          Array.from({ length: 21 }, (_, i) => [`m${i}`, TABLE["gemini-x"]]),
        ),
      },
    ],
  ])("%s 는 400 VALIDATION_FAILED 이고 쓰지 않는다", async (_n, body) => {
    const admin = setup();
    const r = await put(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(writes(admin)).toEqual([]);
  });
});
