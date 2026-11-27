// 목표관리 라우트의 이용 거부 응답이 스쿨멘토에서만 tenantReason 을 싣는지 고정한다.
// 조회형은 200 { allowed:false }, 쓰기형은 403 { detail } 이고 위닝 본문은 그대로다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callGoal } from "../../_lib/goal/route.testkit.js";

vi.mock("../../_lib/httpAuth.js", () => ({
  resolveUser: async () => ({ userId: "u1", user: { id: "u1" }, token: "t" }),
}));
vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({}),
}));

const session = vi.hoisted(() => ({
  value: { allowed: false, tenantReason: null } as Record<string, unknown>,
}));

vi.mock("../../_lib/goal/repo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/goal/repo.js")>()),
  openGoalSession: async () => session.value,
}));

type Captured = { status: number; body: Record<string, unknown> };

const LOADERS = {
  advice: () => import("./advice.js"),
  "daily-record": () => import("./daily-record.js"),
  grades: () => import("./grades.js"),
  "intake-update": () => import("./intake-update.js"),
  intake: () => import("./intake.js"),
  "plan-tasks": () => import("./plan-tasks.js"),
  ranking: () => import("./ranking.js"),
  report: () => import("./report.js"),
  schedules: () => import("./schedules.js"),
  student: () => import("./student.js"),
  timer: () => import("./timer.js"),
  workbooks: () => import("./workbooks.js"),
} as const;
type Route = keyof typeof LOADERS;

// 요청 형식 검사(zod)가 이용권 확인보다 먼저라서, 쓰기 요청은 형식이 맞는 본문을 보내야 403 에 닿는다.
const DAY = {
  wake: 6,
  sleep: 24,
  hasSchool: true,
  schoolStart: 8,
  schoolEnd: 16,
  academies: [],
};
const WEEK = {
  mon: DAY,
  tue: DAY,
  wed: DAY,
  thu: DAY,
  fri: DAY,
  sat: DAY,
  sun: DAY,
};
const UNIVERSITY = { university: "서울대", department: "경영학과" };
const WRITE_BODIES: Partial<Record<Route, unknown>> = {
  intake: {
    schoolType: "general",
    grade: "g3",
    upperUniversity: UNIVERSITY,
    lowerUniversity: UNIVERSITY,
    naesin: {},
    mockExam: {},
    studyHours: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, sun: 1 },
    weekSchedule: WEEK,
  },
  "intake-update": {
    section: "target",
    upperUniversity: UNIVERSITY,
    lowerUniversity: UNIVERSITY,
  },
  advice: { source: "intake" },
  "plan-tasks": {
    planDate: "2026-11-27",
    title: "문제 풀이",
    subject: "수학",
    durationMinutes: 30,
  },
  grades: {
    type: "naesin",
    entry: { term: "고2 1학기", subjects: {} },
  },
  schedules: {
    title: "수행평가",
    category: "exam",
    dueDate: "2026-12-01",
  },
  timer: { action: "stop" },
  workbooks: { subject: "math", title: "수능특강", totalPages: 100 },
};

// 조회 요청의 쿼리도 형식 검사가 먼저 본다.
const READ_QUERIES: Partial<Record<Route, Record<string, string>>> = {
  "plan-tasks": { from: "2026-11-27", to: "2026-11-30" },
};

async function call(
  route: Route,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
): Promise<Captured> {
  const { status, body } = await callGoal(route, {
    method,
    ...(method === "GET"
      ? { query: READ_QUERIES[route] ?? { type: "weekly" } }
      : { body: WRITE_BODIES[route] ?? {} }),
  });
  return { status, body: body as Record<string, unknown> };
}

const READS: Route[] = [
  "advice",
  "daily-record",
  "grades",
  "plan-tasks",
  "ranking",
  "report",
  "schedules",
  "student",
  "timer",
  "workbooks",
];
const WRITES: readonly (readonly [Route, "POST"])[] = [
  ["advice", "POST"],
  ["daily-record", "POST"],
  ["grades", "POST"],
  ["intake-update", "POST"],
  ["intake", "POST"],
  ["plan-tasks", "POST"],
  ["schedules", "POST"],
  ["timer", "POST"],
  ["workbooks", "POST"],
];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("goal 라우트 이용 거부 응답", () => {
  describe("스쿨멘토", () => {
    beforeEach(() => {
      vi.stubEnv("SITE", "schoolmentor");
      session.value = { allowed: false, tenantReason: "outside_period" };
    });

    it.each(READS)("%s 조회는 200 allowed:false 와 tenantReason", async (r) => {
      const res = await call(r, "GET");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        allowed: false,
        tenantReason: "outside_period",
      });
    });

    it.each(WRITES)("%s %s 는 403 detail 과 tenantReason", async (r, m) => {
      const res = await call(r, m);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: "NO_ENTITLEMENT",
        tenantReason: "outside_period",
      });
    });
  });

  describe("위닝", () => {
    beforeEach(() => {
      vi.stubEnv("SITE", "winning");
      session.value = { allowed: false, tenantReason: null };
    });

    it.each(READS)("%s 조회 본문은 allowed:false 뿐이다", async (r) => {
      const res = await call(r, "GET");
      expect(res.body).toEqual({ allowed: false });
    });

    it.each(WRITES)("%s %s 본문에 tenantReason 이 없다", async (r, m) => {
      const res = await call(r, m);
      expect(res.status).toBe(403);
      expect(Object.keys(res.body)).not.toContain("tenantReason");
    });
  });
});
