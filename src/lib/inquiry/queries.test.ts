import { beforeEach, describe, expect, test, vi } from "vitest";

const { postSessionMock, fetchReportsMock, fetchSessionDetailMock } =
  vi.hoisted(() => ({
    postSessionMock: vi.fn(),
    fetchReportsMock: vi.fn(),
    fetchSessionDetailMock: vi.fn(),
  }));

vi.mock("./api", () => ({
  postSession: postSessionMock,
  fetchReports: fetchReportsMock,
  fetchSessionDetail: fetchSessionDetailMock,
}));

import {
  InquiryApiError,
  inquiryQueryKeys,
  inquiryReportsQuery,
  inquirySessionDetailQuery,
  inquirySessionQuery,
} from "./queries";

// queryFn 은 TanStack 컨텍스트를 받지만 이 팩토리들은 쓰지 않는다.
async function run(options: { queryFn?: unknown }) {
  const fn = options.queryFn as () => Promise<unknown>;
  return fn();
}

beforeEach(() => {
  postSessionMock.mockReset();
  fetchReportsMock.mockReset();
  fetchSessionDetailMock.mockReset();
});

describe("queryKey", () => {
  test("계정이 달라지면 키가 달라 캐시가 섞이지 않는다", () => {
    expect(inquirySessionQuery("u1").queryKey).not.toEqual(
      inquirySessionQuery("u2").queryKey,
    );
    expect(inquiryReportsQuery("u1").queryKey).toEqual(
      inquiryQueryKeys.reports("u1"),
    );
  });

  test("세션 상세 키는 sessionId 별로 갈린다", () => {
    expect(inquirySessionDetailQuery("u1", "s1").queryKey).not.toEqual(
      inquirySessionDetailQuery("u1", "s2").queryKey,
    );
  });

  test("모든 키가 inquiry 루트 아래라 한 번에 무효화할 수 있다", () => {
    for (const key of [
      inquiryQueryKeys.session("u1"),
      inquiryQueryKeys.reports("u1"),
      inquiryQueryKeys.sessionDetail("u1", "s1"),
    ]) {
      expect(key[0]).toBe(inquiryQueryKeys.root[0]);
    }
  });
});

describe("enabled, staleTime", () => {
  test("userId 가 없으면 조회하지 않는다", () => {
    expect(inquirySessionQuery(null).enabled).toBe(false);
    expect(inquiryReportsQuery(null).enabled).toBe(false);
    expect(inquirySessionDetailQuery(null, "s1").enabled).toBe(false);
    expect(inquirySessionQuery("u1").enabled).toBe(true);
  });

  test("sessionId 가 없으면 상세는 조회하지 않는다", () => {
    expect(inquirySessionDetailQuery("u1", null).enabled).toBe(false);
  });

  test("신선 시간은 15초다", () => {
    expect(inquirySessionQuery("u1").staleTime).toBe(15_000);
    expect(inquiryReportsQuery("u1").staleTime).toBe(15_000);
  });
});

describe("queryFn", () => {
  test("세션 부트스트랩은 resume 을 보내 성공 데이터를 돌려준다", async () => {
    postSessionMock.mockResolvedValue({ kind: "ok", data: { ok: true } });
    expect(await run(inquirySessionQuery("u1"))).toEqual({ ok: true });
    expect(postSessionMock).toHaveBeenCalledWith({ action: "resume" });
  });

  test("목록과 상세는 각 호출 결과를 푼다", async () => {
    fetchReportsMock.mockResolvedValue({ kind: "ok", data: { ok: true } });
    fetchSessionDetailMock.mockResolvedValue({
      kind: "ok",
      data: { ok: true, id: 1 },
    });
    expect(await run(inquiryReportsQuery("u1"))).toEqual({ ok: true });
    expect(await run(inquirySessionDetailQuery("u1", "s1"))).toEqual({
      ok: true,
      id: 1,
    });
    expect(fetchSessionDetailMock).toHaveBeenCalledWith("s1");
  });

  test("서버 오류는 InquiryApiError 로 던져 code 와 extra 를 보존한다", async () => {
    const result = {
      kind: "error",
      status: 403,
      code: "NO_ENTITLEMENT",
      message: "이용권이 없어요.",
      extra: { quota: null },
    };
    postSessionMock.mockResolvedValue(result);
    const error = await run(inquirySessionQuery("u1")).catch((e) => e);
    expect(error).toBeInstanceOf(InquiryApiError);
    expect((error as InquiryApiError).result).toEqual(result);
    expect((error as InquiryApiError).message).toBe(
      "inquiry-api-NO_ENTITLEMENT",
    );
  });

  test("타임아웃도 InquiryApiError 로 던진다", async () => {
    fetchReportsMock.mockResolvedValue({ kind: "timeout" });
    const error = await run(inquiryReportsQuery("u1")).catch((e) => e);
    expect(error).toBeInstanceOf(InquiryApiError);
    expect((error as InquiryApiError).message).toBe("inquiry-timeout");
  });
});
