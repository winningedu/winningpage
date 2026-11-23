// 일간·주간·월간 리포트 크론은 매시 정각에 돌고, 수신자(학생 profiles.time_zone)의
// 현지 시각이 발송 시각인 학생에게만 보낸다. 알림톡 발송기(sendAndLog)는 mock 이라
// 실제 발송은 절대 일어나지 않는다.

import { readFileSync } from "node:fs";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  sendAndLog: vi.fn(),
}));

vi.mock("../_lib/messaging/alimtalkSend.js", () => ({
  sendAndLog: state.sendAndLog,
}));

// 필터(eq/in/gte/lte)를 실제로 적용하는 최소 fake. 시간대 선택이 쿼리 결과가
// 아니라 코드 판단임을 보이려면 날짜 필터가 살아 있어야 한다.
vi.mock("../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder: Record<string, unknown> = {};
      const add = (fn: (row: Row) => boolean) => {
        filters.push(fn);
        return builder;
      };
      builder.select = () => builder;
      builder.eq = (col: string, v: unknown) => add((r) => r[col] === v);
      builder.in = (col: string, vs: unknown[]) =>
        add((r) => vs.includes(r[col]));
      builder.gte = (col: string, v: string) => add((r) => String(r[col]) >= v);
      builder.lte = (col: string, v: string) => add((r) => String(r[col]) <= v);
      // biome-ignore lint/suspicious/noThenProperty: supabase 쿼리 빌더는 thenable 이다.
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: (state.tables[table] ?? []).filter((r) =>
            filters.every((f) => f(r)),
          ),
          error: null,
        }).then(resolve);
      return builder;
    },
  }),
}));

import daily from "./daily-report.js";
import monthly from "./monthly-report.js";
import weekly from "./weekly-report.js";

