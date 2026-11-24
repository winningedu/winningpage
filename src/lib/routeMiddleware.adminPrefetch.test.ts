// requireAdminMiddleware 목록 선받기 - 권한 응답을 기다리는 동안 엔진 섹션 목록 요청을 먼저 보낸다.
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

const { sectionKeys } = await import("@/pages/admin/engine/api");
const { registerMountedList } = await import(
  "@/pages/admin/engine/listNavigation"
);
const { sectionListQueryOptions } = await import(
  "@/pages/admin/engine/sectionList"
);
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

const listKey = (key: string, params?: { page: number; q: string }) =>
  sectionKeys.list(key, params);

describe("requireAdminMiddleware 목록 선받기", () => {
  it("권한 응답을 기다리는 동안 목록 요청이 먼저 나간다", async () => {
    const calls: string[] = [];
    const permission = deferred<unknown>();
    route(
      {
        [PERMISSIONS]: () => permission.promise,
        "admin/sections/banners": () => LIST_BODY,
      },
      calls,
    );

    const entering = enter("/admin/banners");
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    // 권한 응답은 아직 대기 중인데 목록 요청이 이미 나갔다(순서: 목록, 권한).
    expect(calls).toEqual(["admin/sections/banners", PERMISSIONS]);

    permission.resolve(permissionBody({ banners: "edit" })());
    await expect(entering).resolves.toBeUndefined();
    expect(listCalls(calls)).toHaveLength(1);
  });

  it("서버 페이지 섹션은 주소의 page 와 q 로 Admin.tsx 와 같은 키에 담는다", async () => {
    const calls: string[] = [];
    route(
      {
        [PERMISSIONS]: permissionBody({ admissionResults: "edit" }),
        "admin/sections/admissionResults": () => LIST_BODY,
      },
      calls,
    );

    await enter("/admin/admissionResults?page=2&q=서울&filter=x&stale=1");

    expect(
      queryClient.getQueryData(
        listKey("admissionResults", { page: 2, q: "서울" }),
      ),
    ).toEqual(LIST_BODY);
  });

  it("전량 섹션은 page 와 q 를 무시하고 섹션 키 하나에 담는다", async () => {
    const calls: string[] = [];
    route(
      {
        [PERMISSIONS]: permissionBody({ banners: "edit" }),
        "admin/sections/banners": () => LIST_BODY,
      },
      calls,
    );

    await enter("/admin/banners/?page=2&q=a");

    expect(queryClient.getQueryData(listKey("banners"))).toEqual(LIST_BODY);
  });

  it.each([
    ["등록 주소", "/admin/banners/new"],
    ["수정 주소", "/admin/banners/12"],
    ["커스텀 섹션", "/admin/hqDashboard"],
    ["/admin 자체", "/admin"],
    ["/demo", "/demo"],
  ])("%s 는 선받기를 하지 않는다", async (_label, path) => {
    const calls: string[] = [];
    route(
      {
        [PERMISSIONS]: permissionBody({
          banners: "edit",
          hqDashboard: "edit",
        }),
      },
      calls,
    );

    await enter(path);

    expect(listCalls(calls)).toEqual([]);
  });

  it("이전 이동에서 받은 목록은 새 이동마다 다시 받는다", async () => {
    const calls: string[] = [];
    route(
      {
        [PERMISSIONS]: permissionBody({ banners: "edit" }),
        "admin/sections/banners": () => LIST_BODY,
      },
      calls,
    );

    await enter("/admin/banners");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await enter("/admin/banners");

    await vi.waitFor(() => expect(listCalls(calls)).toHaveLength(2));
  });

  it("그 목록 화면이 떠 있는 채 바뀐 주소(필터)는 같은 이동으로 보고 다시 받지 않는다", async () => {
    const calls: string[] = [];
    route(
      {
        [PERMISSIONS]: permissionBody({ banners: "edit" }),
        "admin/sections/banners": () => LIST_BODY,
      },
      calls,
    );

    await enter("/admin/banners");
    const unmount = registerMountedList(
      sectionListQueryOptions("banners", { page: 1, q: "" }).queryKey,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await enter("/admin/banners?filter=x");
    unmount();

    expect(listCalls(calls)).toHaveLength(1);
  });

  it("무효화된 목록은 다시 받는다", async () => {
    const calls: string[] = [];
    route(
      {
        [PERMISSIONS]: permissionBody({ banners: "edit" }),
        "admin/sections/banners": () => LIST_BODY,
      },
      calls,
    );

    await enter("/admin/banners");
    await queryClient.invalidateQueries({
      queryKey: sectionKeys.section("banners"),
      refetchType: "none",
    });
    await enter("/admin/banners");

    await vi.waitFor(() => expect(listCalls(calls)).toHaveLength(2));
  });

  it("목록이 진행 중이면 같은 요청을 나눠 쓴다", async () => {
    const calls: string[] = [];
    const list = deferred<unknown>();
    route(
      {
        [PERMISSIONS]: permissionBody({ banners: "edit" }),
        "admin/sections/banners": () => list.promise,
      },
      calls,
    );

    await enter("/admin/banners");
    await enter("/admin/banners");

    expect(listCalls(calls)).toHaveLength(1);
    list.resolve(LIST_BODY);
  });

  it("들어갈 수 없어 다른 메뉴로 보내면 그 목록을 캐시에서 지운다", async () => {
    const calls: string[] = [];
    const list = deferred<unknown>();
    route(
      {
        [PERMISSIONS]: permissionBody({ popups: "edit" }),
        "admin/sections/banners": () => list.promise,
      },
      calls,
    );

    const caught = await rejection("/admin/banners");

    expect(caught).toBeInstanceOf(Response);
    list.resolve(LIST_BODY);
    await Promise.resolve();
    expect(
      queryClient.getQueryCache().find({ queryKey: listKey("banners") }),
    ).toBeUndefined();
  });

  it("관리자 금지로 막히면 목록 403 이 캐시에 남지 않는다", async () => {
    const calls: string[] = [];
    route(
      {
        [PERMISSIONS]: () => {
          throw apiError(403, "FORBIDDEN");
        },
        "admin/sections/banners": () => {
          throw apiError(403, "FORBIDDEN");
        },
      },
      calls,
    );
    mocks.post.mockImplementation(respondWith(() => ({ status: null })));

    expect(await rejection("/admin/banners")).toBeInstanceOf(
      AdminForbiddenError,
    );
    await Promise.resolve();
    expect(
      queryClient.getQueryCache().find({ queryKey: listKey("banners") }),
    ).toBeUndefined();
  });

  it("메뉴 권한이 하나도 없어 막혀도 목록을 지운다", async () => {
    const calls: string[] = [];
    route(
      {
        [PERMISSIONS]: permissionBody({}),
        "admin/sections/banners": () => LIST_BODY,
      },
      calls,
    );

    expect(await rejection("/admin/banners")).toBeInstanceOf(
      AdminForbiddenError,
    );
    await Promise.resolve();
    expect(
      queryClient.getQueryCache().find({ queryKey: listKey("banners") }),
    ).toBeUndefined();
  });

  it("세션이 없으면 선받기를 하지 않는다", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal("window", { location: { hash: "" } });

    await rejection("/admin/banners");

    expect(mocks.get).not.toHaveBeenCalled();
  });
});
