import { beforeEach, describe, expect, test, vi } from "vitest";

const { fetchEntryMock, fetchSessionDetailMock, pickListMock } = vi.hoisted(
  () => ({
    fetchEntryMock: vi.fn(),
    fetchSessionDetailMock: vi.fn(),
    pickListMock: vi.fn(),
  }),
);

vi.mock("./api", () => ({
  fetchEntry: fetchEntryMock,
  fetchSessionDetail: fetchSessionDetailMock,
  pickList: pickListMock,
}));

import {
  SelfevalApiError,
  selfevalEntryQuery,
  selfevalPickQuery,
  selfevalQueryKeys,
  selfevalSessionQuery,
} from "./queries";

async function run(options: { queryFn?: unknown }) {
  return (options.queryFn as () => Promise<unknown>)();
}

beforeEach(() => {
  fetchEntryMock.mockReset();
  fetchSessionDetailMock.mockReset();
  pickListMock.mockReset();
});

describe("queryKey", () => {
  test("계정과 세션이 달라지면 키가 달라 캐시가 섞이지 않는다", () => {
    expect(selfevalEntryQuery("u1").queryKey).not.toEqual(
      selfevalEntryQuery("u2").queryKey,
    );
    expect(selfevalSessionQuery("u1", "s1").queryKey).not.toEqual(
      selfevalSessionQuery("u1", "s2").queryKey,
    );
    expect(selfevalPickQuery("u1", "s1").queryKey).toEqual(
      selfevalQueryKeys.pick("u1", "s1"),
    );
  });
});

describe("옵션", () => {
  test("userId 가 없으면 조회하지 않고 실패 재시도도 하지 않는다", () => {
    expect(selfevalEntryQuery(null).enabled).toBe(false);
    expect(selfevalEntryQuery("u1").enabled).toBe(true);
    expect(selfevalEntryQuery("u1").retry).toBe(0);
    expect(selfevalPickQuery("u1", "s1").staleTime).toBe(15_000);
  });

  test("sessionId 가 없으면 세션 쿼리도 꺼 둔다", () => {
    expect(selfevalSessionQuery("u1", null).enabled).toBe(false);
    expect(selfevalPickQuery("u1", null).enabled).toBe(false);
  });
});

describe("queryFn", () => {
  test("성공이면 본문을 돌려준다", async () => {
    fetchEntryMock.mockResolvedValue({ kind: "ok", data: { ok: true } });
    expect(await run(selfevalEntryQuery("u1"))).toEqual({ ok: true });
  });

  test("실패는 원본 결과를 든 SelfevalApiError 로 던진다", async () => {
    const result = {
      kind: "error",
      status: 403,
      code: "NO_ENTITLEMENT",
      message: "x",
    };
    pickListMock.mockResolvedValue(result);
    const error = (await run(selfevalPickQuery("u1", "s1")).catch(
      (e: unknown) => e,
    )) as SelfevalApiError;
    expect(error).toBeInstanceOf(SelfevalApiError);
    expect(error.result).toEqual(result);
  });
});
