// POST /api/admin/sections/:key/:id/reviewed 계약 검증(markReviewed).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSectionAdmin,
  createSectionDb,
  type SectionDb,
  seedAdmin,
} from "../../../../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
}));

vi.mock("../../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createSectionAdmin(kit.state, kit.db),
}));

import handler from "./reviewed.js";

const post = (key: string, id: string) =>
  callHandler(handler, undefined, "POST", { key, id });

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createSectionDb({});
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T01:02:03.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/admin/sections/:key/:id/reviewed", () => {
  test("last_reviewed_at 한 컬럼만 지금 시각(UTC ISO)으로 고친다", async () => {
    seedAdmin(kit.state, "edit", "winningSuhaengTopicDb");
    kit.db.tables.winning_assessment_knowledge_items = [
      { id: "k1", content: "c", last_reviewed_at: null },
    ];
    const r = await post("winningSuhaengTopicDb", "k1");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: "k1",
      last_reviewed_at: "2026-11-24T01:02:03.000Z",
    });
    expect(kit.db.calls.find((c) => c.op === "update")?.values).toEqual({
      last_reviewed_at: "2026-11-24T01:02:03.000Z",
    });
  });

  test("knowledgeReview 섹션이 아니면 400", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [{ id: "f1" }];
    expect((await post("faqs", "f1")).status).toBe(400);
  });

  test("없는 행 404, 보기 권한 403", async () => {
    seedAdmin(kit.state, "edit", "winningSuhaengTopicDb");
    kit.db.tables.winning_assessment_knowledge_items = [];
    expect((await post("winningSuhaengTopicDb", "zz")).status).toBe(404);
    seedAdmin(kit.state, "view", "winningSuhaengTopicDb");
    expect((await post("winningSuhaengTopicDb", "zz")).status).toBe(403);
  });
});
