// defineHandler(auth:"admin") 의 병렬 판정: getUser 뒤 역할 조회, QA 쓰기 확인, 메뉴 권한 조회를 함께 시작하고 응답 우선순위는 그대로 둔다.
// 각 조회는 테스트가 푸는 deferred 라 시작 순서와 끝나는 순서를 테스트가 정한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const kit = vi.hoisted(() => ({ admin: null as unknown, audit: vi.fn() }));

vi.mock("./supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("./accessLog/adminWrite.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./accessLog/adminWrite.js")>()),
  scheduleAdminAudit: kit.audit,
}));

import { defineHandler, RouteParamError } from "./handler.js";

type Result = { data: unknown; error: unknown };
type Step = "role" | "qa" | "permission";

function deferred() {
  let resolve: (value: Result) => void = () => {};
  const promise = new Promise<Result>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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

type Permission = Parameters<typeof defineHandler>[0]["permission"];

const route = (permission?: Permission) =>
  defineHandler({
    methods: ["GET", "POST"],
    auth: "admin",
    errorShape: "problem",
    unhandledMessage: "처리하지 못했어요.",
    ...(permission ? { permission } : {}),
    handler: async (_req, res) => {
      res.status(200).json({ id: "r1" });
    },
  });

const menuRoute = route({ key: "coupons" });
const badKeyRoute = route({
  key: () => {
    throw new RouteParamError("section", "section 이 올바르지 않아요.");
  },
});
const noMenuRoute = route();

let fake: ReturnType<typeof gatedAdmin>;

async function send(
  handler: ReturnType<typeof defineHandler>,
  method = "POST",
  headers: Record<string, string> = { authorization: "Bearer t" },
) {
  const out = { status: 0, code: undefined as string | undefined };
  const res = {
    statusCode: 200,
    req: { headers },
    setHeader: () => res,
    status(code: number) {
      out.status = code;
      res.statusCode = code;
      return res;
    },
    json(payload: { code?: string }) {
      out.code = payload?.code;
      return res;
    },
    end(payload?: string) {
      out.code = payload
        ? (JSON.parse(payload) as { code?: string }).code
        : undefined;
      return res;
    },
  };
  await handler(
    {
      method,
      headers,
      query: {},
      body: undefined,
      url: "/api/demo",
    } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return out;
}

async function waitStarted(...steps: Step[]) {
  await vi.waitFor(() =>
    expect([...fake.started].sort()).toEqual([...steps].sort()),
  );
  expect(fake.finished).toEqual([]);
}

beforeEach(() => {
  vi.stubEnv("QA_ACCOUNT_GUARD_ENABLED", "true");
  fake = gatedAdmin();
  kit.admin = fake;
  kit.audit.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("병렬 시작", () => {
  test("쓰기 요청은 역할, QA, 메뉴 권한 조회가 모두 끝나기 전에 함께 시작한다", async () => {
    const response = send(menuRoute);
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(ALLOWED);
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect((await response).status).toBe(200);
  });

  test("읽기 요청은 QA 확인 없이 역할과 메뉴 권한 조회를 함께 시작한다", async () => {
    const response = send(menuRoute, "GET");
    await waitStarted("role", "permission");
    fake.gates.permission.resolve(ALLOWED);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect((await response).status).toBe(200);
  });

  test("permission 이 없는 라우트는 메뉴 권한 조회를 하지 않고 감사 행도 없다", async () => {
    const response = send(noMenuRoute);
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
    expect(await send(menuRoute, "POST", {})).toEqual({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(fake.started).toEqual([]);
  });

  test("토큰이 무효면 401 이고 어떤 조회도 시작하지 않는다", async () => {
    fake = gatedAdmin({ data: { user: null }, error: { message: "bad" } });
    kit.admin = fake;
    expect(await send(menuRoute)).toEqual({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(fake.started).toEqual([]);
  });

  test("역할 조회 오류는 500 이고, 먼저 끝난 QA 차단과 권한 거부보다 앞선다", async () => {
    const response = send(menuRoute);
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(DENIED);
    fake.gates.qa.resolve(IS_QA);
    fake.gates.role.resolve(LOOKUP_ERROR);
    expect((await response).status).toBe(500);
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("관리자가 아니면 403 FORBIDDEN 이고, 먼저 끝난 QA 조회 오류와 권한 조회 오류보다 앞선다", async () => {
    const response = send(menuRoute);
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(LOOKUP_ERROR);
    fake.gates.qa.resolve(LOOKUP_ERROR);
    fake.gates.role.resolve(USER_ROLE);
    expect(await response).toEqual({ status: 403, code: "FORBIDDEN" });
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("관리자가 아니면 키 함수의 400 대신 403 이다", async () => {
    const response = send(badKeyRoute);
    await waitStarted("role", "qa");
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.role.resolve(USER_ROLE);
    expect(await response).toEqual({ status: 403, code: "FORBIDDEN" });
    expect(fake.started).not.toContain("permission");
  });

  test("QA 관리자의 쓰기는 403 QA_ACCOUNT_READ_ONLY 이고, 먼저 끝난 권한 조회 오류보다 앞선다", async () => {
    const response = send(menuRoute);
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
    const response = send(menuRoute);
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(DENIED);
    fake.gates.qa.resolve(LOOKUP_ERROR);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect((await response).status).toBe(500);
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("QA 관리자도 키 함수의 400 대신 QA 403 이다", async () => {
    const response = send(badKeyRoute);
    await waitStarted("role", "qa");
    fake.gates.qa.resolve(IS_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect(await response).toEqual({
      status: 403,
      code: "QA_ACCOUNT_READ_ONLY",
    });
  });

  test("역할과 QA 를 통과하면 키 함수의 400 이고 감사 행은 없다", async () => {
    const response = send(badKeyRoute);
    await waitStarted("role", "qa");
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect(await response).toEqual({ status: 400, code: "VALIDATION_FAILED" });
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("권한 거부는 403 FORBIDDEN 이고 감사 행을 남긴다", async () => {
    const response = send(menuRoute);
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
    const response = send(menuRoute);
    await waitStarted("role", "qa", "permission");
    fake.gates.permission.resolve(LOOKUP_ERROR);
    fake.gates.qa.resolve(NOT_QA);
    fake.gates.role.resolve(ADMIN_ROLE);
    expect((await response).status).toBe(500);
    expect(kit.audit.mock.calls[0]?.[1]).toMatchObject({
      statusCode: 500,
      requestedKey: "coupons",
    });
  });

  test("모두 통과하면 200 이고 감사 행을 남긴다", async () => {
    const response = send(menuRoute);
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
