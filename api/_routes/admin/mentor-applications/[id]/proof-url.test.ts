// POST /api/admin/mentor-applications/:id/proof-url 계약 검증.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./proof-url.js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";

const kitStorage = vi.hoisted(() => ({
  calls: [] as { bucket: string; path: string; ttl: number }[],
  result: {
    data: { signedUrl: "https://signed.example/x" },
    error: null,
  } as { data: unknown; error: unknown },
}));

let rows: Respond = () => ({
  data: { proof_file_path: "a/b.pdf" },
  error: null,
});

function setup(level: string | null = "view") {
  const fake = createAdminFake({
    permissions: level ? [{ resource_key: "mentorApplications", level }] : [],
    tables: { mentor_applications: (query) => rows(query) },
  });
  kit.admin = {
    ...fake,
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          kitStorage.calls.push({ bucket, path, ttl });
          return kitStorage.result;
        },
      }),
    },
  };
  return fake;
}

beforeEach(() => {
  kitStorage.calls = [];
  kitStorage.result = {
    data: { signedUrl: "https://signed.example/x" },
    error: null,
  };
  rows = () => ({ data: { proof_file_path: "a/b.pdf" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/mentor-applications/:id/proof-url", () => {
  const post = (query: Record<string, string> = { id: ID }) =>
    callRoute(handler, { method: "POST", query });

  test("view 권한이면 60초 서명 URL 을 no-store 로 돌려준다", async () => {
    const admin = setup("view");
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ url: "https://signed.example/x" });
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(kitStorage.calls).toEqual([
      { bucket: "mentor-applications", path: "a/b.pdf", ttl: 60 },
    ]);
    expect(argsOf(firstQuery(admin, "mentor_applications"), "eq")).toEqual([
      "id",
      ID,
    ]);
  });

  test("없는 신청은 404 NOT_FOUND 이고 서명하지 않는다", async () => {
    rows = () => ({ data: null, error: null });
    setup();
    const r = await post();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
    expect(kitStorage.calls).toEqual([]);
  });

  test.each([
    ["빈 경로", ""],
    ["경로 없음", null],
  ])("%s 이면 404 PROOF_NOT_FOUND 다", async (_l, path) => {
    rows = () => ({ data: { proof_file_path: path }, error: null });
    setup();
    const r = await post();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("PROOF_NOT_FOUND");
    expect(kitStorage.calls).toEqual([]);
  });

  test("스토리지에 객체가 없으면 404 PROOF_NOT_FOUND 다", async () => {
    kitStorage.result = {
      data: null,
      error: { statusCode: "404", message: "Object not found" },
    };
    setup();
    const r = await post();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("PROOF_NOT_FOUND");
  });

  test("그 밖의 스토리지 실패는 500 이고 원문을 싣지 않는다", async () => {
    kitStorage.result = {
      data: null,
      error: { statusCode: "500", message: "secret storage detail" },
    };
    setup();
    const r = await post();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret storage detail");
  });

  test("권한 행이 없으면 403 이다", async () => {
    setup(null);
    expect((await post()).status).toBe(403);
  });

  test("uuid 가 아닌 id 는 400 이다", async () => {
    setup();
    expect((await post({ id: "abc" })).status).toBe(400);
  });
});
