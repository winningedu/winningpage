// 본사 대시보드 서버 호출이 api 클라이언트로 GET 하고, signal 을 넘기며, 응답을 스키마로 읽는지 확인한다.
// 인증 헤더와 X-Time-Zone 은 api 클라이언트(src/lib/http/client.ts)가 싣는다.

import { beforeEach, describe, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/client", () => ({ api: { get: http.get } }));

import {
  fetchHqB2c,
  fetchHqSummary,
  fetchHqTenants,
  fetchHqTrends,
  fetchHqUsage,
  fetchLoginLog,
  fetchLoginStats,
} from "./api";

const ROW = {
  tenantId: "t-a",
  name: "한빛고",
  region: "서울",
  orgType: "학교",
  contractStartDate: "2026-03-01",
  contractEndDate: "2027-02-28",
  graceEnd: "2027-03-30",
  trialStartDate: null,
  trialEndDate: null,
  contractStatus: "active",
  studentCount: 10,
  studentWithoutEnrollmentCount: 2,
  teacherCount: 3,
  lastActivityAt: "2026-11-22T00:10:00.000Z",
  goalRateAverage: 55,
  goalUserCount: 4,
};

const USAGE_ROW = {
  tenantId: "t-a",
  programKey: "diagnose",
  provided: true,
  monthLimit: 10,
  termLimit: null,
  monthUsed: 3,
  monthCappedStudents: 0,
  termUsed: 5,
  termCappedStudents: 1,
  termResetsOn: "2026-12-01",
};

const BUCKET = {
  start: "2026-11-01",
  end: "2026-11-01",
  source: "measured",
  members: 2,
  byMemberType: { student: 2 },
};

const FIXTURES = {
  summary: {
    asOf: "2026-11-23T03:00:00.000Z",
    tenantCount: 1,
    studentCount: 10,
    studentWithoutEnrollmentCount: 2,
    teacherCount: 3,
    contracts: {
      trial: 0,
      none: 0,
      upcoming: 0,
      active: 1,
      endingSoon: 0,
      grace: 0,
      expired: 0,
    },
  },
  tenants: { asOf: "2026-11-23T03:00:00.000Z", items: [ROW] },
  usage: { asOf: "2026-11-23T03:00:00.000Z", items: [USAGE_ROW] },
  stats: {
    from: "2026-11-01",
    to: "2026-11-22",
    grain: "day",
    mauMode: "calendar",
    includeInternal: false,
    firstMeasuredAt: null,
    series: [BUCKET],
    dau: {
      from: "2026-11-01",
      to: "2026-11-22",
      average: 2,
      source: "measured",
    },
    mau: {
      from: "2026-11-01",
      to: "2026-11-22",
      mode: "calendar",
      members: 2,
      source: "measured",
      byMemberType: { student: 2 },
    },
  },
  log: {
    from: "2026-11-01",
    to: "2026-11-22",
    includeInternal: false,
    page: 1,
    pageSize: 50,
    total: 1,
    namesVisible: false,
    items: [
      {
        profileId: "p-1",
        loginDate: "2026-11-22",
        firstSeenAt: "2026-11-22T00:10:00.000Z",
        name: null,
        memberType: "student",
        tenantName: "한빛고",
      },
    ],
  },
  trends: {
    from: "2026-11-01",
    to: "2026-11-22",
    grain: "day",
    mauMode: "calendar",
    includeInternal: false,
    series: [
      {
        start: "2026-11-01",
        end: "2026-11-01",
        signups: 3,
        signupsByMemberType: { student: 3 },
        paidOrders: 1,
      },
    ],
  },
  b2c: {
    from: "2026-11-01",
    to: "2026-11-22",
    includeInternal: false,
    members: { total: 5, byMemberType: { student: 5 } },
    payments: {
      payingMembers: 1,
      orderCount: 1,
      paidAmount: 1000,
      refundedAmount: 0,
      netAmount: 1000,
    },
  },
};

function respondWith(payload: unknown) {
  http.get.mockReturnValue({
    json: async (schema: { parse: (value: unknown) => unknown }) =>
      schema.parse(payload),
  });
}

const signal = new AbortController().signal;

const CASES = [
  [
    "summary",
    () => fetchHqSummary(false, signal),
    "admin/hq-dashboard/summary",
    "includeInternal=0",
    FIXTURES.summary,
  ],
  [
    "tenants",
    () => fetchHqTenants(true, signal),
    "admin/hq-dashboard/tenants",
    "includeInternal=1",
    FIXTURES.tenants,
  ],
  [
    "usage",
    () => fetchHqUsage(false, signal),
    "admin/hq-dashboard/usage",
    "includeInternal=0",
    FIXTURES.usage,
  ],
  [
    "logins stats",
    () => fetchLoginStats("view=stats&grain=day", signal),
    "admin/hq-dashboard/logins",
    "view=stats&grain=day",
    FIXTURES.stats,
  ],
  [
    "logins log",
    () => fetchLoginLog("view=log&page=2", signal),
    "admin/hq-dashboard/logins",
    "view=log&page=2",
    FIXTURES.log,
  ],
  [
    "trends",
    () => fetchHqTrends("from=2026-11-01", signal),
    "admin/hq-dashboard/trends",
    "from=2026-11-01",
    FIXTURES.trends,
  ],
  [
    "b2c",
    () => fetchHqB2c("from=2026-11-01", signal),
    "admin/hq-dashboard/b2c",
    "from=2026-11-01",
    FIXTURES.b2c,
  ],
] as const;

beforeEach(() => {
  http.get.mockReset();
});

describe("hq-dashboard api", () => {
  test.each(CASES)(
    "%s 는 api.get 으로 읽고 signal 을 넘기며 응답을 그대로 돌려준다",
    async (_name, call, path, search, payload) => {
      respondWith(payload);

      const result = await call();

      const [calledPath, init] = http.get.mock.calls[0] as [
        string,
        { searchParams: URLSearchParams; signal: AbortSignal },
      ];
      expect(calledPath).toBe(path);
      expect(init.signal).toBe(signal);
      expect(new URLSearchParams(init.searchParams).toString()).toBe(
        new URLSearchParams(search).toString(),
      );
      expect(result).toEqual(payload);
    },
  );

  test("기관 현황이 옛 모양(tenants)이면 스키마 검증에서 던진다", async () => {
    respondWith({ asOf: "2026-11-23T03:00:00.000Z", tenants: [ROW] });

    await expect(fetchHqTenants(false, signal)).rejects.toThrow();
  });

  test("사용량이 옛 모양(usage)이면 스키마 검증에서 던진다", async () => {
    respondWith({ asOf: "2026-11-23T03:00:00.000Z", usage: [USAGE_ROW] });

    await expect(fetchHqUsage(false, signal)).rejects.toThrow();
  });
});
