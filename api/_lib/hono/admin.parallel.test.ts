// admin() 미들웨어의 병렬 판정: getUser 뒤 역할 조회, QA 쓰기 확인, 메뉴 권한 조회를 함께 시작하고 응답 우선순위는 그대로 둔다.
// 각 조회는 테스트가 푸는 deferred 라 시작 순서와 끝나는 순서를 테스트가 정한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const kit = vi.hoisted(() => ({ admin: null as unknown, audit: vi.fn() }));

vi.mock("../supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../accessLog/adminWrite.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../accessLog/adminWrite.js")>()),
  scheduleAdminAudit: kit.audit,
}));

import { RouteParamError } from "../handler.js";
import { admin, createAdminApp } from "./admin.js";
import { createRootApp } from "./root.js";

type Result = { data: unknown; error: unknown };
type Step = "role" | "qa" | "permission";

function deferred() {
  let resolve: (value: Result) => void = () => {};
  const promise = new Promise<Result>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// 조회마다 deferred 하나. started 는 시작한 순서, finished 는 끝난 순서다.
function gatedAdmin(
  user: Result = {
    data: { user: { id: "admin-1", email: "a@x.test" } },
    error: null,
  },
) {
  const gates = { role: deferred(), qa: deferred(), permission: deferred() };
  const started: Step[] = [];
  const finished: Step[] = [];
  const open = (step: Step) => {
    started.push(step);
    return gates[step].promise.then((value) => {
      finished.push(step);
      return value;
    });
  };
  return {
    gates,
    started,
    finished,
    auth: { getUser: async () => user },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => open(table === "profiles" ? "role" : "qa"),
        }),
      }),
    }),
    rpc: () => open("permission"),
  };
}

const ADMIN_ROLE: Result = { data: { role: "admin" }, error: null };
const USER_ROLE: Result = { data: { role: "user" }, error: null };
const LOOKUP_ERROR: Result = { data: null, error: { message: "x" } };
const NOT_QA: Result = { data: null, error: null };
const IS_QA: Result = { data: { profile_id: "admin-1" }, error: null };
const ALLOWED: Result = {
  data: [{ resource_key: "coupons", level: "edit" }],
  error: null,
};
const DENIED: Result = { data: [], error: null };

const options = {
  unhandledMessage: "데모를 처리하지 못했어요.",
  logLabel: "[admin/demo]",
};

const app = createRootApp().route(
  "/",
  createAdminApp()
    .get(
      "/api/admin/demo",
      admin({ ...options, permission: { key: "coupons" } }),
      (c) => c.json({ items: [] }),
    )
    .post(
      "/api/admin/demo",
      admin({ ...options, permission: { key: "coupons" } }),
      (c) => c.json({ id: "r1" }),
    )
    .post(
      "/api/admin/bad-key",
      admin({
        ...options,
        permission: {
          key: () => {
            throw new RouteParamError("section", "section 이 올바르지 않아요.");
          },
        },
      }),
      (c) => c.json({}),
    )
    .post("/api/admin/own", admin({ ...options, permission: "none" }), (c) =>
      c.json({ id: "own" }),
    ),
);

let fake: ReturnType<typeof gatedAdmin>;

const send = (
  path: string,
  method = "POST",
  headers: Record<string, string> = { authorization: "Bearer t" },
) => Promise.resolve(app.request(path, { method, headers }));

// 시작한 조회가 모두 보일 때까지 기다린다(끝난 조회는 없어야 한다).
async function waitStarted(...steps: Step[]) {
  await vi.waitFor(() =>
    expect([...fake.started].sort()).toEqual([...steps].sort()),
  );
  expect(fake.finished).toEqual([]);
}

async function outcome(response: Promise<Response>) {
  const r = await response;
  const body = (await r.json()) as { code?: string };
  return { status: r.status, code: body.code };
}

