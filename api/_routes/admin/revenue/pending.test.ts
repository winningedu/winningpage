// GET /api/admin/revenue/pending 계약 검증. 환불 승인 대기와 처리 대기 건수를 head count 두 번으로 센다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  problemCode,
} from "../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./pending.js";

let counts = { approval: 0 as number | null, process: 0 as number | null };
let failApproval = false;

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "revenue", level }] : [],
    tables: {
      refund_requests: (query) => {
        const isProcess = argsOf(query, "in") !== undefined;
        if (!isProcess && failApproval) {
          return { data: null, error: { message: "boom" } };
        }
        return {
          count: isProcess ? counts.process : counts.approval,
          error: null,
        };
      },
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  counts = { approval: 0, process: 0 };
  failApproval = false;
});

describe("GET /api/admin/revenue/pending", () => {
  test("view 권한이면 두 건수를 돌려준다", async () => {
    counts = { approval: 4, process: 7 };
    setup();
    const r = await callRoute(handler);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ approvalWaiting: 4, processWaiting: 7 });
  });

  test("count 가 null 이면 0 이다", async () => {
    counts = { approval: null, process: null };
    setup();
    const r = await callRoute(handler);
    expect(r.body).toEqual({ approvalWaiting: 0, processWaiting: 0 });
  });

  test("승인 대기와 처리 대기에 각자의 필터를 건다", async () => {
    const admin = setup();
    await callRoute(handler);
    const [approval, process] = admin.queries.filter(
      (q) => q.table === "refund_requests",
    );
    expect(approval && argsOf(approval, "select")).toEqual([
      "id",
      { count: "exact", head: true },
    ]);
    expect(approval && argsOf(approval, "eq")).toEqual([
      "approval_status",
      "requested",
    ]);
    expect(process && argsOf(process, "eq")).toEqual([
      "approval_status",
      "approved",
    ]);
    expect(process && argsOf(process, "in")).toEqual([
      "status",
      ["requested", "processing"],
    ]);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await callRoute(handler);
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("한쪽 조회가 실패하면 500 INTERNAL_ERROR 다", async () => {
    failApproval = true;
    setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await callRoute(handler);
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
