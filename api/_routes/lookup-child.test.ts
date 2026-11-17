// POST /api/lookup-child: QA 학부모는 QA 자녀만 조회할 수 있다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  schoolmentor: false,
}));

vi.mock("../_lib/site.js", () => ({
  isSchoolmentorSite: () => kit.schoolmentor,
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
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
  beforeEach(() => {
    kit.schoolmentor = false;
    seed([]);
  });

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

  describe("코드 명칭은 사이트를 따른다", () => {
    const lookupWith = (code: string) => callHandler(handler, { code });

    test("스쿨멘토는 학생 고유코드, 위닝은 연결코드로 형식 오류를 안내한다", async () => {
      kit.schoolmentor = true;
      const sm = await lookupWith("abc");
      expect(sm.status).toBe(400);
      expect(sm.body).toMatchObject({
        reason: "invalid_code_format",
        detail: "학생 고유코드 6자리를 정확히 입력해 주세요.",
      });

      kit.schoolmentor = false;
      const win = await lookupWith("abc");
      expect(win.body).toMatchObject({
        detail: "연결코드 6자리를 정확히 입력해 주세요.",
      });
    });

    test("스쿨멘토는 학생 고유코드, 위닝은 연결코드로 없는 코드를 안내한다", async () => {
      kit.state.rows.student_link_codes = () => null;

      kit.schoolmentor = true;
      const sm = await lookupWith("ABCDEF");
      expect(sm.status).toBe(404);
      expect(sm.body).toMatchObject({
        reason: "link_code_not_found",
        detail: "일치하는 학생 고유코드가 없습니다.",
      });

      kit.schoolmentor = false;
      const win = await lookupWith("ABCDEF");
      expect(win.body).toMatchObject({
        detail: "일치하는 연결코드가 없습니다.",
      });
    });

    test("스쿨멘토는 학생 고유코드, 위닝은 연결코드로 조회 오류를 안내한다", async () => {
      kit.state.rows.student_link_codes = () => {
        throw new Error("boom");
      };
      vi.spyOn(console, "error").mockImplementation(() => {});

      kit.schoolmentor = true;
      const sm = await lookupWith("ABCDEF");
      expect(sm.status).toBe(500);
      expect(sm.body).toMatchObject({
        detail: "학생 고유코드 조회 중 오류가 발생했습니다.",
      });

      kit.schoolmentor = false;
      const win = await lookupWith("ABCDEF");
      expect(win.body).toMatchObject({
        detail: "연결코드 조회 중 오류가 발생했습니다.",
      });
    });
  });
});
