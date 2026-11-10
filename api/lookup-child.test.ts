// POST /api/lookup-child: QA 학부모는 QA 자녀만 조회할 수 있다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("./_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./lookup-child.js";

const QA_MESSAGE = "QA 계정이라 이 기능은 작동하지 않아요.";

function seed(qaProfileIds: string[]) {
  kit.state = createKitState();
  kit.state.user = { id: "parent-1", email: "p@t.local" };
  kit.state.rows.profiles = (filters) =>
    filters.id === "parent-1"
      ? { member_type: "parent" }
      : { name: "김자녀", school_name: "가온고", school_type: "high" };
  kit.state.rows.student_link_codes = () => ({ student_id: "child-1" });
  kit.state.rows.qa_accounts = (filters) =>
    qaProfileIds.includes(String(filters.profile_id))
      ? { profile_id: filters.profile_id }
      : null;
}

const lookup = () => callHandler(handler, { code: "ABCDEF" });

describe("POST /api/lookup-child", () => {
  beforeEach(() => seed([]));

  test("QA 학부모가 QA 계정이 아닌 자녀를 조회하면 403 이고 자녀 정보를 싣지 않는다", async () => {
    seed(["parent-1"]);

    const r = await lookup();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({
      ok: false,
      code: "QA_ACCOUNT_RESTRICTED",
      detail: QA_MESSAGE,
    });
    expect(JSON.stringify(r.body)).not.toContain("김자녀");
  });

  test("QA 학부모가 QA 자녀를 조회하면 통과한다", async () => {
    seed(["parent-1", "child-1"]);

    const r = await lookup();

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, child: { name: "김자녀" } });
  });

  test("QA 가 아닌 학부모는 그대로 조회한다", async () => {
    const r = await lookup();

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, child: { name: "김자녀" } });
  });
});
