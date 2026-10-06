import { beforeEach, describe, expect, test, vi } from "vitest";

const { fetchSurveyBootstrapMock, fetchReportsMock, fetchPlanMock } =
  vi.hoisted(() => ({
    fetchSurveyBootstrapMock: vi.fn(),
    fetchReportsMock: vi.fn(),
    fetchPlanMock: vi.fn(),
  }));

vi.mock("./api", () => ({
  fetchSurveyBootstrap: fetchSurveyBootstrapMock,
  fetchReports: fetchReportsMock,
  fetchPlan: fetchPlanMock,
}));

import {
  GrowthApiError,
  growthPlanQuery,
  growthQueryKeys,
  growthReportsQuery,
  growthSurveyBootstrapQuery,
} from "./queries";

// queryFn 은 TanStack 컨텍스트를 받지만 이 팩토리들은 쓰지 않는다.
async function run(options: { queryFn?: unknown }) {
  const fn = options.queryFn as () => Promise<unknown>;
  return fn();
}

beforeEach(() => {
  fetchSurveyBootstrapMock.mockReset();
  fetchReportsMock.mockReset();
  fetchPlanMock.mockReset();
});

describe("queryKey", () => {
  test("계정이 달라지면 키가 달라 캐시가 섞이지 않는다", () => {
    expect(growthSurveyBootstrapQuery("u1").queryKey).not.toEqual(
      growthSurveyBootstrapQuery("u2").queryKey,
    );
    expect(growthReportsQuery("u1").queryKey).toEqual(
      growthQueryKeys.reports("u1"),
    );
  });

  test("실행계획 키는 reportId 별로 갈린다", () => {
    expect(growthPlanQuery("u1").queryKey).not.toEqual(
      growthPlanQuery("u1", "r1").queryKey,
    );
  });

  test("모든 키가 growth 루트 아래라 한 번에 무효화할 수 있다", () => {
    for (const key of [
      growthQueryKeys.surveyBootstrap("u1"),
      growthQueryKeys.reports("u1"),
      growthQueryKeys.plan("u1", "r1"),
    ]) {
      expect(key[0]).toBe(growthQueryKeys.root[0]);
    }
  });
});

describe("enabled", () => {
  test("userId 가 없으면 조회하지 않는다", () => {
    expect(growthSurveyBootstrapQuery(null).enabled).toBe(false);
    expect(growthReportsQuery(null).enabled).toBe(false);
    expect(growthPlanQuery(null).enabled).toBe(false);
  });

  test("userId 가 있으면 켠다", () => {
    expect(growthSurveyBootstrapQuery("u1").enabled).toBe(true);
  });
});

describe("queryFn", () => {
  test("ok 면 data 를 돌려준다", async () => {
    fetchSurveyBootstrapMock.mockResolvedValue({
      kind: "ok",
      data: { ok: true },
    });
    expect(await run(growthSurveyBootstrapQuery("u1"))).toEqual({ ok: true });
  });

  test("error 는 GrowthApiError 로 던져 캐시에 성공으로 남지 않는다", async () => {
    fetchReportsMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "내부 오류",
    });
    await expect(run(growthReportsQuery("u1"))).rejects.toMatchObject({
      name: "GrowthApiError",
      result: { kind: "error", code: "INTERNAL" },
    });
    await expect(run(growthReportsQuery("u1"))).rejects.toBeInstanceOf(
      GrowthApiError,
    );
  });

  test("timeout 도 던진다", async () => {
    fetchSurveyBootstrapMock.mockResolvedValue({ kind: "timeout" });
    await expect(run(growthSurveyBootstrapQuery("u1"))).rejects.toMatchObject({
      result: { kind: "timeout" },
    });
  });

  test("실행계획은 reportId 를 api 로 넘긴다", async () => {
    fetchPlanMock.mockResolvedValue({ kind: "ok", data: { ok: true } });
    await run(growthPlanQuery("u1", "r1"));
    expect(fetchPlanMock).toHaveBeenCalledWith("r1");
  });
});
