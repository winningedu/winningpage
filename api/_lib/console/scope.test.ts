// 콘솔 범위 도우미 계약 검증: 기관과 담당 학급으로 거르고, 범위 밖 대상은 404 로 숨긴다.

import type { VercelResponse } from "@vercel/node";
import { describe, expect, test } from "vitest";
import type { ConsoleActor } from "./actor.js";
import { isInScope, requireInScope, scopeQuery } from "./scope.js";

const HOMEROOM: ConsoleActor = {
  kind: "homeroom",
  tenantId: "tenant-1",
  teacherId: "teacher-1",
  classIds: ["class-1", "class-2"],
  proxySessionId: null,
  mustChangePassword: false,
  loginId: "kim01",
};
const ADMIN: ConsoleActor = { ...HOMEROOM, kind: "school_admin", classIds: [] };

function fakeQuery() {
  const calls: unknown[][] = [];
  const q = {
    eq(col: string, v: unknown) {
      calls.push(["eq", col, v]);
      return q;
    },
    in(col: string, v: unknown[]) {
      calls.push(["in", col, v]);
      return q;
    },
  };
  return { q, calls };
}

describe("scopeQuery", () => {
  test("담임은 기관과 담당 학급으로 거른다", () => {
    const { q, calls } = fakeQuery();

    scopeQuery(q, HOMEROOM, { classColumn: "class_id" });

    expect(calls).toEqual([
      ["eq", "tenant_id", "tenant-1"],
      ["in", "class_id", ["class-1", "class-2"]],
    ]);
  });

  test("학교 관리자와 대행은 기관만 거른다", () => {
    const { q, calls } = fakeQuery();

    scopeQuery(q, ADMIN, { classColumn: "class_id" });

    expect(calls).toEqual([["eq", "tenant_id", "tenant-1"]]);
  });
});

describe("isInScope", () => {
  test("다른 기관 대상은 범위 밖이다", () => {
    expect(isInScope(ADMIN, { tenantId: "tenant-2" })).toBe(false);
    expect(isInScope(ADMIN, { tenantId: "tenant-1" })).toBe(true);
  });

  test("담임은 담당 학급의 대상만 범위 안이다", () => {
    expect(
      isInScope(HOMEROOM, { tenantId: "tenant-1", classId: "class-2" }),
    ).toBe(true);
    expect(
      isInScope(HOMEROOM, { tenantId: "tenant-1", classId: "class-9" }),
    ).toBe(false);
    expect(isInScope(HOMEROOM, { tenantId: "tenant-1", classId: null })).toBe(
      false,
    );
  });
});

describe("requireInScope", () => {
  function fakeRes() {
    const out = { status: 0, body: undefined as unknown };
    const res = {
      status(code: number) {
        out.status = code;
        return res;
      },
      json(payload: unknown) {
        out.body = payload;
        return res;
      },
    } as unknown as VercelResponse;
    return { out, res };
  }

  test("다른 기관 대상 id 는 404 를 보내고 false 를 돌려준다", () => {
    const { out, res } = fakeRes();

    const ok = requireInScope(res, "coded", ADMIN, { tenantId: "tenant-2" });

    expect(ok).toBe(false);
    expect(out.status).toBe(404);
    expect(out.body).toEqual({
      error: { code: "NOT_FOUND", message: "대상을 찾을 수 없습니다." },
    });
  });

  test("범위 안이면 응답 없이 true 를 돌려준다", () => {
    const { out, res } = fakeRes();

    expect(requireInScope(res, "coded", ADMIN, { tenantId: "tenant-1" })).toBe(
      true,
    );
    expect(out.status).toBe(0);
  });
});
