// GET, PUT /api/admin/home-section-copy/:sectionKey 계약 검증. 섹션 키마다 메뉴 권한이 다르고,
// 모르는 키는 권한 판정이나 DB 읽기 전에 400 으로 막는다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  problemCode,
  queriesOn,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { sectionCopy } from "../../../shared/home-section-copy/contract.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/home-section-copy/:sectionKey" };

const call = (method: string, sectionKey: string, body?: unknown) =>
  callRoute(handler, { method, query: { sectionKey }, body });

const ROW = {
  section_key: "services",
  eyebrow: "라벨",
  title_main: "큰제목",
  title_sub: "중제목",
};

let row: unknown;
let permissionLookups: number;

function grant(resource_key: string, level: "view" | "edit") {
  const fake = createAdminFake({
    permissions: [{ resource_key, level }],
    tables: {
      home_section_copy: (query) =>
        argsOf(query, "upsert")
          ? { data: null, error: null }
          : { data: row, error: null },
    },
  });
  const rpc = fake.rpc;
  fake.rpc = (name, args) => {
    if (name === "fn_admin_effective_permissions") permissionLookups += 1;
    return rpc(name, args);
  };
  kit.admin = fake;
  return fake;
}

const admin = () => kit.admin as ReturnType<typeof createAdminFake>;
const copyQueries = () => queriesOn(admin(), "home_section_copy");
const upserts = () =>
  copyQueries()
    .map((query) => argsOf(query, "upsert"))
    .filter((args) => args !== undefined);

beforeEach(() => {
  permissionLookups = 0;
  row = ROW;
  grant("programCategories", "edit");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/home-section-copy/:sectionKey", () => {
  test("저장된 행을 그대로 돌려준다", async () => {
    const r = await call("GET", "services");

    expect(r.status).toBe(200);
    expect(r.body).toEqual(ROW);
    expect(sectionCopy.parse(r.body)).toEqual(r.body);
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  test("행이 아직 없으면 404 NOT_FOUND", async () => {
    row = null;

    const r = await call("GET", "services");

    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("모르는 섹션 키는 권한 조회와 DB 읽기 전에 400 VALIDATION_FAILED", async () => {
    const r = await call("GET", "nope");

    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(permissionLookups).toBe(0);
    expect(copyQueries()).toHaveLength(0);
  });

  test("섹션마다 그 메뉴의 보기 권한을 본다", async () => {
    grant("programCategories", "view");

    expect((await call("GET", "services")).status).toBe(200);
    expect((await call("GET", "mentor")).status).toBe(403);
    expect((await call("GET", "acceptance")).status).toBe(403);
  });

  test("DELETE 는 405 이고 Allow 는 GET, HEAD, PUT 이다", async () => {
    const r = await call("DELETE", "services");

    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("GET, HEAD, PUT");
  });
});

describe("PUT /api/admin/home-section-copy/:sectionKey", () => {
  const body = { eyebrow: "라벨", title_main: " 새 큰제목 ", title_sub: null };

  test("섹션 키 기준으로 upsert 하고 저장한 행을 돌려준다", async () => {
    const r = await call("PUT", "services", body);

    expect(r.status).toBe(200);
    const saved = {
      section_key: "services",
      eyebrow: "라벨",
      title_main: "새 큰제목",
      title_sub: null,
    };
    expect(r.body).toEqual(saved);
    expect(sectionCopy.parse(r.body)).toEqual(r.body);
    expect(upserts()).toEqual([[saved, { onConflict: "section_key" }]]);
  });

  test("라벨이 없는 acceptance 는 eyebrow 를 보내도 null 로 저장한다", async () => {
    grant("universityAcceptances", "edit");

    const r = await call("PUT", "acceptance", body);

    expect(r.status).toBe(200);
    expect(upserts()[0]?.[0]).toMatchObject({ eyebrow: null });
  });

  test("보기 권한만 있으면 403 이고 쓰지 않는다", async () => {
    grant("programCategories", "view");

    const r = await call("PUT", "services", body);

    expect(r.status).toBe(403);
    expect(upserts()).toHaveLength(0);
  });

  test("모르는 섹션 키는 400 이고 쓰지 않는다", async () => {
    const r = await call("PUT", "nope", body);

    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(upserts()).toHaveLength(0);
  });

  test.each([
    [{ ...body, title_main: "   " }],
    [{ ...body, title_main: undefined }],
    [{ eyebrow: "a", title_main: "b" }],
  ])("큰제목이 비었거나 모양이 틀린 본문 %j 은 400", async (bad) => {
    const r = await call("PUT", "services", bad);

    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(upserts()).toHaveLength(0);
  });

  test("본문이 틀리면 errors[0].message 에 예전 문구가 실리고 detail 은 그대로다", async () => {
    const r = await call("PUT", "services", { ...body, title_main: "   " });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      detail: "요청 값이 올바르지 않아요.",
      errors: [{ path: "title_main", message: "입력값을 확인해 주세요." }],
    });
  });

  test("깨진 JSON 본문도 400 VALIDATION_FAILED 이고 쓰지 않는다", async () => {
    const r = await app.request("/api/admin/home-section-copy/services", {
      method: "PUT",
      headers: {
        authorization: "Bearer admin-token",
        "content-type": "application/json",
      },
      body: "{",
    });

    expect(r.status).toBe(400);
    expect(problemCode(await r.json())).toBe("VALIDATION_FAILED");
    expect(upserts()).toHaveLength(0);
  });
});
