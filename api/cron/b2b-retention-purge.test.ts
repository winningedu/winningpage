// GET /api/cron/b2b-retention-purge 계약 검증. 크론 인증 없이는 아무것도 지우지 않는다.

import { readFileSync } from "node:fs";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({ rpc: state.rpc }),
}));

import handler from "./b2b-retention-purge.js";

interface Captured {
  status: number;
  body: unknown;
}

async function get(authorization?: string, method = "GET"): Promise<Captured> {
  const captured: Captured = { status: 0, body: undefined };
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
      method,
      headers: authorization ? { authorization } : {},
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  state.rpc.mockReset();
  state.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "fn_anonymize_expired_b2b_members"
        ? [
            {
              tenants_processed: 1,
              members_anonymized: 5,
              members_protected: 2,
            },
          ]
        : [
            {
              enrollment_changes_deleted: 4,
              enrollments_deleted: 3,
              access_logs_deleted: 7,
            },
          ],
    error: null,
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/b2b-retention-purge", () => {
  test("올바른 CRON_SECRET 이면 보관 기간 정리를 한 번 부르고 지운 건수를 돌려준다", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const r = await get("Bearer cron-secret");

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      enrollmentChangesDeleted: 4,
      enrollmentsDeleted: 3,
      accessLogsDeleted: 7,
      membersAnonymized: 5,
      membersProtected: 2,
    });
    expect(state.rpc.mock.calls.map((c) => c[0])).toEqual([
      "fn_purge_b2b_retention",
      "fn_anonymize_expired_b2b_members",
    ]);
  });

  test.each([
    ["Authorization 헤더가 없음", undefined],
    ["비밀값이 틀림", "Bearer wrong"],
    ["Bearer 형식이 아님", "cron-secret"],
  ])("%s 이면 401 이고 아무것도 지우지 않는다", async (_label, header) => {
    const r = await get(header);

    expect(r.status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  test("CRON_SECRET 이 설정되지 않았으면 헤더가 있어도 401 이다(fail-closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await get("Bearer ");

    expect(r.status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  test("GET 이외의 메서드는 405 이다", async () => {
    const r = await get("Bearer cron-secret", "POST");

    expect(r.status).toBe(405);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  test("정리 함수가 실패하면 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });

    const r = await get("Bearer cron-secret");

    expect(r.status).toBe(500);
  });

  test("익명화 함수가 실패하면 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.rpc.mockImplementation(async (name: string) =>
      name === "fn_anonymize_expired_b2b_members"
        ? { data: null, error: { code: "XX000" } }
        : {
            data: [
              {
                enrollment_changes_deleted: 0,
                enrollments_deleted: 0,
                access_logs_deleted: 0,
              },
            ],
            error: null,
          },
    );

    const r = await get("Bearer cron-secret");

    expect(r.status).toBe(500);
  });

  test("vercel.json 에 매일 04:40 KST(19:40 UTC) 일정이 등록돼 있다", () => {
    const { crons } = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string; schedule: string }[];
    };

    expect(crons).toContainEqual({
      path: "/api/cron/b2b-retention-purge",
      schedule: "40 19 * * *",
    });
  });
});