async function run(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>,
  query: Record<string, string> = {},
) {
  const captured: { status: number; body: unknown } = {
    status: 0,
    body: undefined,
  };
  const res = {
    setHeader: () => {},
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer cron-secret" },
      query,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

function at(iso: string) {
  vi.setSystemTime(new Date(iso));
}

function seed(students: Array<{ id: string; tz: string }>, records: Row[]) {
  state.tables = {
    profiles: [
      {
        id: "p1",
        name: "학부모",
        phone: "01011112222",
        time_zone: "Asia/Seoul",
      },
      ...students.map((s) => ({
        id: s.id,
        name: `학생-${s.id}`,
        phone: null,
        time_zone: s.tz,
      })),
    ],
    parent_child_links: students.map((s) => ({
      parent_id: "p1",
      student_id: s.id,
      status: "approved",
    })),
    goal_daily_records: records,
    goal_plan_tasks: [],
  };
}

const keysSent = () =>
  state.sendAndLog.mock.calls.map(
    (c) => (c[0] as { dedupeKey: string }).dedupeKey,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("CRON_SECRET", "cron-secret");
  state.sendAndLog.mockReset();
  state.sendAndLog.mockResolvedValue({ status: "sent", logId: 1 });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("daily-report 크론 — 현지 22시", () => {
  test("서울 학생은 13:00Z 실행에서만 보낸다", async () => {
    seed(
      [{ id: "s-seoul", tz: "Asia/Seoul" }],
      [{ profile_id: "s-seoul", record_date: "2026-11-23" }],
    );

    for (const hour of ["12", "14", "06"]) {
      at(`2026-11-23T${hour}:00:00Z`);
      await run(daily);
    }
    expect(state.sendAndLog).not.toHaveBeenCalled();

    at("2026-11-23T13:00:00Z");
    await run(daily);
    expect(keysSent()).toEqual(["dailyReport:p1:s-seoul:2026-11-23"]);
  });

  test("로스앤젤레스 학생은 겨울 06:00Z, 여름 05:00Z 실행에서 현지 날짜로 보낸다", async () => {
    seed(
      [{ id: "s-la", tz: "America/Los_Angeles" }],
      [
        { profile_id: "s-la", record_date: "2026-11-23" },
        { profile_id: "s-la", record_date: "2026-07-23" },
      ],
    );

    at("2026-11-23T13:00:00Z"); // 서울 실행 시각
    await run(daily);
    expect(state.sendAndLog).not.toHaveBeenCalled();

    at("2026-11-24T06:00:00Z");
    await run(daily);
    expect(keysSent()).toEqual(["dailyReport:p1:s-la:2026-11-23"]);

    state.sendAndLog.mockClear();
    at("2026-07-24T05:00:00Z");
    await run(daily);
    expect(keysSent()).toEqual(["dailyReport:p1:s-la:2026-07-23"]);
  });

  test("같은 시간 안에 두 번 돌면 같은 dedupeKey 로 부른다(중복은 발송기 dedupe 가 막는다)", async () => {
    seed(
      [{ id: "s-seoul", tz: "Asia/Seoul" }],
      [{ profile_id: "s-seoul", record_date: "2026-11-23" }],
    );

    at("2026-11-23T13:00:00Z");
    await run(daily);
    at("2026-11-23T13:30:00Z");
    await run(daily);

    expect(keysSent()).toEqual([
      "dailyReport:p1:s-seoul:2026-11-23",
      "dailyReport:p1:s-seoul:2026-11-23",
    ]);
  });

  test("그날 기록이 없으면 보내지 않는다", async () => {
    seed(
      [{ id: "s-seoul", tz: "Asia/Seoul" }],
      [{ profile_id: "s-seoul", record_date: "2026-11-22" }],
    );
    at("2026-11-23T13:00:00Z");
    await run(daily);
    expect(state.sendAndLog).not.toHaveBeenCalled();
  });

  test("?date= 로 날짜를 강제하면 시각과 시간대와 무관하게 그 날짜 기록 학생에게 보낸다", async () => {
    seed(
      [{ id: "s-la", tz: "America/Los_Angeles" }],
      [{ profile_id: "s-la", record_date: "2026-11-20" }],
    );
    at("2026-11-23T03:00:00Z");
    await run(daily, { date: "2026-11-20" });
    expect(keysSent()).toEqual(["dailyReport:p1:s-la:2026-11-20"]);
  });
});

describe("weekly-report 크론 — 현지 월요일 08시, 지난 주", () => {
  const records = (id: string): Row[] => [
    { profile_id: id, record_date: "2026-11-18" },
  ];

  test("서울 학생은 일요일 23:00Z(월 08:00 서울) 실행에서 지난 주 월요일 키로 보낸다", async () => {
    seed([{ id: "s-seoul", tz: "Asia/Seoul" }], records("s-seoul"));

    at("2026-11-23T16:00:00Z"); // 서울은 화요일 01시
    await run(weekly);
    expect(state.sendAndLog).not.toHaveBeenCalled();

    at("2026-11-22T23:00:00Z");
    await run(weekly);
    expect(keysSent()).toEqual(["weeklyReport:p1:s-seoul:2026-11-16"]);
  });

  test("로스앤젤레스 학생은 월요일 16:00Z(PST) 실행에서 보낸다", async () => {
    seed([{ id: "s-la", tz: "America/Los_Angeles" }], records("s-la"));

    at("2026-11-22T23:00:00Z");
    await run(weekly);
    expect(state.sendAndLog).not.toHaveBeenCalled();

    at("2026-11-23T16:00:00Z");
    await run(weekly);
    expect(keysSent()).toEqual(["weeklyReport:p1:s-la:2026-11-16"]);
  });

  test("지난 주에 기록이 없으면 보내지 않고, 같은 시간 재실행은 같은 키를 쓴다", async () => {
    seed(
      [{ id: "s-seoul", tz: "Asia/Seoul" }],
      [{ profile_id: "s-seoul", record_date: "2026-11-10" }],
    );
    at("2026-11-22T23:00:00Z");
    await run(weekly);
    expect(state.sendAndLog).not.toHaveBeenCalled();

    seed([{ id: "s-seoul", tz: "Asia/Seoul" }], records("s-seoul"));
    await run(weekly);
    at("2026-11-22T23:40:00Z");
    await run(weekly);
    expect(keysSent()).toEqual([
      "weeklyReport:p1:s-seoul:2026-11-16",
      "weeklyReport:p1:s-seoul:2026-11-16",
    ]);
  });

  test("?week= 로 주 시작일을 강제하면 시각과 무관하게 그 주 기록 학생에게 보낸다", async () => {
    seed([{ id: "s-la", tz: "America/Los_Angeles" }], records("s-la"));
    at("2026-11-25T03:00:00Z");
    await run(weekly, { week: "2026-11-16" });
    expect(keysSent()).toEqual(["weeklyReport:p1:s-la:2026-11-16"]);
  });
});

describe("monthly-report 크론 — 현지 1일 08시, 지난 달", () => {
  const records = (id: string): Row[] => [
    { profile_id: id, record_date: "2026-11-15" },
  ];

  test("서울 학생은 11월 30일 23:00Z(12/1 08:00 서울) 실행에서 지난 달 키로 보낸다", async () => {
    seed([{ id: "s-seoul", tz: "Asia/Seoul" }], records("s-seoul"));

    at("2026-11-30T22:00:00Z");
    await run(monthly);
    expect(state.sendAndLog).not.toHaveBeenCalled();

    at("2026-11-30T23:00:00Z");
    await run(monthly);
    expect(keysSent()).toEqual(["monthlyReport:p1:s-seoul:2026-11"]);
  });

  test("로스앤젤레스 학생은 12월 1일 16:00Z(PST) 실행에서 보낸다", async () => {
    seed([{ id: "s-la", tz: "America/Los_Angeles" }], records("s-la"));

    at("2026-11-30T23:00:00Z");
    await run(monthly);
    expect(state.sendAndLog).not.toHaveBeenCalled();

    at("2026-12-01T16:00:00Z");
    await run(monthly);
    expect(keysSent()).toEqual(["monthlyReport:p1:s-la:2026-11"]);
  });

  test("?month= 로 달을 강제하면 시각과 무관하게 그 달 기록 학생에게 보낸다", async () => {
    seed([{ id: "s-la", tz: "America/Los_Angeles" }], records("s-la"));
    at("2026-12-10T03:00:00Z");
    await run(monthly, { month: "2026-11" });
    expect(keysSent()).toEqual(["monthlyReport:p1:s-la:2026-11"]);
  });
});

describe("vercel.json 크론 표현식", () => {
  const crons = (
    JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    }
  ).crons;
  const scheduleOf = (path: string) =>
    crons.find((c) => c.path === path)?.schedule;

  test.each([
    "/api/cron/daily-report",
    "/api/cron/weekly-report",
    "/api/cron/monthly-report",
  ])("%s 는 매시 정각에 돈다", (path) => {
    expect(scheduleOf(path)).toBe("0 * * * *");
  });

  test("다른 크론은 그대로다", () => {
    expect(scheduleOf("/api/cron/growth-archive")).toBe("0 19 * * *");
    expect(scheduleOf("/api/cron/growth-resume")).toBe("*/2 * * * *");
  });
});