beforeEach(() => {
  vi.stubEnv("QA_ACCOUNT_GUARD_ENABLED", "true");
  fake = gatedAdmin();
  kit.admin = fake;
  kit.audit.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("병렬 시작", () => {
  test("쓰기 요청은 역할, QA, 메뉴 권한 조회가 모두 끝나기 전에 함께 시작한다", async () => {
    const response = send("/api/admin/demo");
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(ALLOWED);
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect((await response).status).toBe(200);
  });

  test("읽기 요청은 QA 확인 없이 역할과 메뉴 권한 조회를 함께 시작한다", async () => {
    const response = send("/api/admin/demo", "GET");
    await waitStarted("role", "permission");
    fake.gates.permission.resolve(ALLOWED);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect((await response).status).toBe(200);
  });

  test('permission "none" 은 메뉴 권한 조회를 하지 않고 감사 행도 없다', async () => {
    const response = send("/api/admin/own");
    await waitStarted("role", "qa");
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect((await response).status).toBe(200);
    expect(fake.started).not.toContain("permission");
    expect(kit.audit).not.toHaveBeenCalled();
  });
});

describe("응답 우선순위", () => {
  test("토큰이 없으면 401 이고 어떤 조회도 시작하지 않는다", async () => {
    const r = await outcome(send("/api/admin/demo", "POST", {}));
    expect(r).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    expect(fake.started).toEqual([]);
  });

  test("토큰이 무효면 401 이고 어떤 조회도 시작하지 않는다", async () => {
    fake = gatedAdmin({ data: { user: null }, error: { message: "bad" } });
    kit.admin = fake;
    const r = await outcome(send("/api/admin/demo"));
    expect(r).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    expect(fake.started).toEqual([]);
  });

  test("역할 조회 오류는 500 이고, 먼저 끝난 QA 차단과 권한 거부보다 앞선다", async () => {
    const response = outcome(send("/api/admin/demo"));
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(DENIED);
    fake.gates.qa.resolve(IS_QA);
    fake.gates.role.resolve(LOOKUP_ERROR);
    expect((await response).status).toBe(500);
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("관리자가 아니면 403 FORBIDDEN 이고, 먼저 끝난 QA 조회 오류와 권한 조회 오류보다 앞선다", async () => {
    const response = outcome(send("/api/admin/demo"));
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(LOOKUP_ERROR);
    fake.gates.qa.resolve(LOOKUP_ERROR);
    fake.gates.role.resolve(USER_ROLE);
    expect(await response).toEqual({ status: 403, code: "FORBIDDEN" });
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("관리자가 아니면 키 함수의 400 대신 403 이다", async () => {
    const response = outcome(send("/api/admin/bad-key"));
    await waitStarted("role", "qa");
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.role.resolve(USER_ROLE);
    expect(await response).toEqual({ status: 403, code: "FORBIDDEN" });
    expect(fake.started).not.toContain("permission");
  });

  test("QA 관리자의 쓰기는 403 QA_ACCOUNT_READ_ONLY 이고, 먼저 끝난 권한 조회 오류보다 앞선다", async () => {
    const response = outcome(send("/api/admin/demo"));
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(LOOKUP_ERROR);
    fake.gates.qa.resolve(IS_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect(await response).toEqual({
      status: 403,
      code: "QA_ACCOUNT_READ_ONLY",
    });
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("QA 조회 오류는 500 이고 권한 거부보다 앞선다", async () => {
    const response = outcome(send("/api/admin/demo"));
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(DENIED);
    fake.gates.qa.resolve(LOOKUP_ERROR);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect((await response).status).toBe(500);
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("QA 관리자도 키 함수의 400 대신 QA 403 이다", async () => {
    const response = outcome(send("/api/admin/bad-key"));
    await waitStarted("role", "qa");
    fake.gates.qa.resolve(IS_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect(await response).toEqual({
      status: 403,
      code: "QA_ACCOUNT_READ_ONLY",
    });
  });

  test("역할과 QA 를 통과하면 키 함수의 400 이고 감사 행은 없다", async () => {
    const response = outcome(send("/api/admin/bad-key"));
    await waitStarted("role", "qa");
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect(await response).toEqual({ status: 400, code: "VALIDATION_FAILED" });
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("권한 거부는 403 FORBIDDEN 이고 감사 행을 남긴다", async () => {
    const response = outcome(send("/api/admin/demo"));
    await waitStarted("role", "qa", "permission");
    fake.gates.role.resolve(ADMIN_ROLE);
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.permission.resolve(DENIED);
    expect(await response).toEqual({ status: 403, code: "FORBIDDEN" });
    expect(kit.audit).toHaveBeenCalledTimes(1);
    expect(kit.audit.mock.calls[0]?.[1]).toMatchObject({
      statusCode: 403,
      actor: { userId: "admin-1", email: "a@x.test" },
      requestedKey: "coupons",
    });
  });

  test("권한 조회 오류는 500 이고 감사 행을 남긴다", async () => {
    const response = outcome(send("/api/admin/demo"));
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(LOOKUP_ERROR);
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect((await response).status).toBe(500);
    expect(kit.audit).toHaveBeenCalledTimes(1);
    expect(kit.audit.mock.calls[0]?.[1]).toMatchObject({
      statusCode: 500,
      requestedKey: "coupons",
    });
  });

  test("모두 통과하면 200 이고 감사 행을 남긴다", async () => {
    const response = send("/api/admin/demo");
    await waitStarted("role", "qa", "permission");
    fake.gates.role.resolve(ADMIN_ROLE);
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.permission.resolve(ALLOWED);
    expect((await response).status).toBe(200);
    expect(kit.audit.mock.calls[0]?.[1]).toMatchObject({
      statusCode: 200,
      requestedKey: "coupons",
    });
  });
});
