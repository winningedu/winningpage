import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupTenant, type SchoolSignupBody, submitSchoolSignup } from "./api";

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupTenant", () => {
  it("코드를 POST로 보내고 소속을 돌려받는다", async () => {
    const fetchMock = mockFetch(200, {
      tenantId: "t-1",
      name: "새빛중학교",
      orgType: "학교",
    });

    const result = await lookupTenant("ABCDEFGH");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/signup/tenant-lookup");
    expect(JSON.parse(String(init.body))).toEqual({ code: "ABCDEFGH" });
    expect(result).toEqual({
      ok: true,
      tenant: { id: "t-1", name: "새빛중학교", orgType: "학교" },
    });
  });

  it("없는 코드(404)는 not_found, 시도 초과(429)는 too_many로 구분한다", async () => {
    mockFetch(404, { code: "TENANT_NOT_FOUND" });
    expect(await lookupTenant("ABCDEFGH")).toEqual({
      ok: false,
      reason: "not_found",
    });

    mockFetch(429, { code: "WC068" });
    expect(await lookupTenant("ABCDEFGH")).toEqual({
      ok: false,
      reason: "too_many",
    });
  });

  it("네트워크 실패는 unknown이다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    expect(await lookupTenant("ABCDEFGH")).toEqual({
      ok: false,
      reason: "unknown",
    });
  });
});

const BODY: SchoolSignupBody = {
  username: "mentor01",
  password: "abc123!",
  name: "김학생",
  email: "a@b.co",
  phone: "01012345678",
  birthDate: "2010-03-04",
  gender: "남",
  tenantId: "t-1",
  grade: "중2",
  className: "3",
  number: 7,
  guardianConsent: false,
  agreeService: true,
  agreePrivacy: true,
  agreeDbTransfer: true,
  agreeMarketing: false,
};

describe("submitSchoolSignup", () => {
  it("본문을 POST로 보내고 세션과 연결코드를 돌려받는다", async () => {
    const fetchMock = mockFetch(200, {
      session: { access_token: "a", refresh_token: "r" },
      username: "mentor01",
      linkCode: "LINK12",
      tenantName: "새빛중학교",
    });

    const result = await submitSchoolSignup(BODY);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/signup/school-student");
    expect(JSON.parse(String(init.body))).toEqual(BODY);
    expect(result).toEqual({
      ok: true,
      session: { access_token: "a", refresh_token: "r" },
      username: "mentor01",
      linkCode: "LINK12",
      tenantName: "새빛중학교",
    });
  });

  it("서버 오류 코드를 그대로 돌려주고, 코드가 없으면 UNKNOWN이다", async () => {
    mockFetch(409, { code: "NUMBER_TAKEN_SAME_NAME", field: "number" });
    expect(await submitSchoolSignup(BODY)).toEqual({
      ok: false,
      code: "NUMBER_TAKEN_SAME_NAME",
    });

    mockFetch(500, {});
    expect(await submitSchoolSignup(BODY)).toEqual({
      ok: false,
      code: "UNKNOWN",
    });
  });
});
