// GET /api/admin/sections/:key/export 계약 검증. 한 번에 1000행씩, 호출마다 범위 쿼리 하나.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { sectionExportSchema } from "../../../shared/sections/contract.js";
import {
  createSectionAdmin,
  createSectionDb,
  type SectionDb,
  seedAdmin,
} from "../../_lib/admin-sections/sectionTestKit.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createSectionAdmin(kit.state, kit.db),
}));

import { app } from "../app.js";

const handler = { app, path: "/api/admin/sections/:key/export" };

const get = (query: Record<string, string>) =>
  callRoute(handler, { method: "GET", query: query });

interface Body {
  items: { id: string }[];
  next: number | null;
}

const TOTAL = 43_170;

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createSectionDb({});
});

describe("GET /api/admin/sections/:key/export", () => {
  test("입결 43,170행을 next 로 이어 받으면 44번 호출에 순서대로 다 나온다", async () => {
    seedAdmin(kit.state, "view", "admissionResults");
    kit.db.tables.admission_results = Array.from({ length: TOTAL }, (_, i) => ({
      id: `r${String(i).padStart(6, "0")}`,
      result_year: 2026,
    }));

    const ids: string[] = [];
    const sizes: number[] = [];
    let from: number | null = 0;
    let calls = 0;
    while (from !== null) {
      const r = await get({ key: "admissionResults", from: String(from) });
      expect(r.status).toBe(200);
      const body = r.body as Body;
      sizes.push(body.items.length);
      ids.push(...body.items.map((row) => row.id));
      calls += 1;
      from = body.next;
    }

    expect(calls).toBe(44);
    expect(ids).toHaveLength(TOTAL);
    // result_year 가 같으니 id 내림차순이다
    expect(ids[0]).toBe(`r${String(TOTAL - 1).padStart(6, "0")}`);
    expect(ids.at(-1)).toBe("r000000");
    expect(new Set(ids).size).toBe(TOTAL);
    expect(Math.max(...sizes)).toBe(1000);
    expect(sizes.at(-1)).toBe(170);
    const ranges = kit.db.calls.filter((c) => c.range);
    expect(ranges).toHaveLength(44);
    expect(kit.db.calls).toHaveLength(44);
    expect(ranges[1]?.range).toEqual([1000, 1999]);
  });

  test("from 은 1,000,000 까지만 받는다(넘으면 400, 테이블을 읽지 않는다)", async () => {
    seedAdmin(kit.state, "view", "admissionResults");
    kit.db.tables.admission_results = [];
    const over = await get({ key: "admissionResults", from: "1000001" });
    expect(over.status).toBe(400);
    expect(kit.db.calls).toHaveLength(0);
    const edge = await get({ key: "admissionResults", from: "1000000" });
    expect(edge.status).toBe(200);
  });

  test("q 는 100자까지만 받는다", async () => {
    seedAdmin(kit.state, "view", "admissionResults");
    kit.db.tables.admission_results = [];
    const over = await get({ key: "admissionResults", q: "가".repeat(101) });
    expect(over.status).toBe(400);
    expect(kit.db.calls).toHaveLength(0);
    const edge = await get({ key: "admissionResults", q: "가".repeat(100) });
    expect(edge.status).toBe(200);
  });

  test("정확히 1000행으로 끝나면 다음 호출이 빈 배열과 null 을 준다", async () => {
    seedAdmin(kit.state, "view", "admissionResults");
    kit.db.tables.admission_results = Array.from({ length: 1000 }, (_, i) => ({
      id: `r${i}`,
    }));
    const first = (await get({ key: "admissionResults" })).body as Body;
    expect(first.next).toBe(1000);
    const second = (await get({ key: "admissionResults", from: "1000" }))
      .body as Body;
    expect(second).toEqual({ items: [], next: null });
  });

  test("검색어는 목록과 같은 이스케이프로 건다", async () => {
    seedAdmin(kit.state, "view", "admissionResults");
    kit.db.tables.admission_results = [];
    await get({ key: "admissionResults", q: "서울(대)" });
    expect(kit.db.calls[0]?.or).toContain("university_name.ilike.%서울 대%");
  });

  test("서버 페이지 섹션이 아니면 400, from 이 음수면 400", async () => {
    seedAdmin(kit.state, "view", "faqs");
    kit.db.tables.faqs = [];
    expect((await get({ key: "faqs" })).status).toBe(400);
    seedAdmin(kit.state, "view", "admissionResults");
    expect((await get({ key: "admissionResults", from: "-1" })).status).toBe(
      400,
    );
  });

  test("권한이 없으면 403", async () => {
    seedAdmin(kit.state, "none", "admissionResults");
    kit.db.tables.admission_results = [];
    expect((await get({ key: "admissionResults" })).status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });
});

describe("계약", () => {
  test("내보내기 응답은 계약 스키마를 통과한다", async () => {
    seedAdmin(kit.state, "view", "admissionResults");
    kit.db.tables.admission_results = [{ id: "r1", result_year: 2026 }];

    const r = await get({ key: "admissionResults" });

    expect(sectionExportSchema.parse(r.body)).toEqual({
      items: [{ id: "r1", result_year: 2026 }],
      next: null,
    });
  });
});
