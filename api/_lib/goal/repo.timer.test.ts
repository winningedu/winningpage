// 타이머가 학생 시간대(profiles.time_zone)의 하루 경계로 세션을 나누는지 고정한다.
import { describe, expect, it } from "vitest";
import {
  fetchTimerDaySummary,
  getStudentTimeZone,
  reconcileTimerState,
  startTimerSession,
} from "./repo.js";

type Row = Record<string, unknown>;

/** profiles 와 goal_timer_sessions 만 흉내 내는 최소 인메모리 supabase. */
function fakeSupabase(timeZone: string | null, sessions: Row[]) {
  let seq = 0;
  const tables: Record<string, Row[]> & {
    profiles: Row[];
    goal_timer_sessions: Row[];
  } = {
    profiles: timeZone === null ? [] : [{ id: "p1", time_zone: timeZone }],
    goal_timer_sessions: sessions,
  };
  const from = (name: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    const table = tables[name as "profiles"];
    const matched = () => table.filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (mode === "insert") {
        const row = { id: `s${++seq}`, ended_at: null, ...payload };
        table.push(row);
        return [row];
      }
      const rows = matched();
      if (mode === "update") for (const r of rows) Object.assign(r, payload);
      return rows;
    };
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (p: Row) => {
        mode = "insert";
        payload = p;
        return q;
      },
      update: (p: Row) => {
        mode = "update";
        payload = p;
        return q;
      },
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v);
        return q;
      },
      is: (c: string, v: unknown) => {
        filters.push((r) => (r[c] ?? null) === v);
        return q;
      },
      not: (c: string, _op: string, v: unknown) => {
        filters.push((r) => (r[c] ?? null) !== v);
        return q;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: supabase 쿼리 빌더는 thenable 이다.
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: run(), error: null }),
    };
    return q;
  };
  return { client: { from } as never, sessions };
}

describe("getStudentTimeZone", () => {
  it("profiles.time_zone 을 읽는다", async () => {
    const { client } = fakeSupabase("America/Los_Angeles", []);
    expect(await getStudentTimeZone(client, "p1")).toBe("America/Los_Angeles");
  });

  it("행이 없으면 던진다(대체 상수 없음)", async () => {
    const { client } = fakeSupabase(null, []);
    await expect(getStudentTimeZone(client, "p1")).rejects.toThrow();
  });
});

describe("타이머 하루 경계", () => {
  it("서울 학생의 세션은 현지 날짜로 열린다", async () => {
    const { client, sessions } = fakeSupabase("Asia/Seoul", []);
    await startTimerSession(
      client,
      "p1",
      "math",
      new Date("2026-11-22T15:30:00Z"),
    );
    expect(sessions[0]?.session_date).toBe("2026-11-23");
  });

  it("LA 학생은 같은 순간이 전날로 열린다", async () => {
    const { client, sessions } = fakeSupabase("America/Los_Angeles", []);
    await startTimerSession(
      client,
      "p1",
      "math",
      new Date("2026-11-22T15:30:00Z"),
    );
    expect(sessions[0]?.session_date).toBe("2026-11-22");
  });

  it("현지 23:30 에서 자정 너머로 가는 세션을 현지 자정에 나눈다", async () => {
    // 서울 2026-11-22 23:30 = 14:30Z
    const { client, sessions } = fakeSupabase("Asia/Seoul", [
      {
        id: "s0",
        profile_id: "p1",
        subject: "math",
        session_date: "2026-11-22",
        started_at: "2026-11-22T14:30:00.000Z",
        last_heartbeat_at: "2026-11-22T15:01:00.000Z",
        ended_at: null,
      },
    ]);
    const open = await reconcileTimerState(
      client,
      "p1",
      new Date("2026-11-22T15:02:00Z"),
    );
    expect(sessions[0]?.ended_at).toBe("2026-11-22T15:00:00.000Z");
    expect(sessions[0]?.end_reason).toBe("midnight");
    expect(open?.session_date).toBe("2026-11-23");
    expect(open?.started_at).toBe("2026-11-22T15:00:00.000Z");
  });

  it("오늘 요약의 date 는 학생 현지 날짜다", async () => {
    const { client } = fakeSupabase("America/Los_Angeles", []);
    const summary = await fetchTimerDaySummary(
      client,
      "p1",
      new Date("2026-11-22T15:30:00Z"),
    );
    expect(summary.date).toBe("2026-11-22");
  });
});
