// 학생 검색 응답이 브라우저가 검증하는 계약 스키마(shared/student/contract.ts)를 통과하는지 본다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { studentSearchSchema } from "../../../shared/student/contract.js";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { app } from "../app.js";

beforeEach(() => {
  kit.admin = createAdminFake({
    permissions: [{ resource_key: "growthReports", level: "view" }],
    tables: {
      profiles: () => ({
        data: [
          { id: "s-1", name: "김하늘", email: "a@b.c", role: "user" },
          { id: "s-2", name: null, email: null, role: "admin" },
        ],
        error: null,
      }),
    },
  });
});

describe("학생 검색 계약", () => {
  test("GET /search 응답이 studentSearchSchema 를 통과한다", async () => {
    const r = await callRoute(
      { app, path: "/api/admin/students/search" },
      { query: { q: "김", section: "growthReports" } },
    );
    expect(r.status).toBe(200);
    expect(studentSearchSchema.parse(r.body).items).toHaveLength(2);
  });
});
