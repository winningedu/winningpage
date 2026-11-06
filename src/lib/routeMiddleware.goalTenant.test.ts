// 목표관리 진입 미들웨어: 스쿨멘토는 결제 이동 대신 기관 사유 오류를 던지고, 위닝은 결제로 보낸다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
const entitlement = vi.hoisted(() => ({
  value: { allowed: false, tenantReason: null as string | null },
}));

vi.mock("@/config/site", () => ({
  site: { company: {}, features: siteState },
}));
vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: {} } }),
      getSession: async () => ({
        data: { session: { user: { id: "u1" } } },
      }),
    },
  },
}));
vi.mock("./goalOnboarding", () => ({ isOnboardingDone: async () => true }));
vi.mock("./programEntry", () => ({ markProgramEntry: () => undefined }));
vi.mock("./queryClient", () => ({
  queryClient: {},
  entitlementQueryOptions: () => ({ queryKey: ["entitlement"] }),
}));
vi.mock("./staleWhileRevalidateQuery", () => ({
  resolveStaleWhileRevalidate: async () => entitlement.value,
}));

const { requireGoalAccessMiddleware, ServiceBlockedError } = await import(
  "./routeMiddleware"
);

async function run() {
  try {
    await requireGoalAccessMiddleware(
      // @ts-expect-error - 미들웨어가 request 만 읽는다.
      { request: new Request("https://x.test/app/goal") },
      () => {},
    );
  } catch (error) {
    return error;
  }
  return undefined;
}

beforeEach(() => {
  entitlement.value = { allowed: false, tenantReason: null };
});

describe("requireGoalAccessMiddleware 거부", () => {
  it("위닝은 /pricing 으로 redirect 한다", async () => {
    siteState.tenantServiceGate = false;
    const caught = await run();
    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).headers.get("Location")).toContain(
      "/pricing?service=goal",
    );
  });

  it("스쿨멘토는 사유를 담은 ServiceBlockedError 를 던진다", async () => {
    siteState.tenantServiceGate = true;
    entitlement.value = { allowed: false, tenantReason: "grace" };
    const caught = await run();
    expect(caught).toBeInstanceOf(ServiceBlockedError);
    expect((caught as InstanceType<typeof ServiceBlockedError>).reason).toBe(
      "grace",
    );
  });
});
