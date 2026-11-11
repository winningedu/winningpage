// 목표관리 라우트의 이용 거부 응답이 스쿨멘토에서만 tenantReason 을 싣는지 고정한다.
// 조회형은 200 { allowed:false }, 쓰기형은 403 { detail } 이고 위닝 본문은 그대로다.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

async function call(
  route: Route,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
): Promise<Captured> {
  const { default: handler } = (await LOADERS[route]()) as {
    default: (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
  };
  const captured: Captured = { status: 0, body: {} };
  const res = {
    setHeader: () => undefined,
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload;
      return res;
    },
  };
  await handler(
    {
      method,
      body: {},
      query: { type: "weekly" },
      headers: { authorization: "Bearer t" },
      socket: {},
    } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return captured;
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
      expect(res.body).toMatchObject({ tenantReason: "outside_period" });
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
