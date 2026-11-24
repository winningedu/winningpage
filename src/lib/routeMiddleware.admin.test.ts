// requireAdminMiddleware 회귀 테스트 - 관리자 판정과 메뉴 권한을 브라우저 supabase 가 아니라
// /api/admin/me/permissions 와 /api/admin/me/activate 로 확인한다.
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

/** 권한 조회 횟수만 센다. 엔진 섹션 주소는 목록 선받기 요청도 같은 get 으로 나간다. */
function permissionCalls() {
  return mocks.get.mock.calls.filter(
    ([path]) => path === "admin/me/permissions",
  );
}

function permissions(map: Record<string, "view" | "edit">, isSuper = false) {
  mocks.get.mockImplementation((path: string) =>
    respondWith(() =>
      path === "admin/me/permissions"
        ? { permissions: map, isSuper }
        : { items: [], total: 0 },
    )(),
  );
}

function activation(result: () => unknown) {
  mocks.post.mockImplementation(respondWith(result));
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

describe("requireAdminMiddleware", () => {
  it("권한이 있는 관리자는 통과한다", async () => {
    permissions({ banners: "edit" });

    await expect(enter("/admin/banners")).resolves.toBeUndefined();
    expect(permissionCalls()).toHaveLength(1);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("세션이 없으면 로그인으로 보낸다", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal("window", { location: { hash: "" } });

    const caught = await rejection("/admin/banners");

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).headers.get("Location")).toContain("/login");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("그 메뉴 권한이 없으면 들어갈 수 있는 첫 메뉴로 보낸다", async () => {
    permissions({ popups: "edit" });

    const caught = await rejection("/admin/banners");

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).headers.get("Location")).toBe("/admin/popups");
  });

  it("들어갈 수 있는 메뉴가 하나도 없으면 막는다", async () => {
    permissions({});

    expect(await rejection("/admin/banners")).toBeInstanceOf(
      AdminForbiddenError,
    );
  });

  it("관리자가 아니고 활성화도 안 되면 막고, 다음 이동은 요청 없이 막는다", async () => {
    mocks.get.mockImplementation(
      respondWith(() => {
        throw apiError(403, "FORBIDDEN");
      }),
    );
    activation(() => ({ status: null }));

    expect(await rejection("/admin/banners")).toBeInstanceOf(
      AdminForbiddenError,
    );
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0]?.[0]).toBe("admin/me/activate");

    expect(await rejection("/admin/banners")).toBeInstanceOf(
      AdminForbiddenError,
    );
    expect(permissionCalls()).toHaveLength(1);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it("활성화 호출이 실패해도 막고 캐시한다", async () => {
    mocks.get.mockImplementation(
      respondWith(() => {
        throw apiError(403, "FORBIDDEN");
      }),
    );
    activation(() => {
      throw apiError(500, "INTERNAL_ERROR");
    });

    expect(await rejection("/admin/banners")).toBeInstanceOf(
      AdminForbiddenError,
    );
    expect(await rejection("/admin/banners")).toBeInstanceOf(
      AdminForbiddenError,
    );
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it("초대받은 관리자는 활성화되면 통과한다", async () => {
    let calls = 0;
    mocks.get.mockImplementation((path: string) =>
      respondWith(() => {
        if (path !== "admin/me/permissions") return { items: [], total: 0 };
        calls += 1;
        if (calls === 1) throw apiError(403, "FORBIDDEN");
        return { permissions: { banners: "edit" }, isSuper: false };
      })(),
    );
    activation(() => ({ status: "active" }));

    await expect(enter("/admin/banners")).resolves.toBeUndefined();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(permissionCalls()).toHaveLength(2);
  });

  it("서버 오류는 막되 캐시하지 않아 다음 이동에서 다시 묻는다", async () => {
    mocks.get.mockImplementation(
      respondWith(() => {
        throw apiError(500, "INTERNAL_ERROR");
      }),
    );

    expect(await rejection("/admin/banners")).toBeInstanceOf(
      AdminForbiddenError,
    );
    expect(mocks.post).not.toHaveBeenCalled();

    permissions({ banners: "edit" });
    await expect(enter("/admin/banners")).resolves.toBeUndefined();
  });

  it("역할과 권한이 신선하면 연속 이동에 요청을 더 보내지 않는다", async () => {
    permissions({ banners: "edit", popups: "view" });

    await enter("/admin/banners");
    await enter("/admin/popups");

    expect(permissionCalls()).toHaveLength(1);
  });

  it("/demo 는 메뉴 권한을 보지 않고 관리자만 통과시킨다", async () => {
    permissions({});

    await expect(enter("/demo")).resolves.toBeUndefined();
  });

  it("/demo 는 관리자가 아니면 막는다", async () => {
    mocks.get.mockImplementation(
      respondWith(() => {
        throw apiError(403, "FORBIDDEN");
      }),
    );
    activation(() => ({ status: null }));

    expect(await rejection("/demo")).toBeInstanceOf(AdminForbiddenError);
  });
});
