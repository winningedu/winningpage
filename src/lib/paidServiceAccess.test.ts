import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { apiFetchMock, getAuthHeaderMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  getAuthHeaderMock: vi.fn(),
}));

vi.mock("./apiFetch", () => ({
  apiFetch: apiFetchMock,
  getAuthHeader: getAuthHeaderMock,
}));

import { openPaidServiceOrAlert } from "./paidServiceAccess";

// 카드 컨텍스트가 어느 서비스 키로 매핑되는지는 create-service-ticket 요청 바디로만
// 관찰된다(getPaidServiceConfig는 비공개), 공개 진입점으로 검증한다.
async function resolvedServiceKey(service: Record<string, string>) {
  await openPaidServiceOrAlert(undefined, service);
  const call = apiFetchMock.mock.calls[0];
  if (!call) return null;
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)).service_key as string;
}

describe("openPaidServiceOrAlert 서비스 키 매핑", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getAuthHeaderMock.mockResolvedValue({ Authorization: "Bearer t" });
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ redirect_url: undefined }),
    });
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    apiFetchMock.mockReset();
    getAuthHeaderMock.mockReset();
  });

  test("이름에 성장설계가 있으면 growth 키로 티켓을 요청한다", async () => {
    expect(await resolvedServiceKey({ name: "위닝 성장설계" })).toBe("growth");
  });

  test("슬러그가 growth여도 growth 키로 매핑된다", async () => {
    expect(await resolvedServiceKey({ slug: "growth" })).toBe("growth");
  });

  test("기존 수행평가 매핑은 그대로다", async () => {
    expect(await resolvedServiceKey({ name: "수행평가" })).toBe("suhaeng");
  });
});
