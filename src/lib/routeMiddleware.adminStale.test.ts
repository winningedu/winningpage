// requireAdminMiddleware 권한 stale-while-revalidate - 캐시된 권한이 있으면 기다리지 않고 통과하고 뒤에서 갱신한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authListeners: [] as ((event: string) => void)[],
  getSession: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/config/site", () => ({
  site: { company: {}, features: { callmentor: true, hqTenantAdmin: true } },
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: (listener: (event: string) => void) => {
        mocks.authListeners.push(listener);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    // 브라우저 직접 조회가 남아 있으면 바로 드러나게 한다.
    from: () => {
      throw new Error("browser supabase.from must not be used");
    },
    rpc: () => {
      throw new Error("browser supabase.rpc must not be used");
    },
  },
}));

vi.mock("./http/client", async (importActual) => ({
  ...(await importActual<typeof import("./http/client")>()),
  api: { get: mocks.get, post: mocks.post },
}));

const { adminPermissionsQueryOptions } = await import("./adminPermissions");
const { ApiError } = await import("./http/client");
const { queryClient } = await import("./queryClient");
const { AdminForbiddenError, requireAdminMiddleware } = await import(
  "./routeMiddleware"
);

function apiError(status: number | null, code = "ERR") {
  return new ApiError({ status, code, detail: "x" });
}

/** ky 체인 흉내: get(...).json(schema) 가 응답을 스키마로 검증해 돌려준다. */
function respondWith(result: () => unknown) {
  return () => ({
    json: async (schema: { parse: (v: unknown) => unknown }) =>
      schema.parse(await result()),
  });
}

async function enter(path: string) {
  const request = new Request(`http://localhost${path}`);
  // @ts-expect-error - 이 미들웨어는 request 외 인자를 쓰지 않는다.
  return requireAdminMiddleware({ request }, () => {});
}

async function rejection(path: string) {
  try {
    await enter(path);
  } catch (error) {
    return error;
  }
  return undefined;
}

beforeEach(() => {
  for (const listener of mocks.authListeners) listener("SIGNED_OUT");
  queryClient.clear();
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u1" } } },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const LIST_BODY = { items: [], total: 0 };

/** 경로별 응답을 따로 건다. 호출 순서는 calls 에 쌓인다. */
function route(handlers: Record<string, () => unknown>, calls: string[]) {
  mocks.get.mockImplementation((path: string) => {
    calls.push(path);
    const handler = handlers[path];
    if (!handler) throw new Error(`unexpected GET ${path}`);
    return respondWith(handler)();
  });
}

const PERMISSIONS = "admin/me/permissions";
const permissionBody = (map: Record<string, "view" | "edit">) => () => ({
  permissions: map,
  isSuper: false,
});

function listCalls(calls: string[]) {
  return calls.filter((path) => path.startsWith("admin/sections/"));
}

/** 15초 캐시(역할, 권한 쿼리)를 모두 만료시킨다. Date 만 가짜로 돌려 프라미스는 그대로 흐른다. */
function expireCaches() {
  vi.setSystemTime(Date.now() + 16_000);
}

const mapOf = () =>
  queryClient.getQueryData(adminPermissionsQueryOptions("u1").queryKey);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

describe("requireAdminMiddleware 권한 stale-while-revalidate", () => {
  it("첫 진입은 권한 응답을 기다린다", async () => {
    const calls: string[] = [];
    const permission = deferred<unknown>();
    route({ [PERMISSIONS]: () => permission.promise }, calls);

    let settled = false;
    const entering = enter("/admin/hqDashboard").then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(calls).toEqual([PERMISSIONS]));
    await Promise.resolve();
    expect(settled).toBe(false);

    permission.resolve(permissionBody({ hqDashboard: "edit" })());
    await entering;
    expect(settled).toBe(true);
  });

  it("캐시된 권한이 있으면 만료 뒤에도 갱신을 기다리지 않고 통과한다", async () => {
    const calls: string[] = [];
    route({ [PERMISSIONS]: permissionBody({ hqDashboard: "edit" }) }, calls);
    await enter("/admin/hqDashboard");

    expireCaches();
    const refresh = deferred<unknown>();
    route({ [PERMISSIONS]: () => refresh.promise }, calls);

    // 갱신 응답이 아직 대기 중인데 이동이 끝난다(역할 캐시와 권한 캐시가 모두 만료된 상태).
    await expect(enter("/admin/hqDashboard")).resolves.toBeUndefined();
    expect(calls.filter((path) => path === PERMISSIONS)).toHaveLength(2);
    refresh.resolve(permissionBody({ hqDashboard: "edit" })());
  });

  it("뒤에서 받은 새 권한은 다음 이동부터 반영된다", async () => {
    const calls: string[] = [];
    route(
      {
        [PERMISSIONS]: permissionBody({ hqDashboard: "edit", popups: "edit" }),
      },
      calls,
    );
    await enter("/admin/hqDashboard");

    expireCaches();
    const refresh = deferred<unknown>();
    route({ [PERMISSIONS]: () => refresh.promise }, calls);
    await enter("/admin/hqDashboard");

    refresh.resolve(permissionBody({ popups: "edit" })());
    await vi.waitFor(() =>
      expect(mapOf()?.permissions.has("hqDashboard")).toBe(false),
    );

    const caught = await rejection("/admin/hqDashboard");
    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).headers.get("Location")).toBe("/admin/popups");
  });

  it("뒤에서 403 이 오면 다음 이동은 막는 경로(활성화 시도)를 거쳐 막힌다", async () => {
    const calls: string[] = [];
    route({ [PERMISSIONS]: permissionBody({ hqDashboard: "edit" }) }, calls);
    await enter("/admin/hqDashboard");

    expireCaches();
    const refresh = deferred<unknown>();
    route({ [PERMISSIONS]: () => refresh.promise }, calls);
    await enter("/admin/hqDashboard");
    refresh.reject(apiError(403, "FORBIDDEN"));
    await vi.waitFor(() =>
      expect(
        queryClient.getQueryState(adminPermissionsQueryOptions("u1").queryKey)
          ?.status,
      ).toBe("error"),
    );

    expireCaches();
    route(
      {
        [PERMISSIONS]: () => {
          throw apiError(403, "FORBIDDEN");
        },
      },
      calls,
    );
    mocks.post.mockImplementation(respondWith(() => ({ status: null })));

    expect(await rejection("/admin/hqDashboard")).toBeInstanceOf(
      AdminForbiddenError,
    );
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0]?.[0]).toBe("admin/me/activate");
  });

  it("뒤에서 5xx 가 오면 다음 이동은 다시 기다리고 읽지 못하면 닫는다", async () => {
    const calls: string[] = [];
    route({ [PERMISSIONS]: permissionBody({ hqDashboard: "edit" }) }, calls);
    await enter("/admin/hqDashboard");

    expireCaches();
    route(
      {
        [PERMISSIONS]: () => {
          throw apiError(500, "INTERNAL_ERROR");
        },
      },
      calls,
    );
    await expect(enter("/admin/hqDashboard")).resolves.toBeUndefined();

    // 갱신 실패로 쿼리가 무효화돼 다음 이동은 기다리며, 계속 실패하면 fail-closed 다.
    await vi.waitFor(() =>
      expect(
        queryClient.getQueryState(adminPermissionsQueryOptions("u1").queryKey)
          ?.status,
      ).toBe("error"),
    );
    expect(await rejection("/admin/hqDashboard")).toBeInstanceOf(
      AdminForbiddenError,
    );
  });
});
