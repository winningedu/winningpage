import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPhoneCode } from "./phoneVerification";

function mockFetchOk() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, expires_in: 180, cooldown: 60 }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof mockFetchOk>) {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body));
}

describe("sendPhoneCode 소속 범위", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("옵션이 없으면 위닝 가입과 같은 본문만 보낸다", async () => {
    const fetchMock = mockFetchOk();

    await sendPhoneCode("010-1234-5678", "signup");

    expect(sentBody(fetchMock)).toEqual({
      phone: "01012345678",
      purpose: "signup",
    });
  });

  it("tenantId를 tenant_id로 실어 보낸다", async () => {
    const fetchMock = mockFetchOk();

    await sendPhoneCode("01012345678", "signup", { tenantId: "t-1" });

    expect(sentBody(fetchMock)).toEqual({
      phone: "01012345678",
      purpose: "signup",
      tenant_id: "t-1",
    });
  });

  it("기타 소속은 catch_all로 실어 보낸다", async () => {
    const fetchMock = mockFetchOk();

    await sendPhoneCode("01012345678", "signup", { catchAll: true });

    expect(sentBody(fetchMock)).toEqual({
      phone: "01012345678",
      purpose: "signup",
      catch_all: true,
    });
  });
});
