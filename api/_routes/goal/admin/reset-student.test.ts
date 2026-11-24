// POST /api/goal/admin/reset-student 계약 검증. 리셋 로직은 RPC fn_goal_reset_student 에 있고
// 이 라우트는 권한, 입력 검증, 오류 매핑만 맡는다. 쓰기는 이 RPC 하나뿐이며 구 화면도 같은 서버 라우트만 썼다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { seedAdmin } from "../../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";
import {
  createGoalAdmin,
  createGoalDb,
  type GoalDb,
} from "../../../_lib/goal/adminStudentsTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as GoalDb,
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createGoalAdmin(kit.state, kit.db),
}));

import handler from "./reset-student.js";

const ID = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) => callHandler(handler, body, "POST");

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createGoalDb({});
  seedAdmin(kit.state, "edit", "goalStudents");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/goal/admin/reset-student", () => {
  test("edit 권한이면 RPC 를 부르고 204 로 끝난다", async () => {
    const r = await post({ profileId: ID });
    expect(r.status).toBe(204);
    expect(kit.db.rpcCalls).toEqual([
      { name: "fn_goal_reset_student", args: { p_profile_id: ID } },
    ]);
  });

  test("view 권한은 403 이고 RPC 를 부르지 않는다", async () => {
    seedAdmin(kit.state, "view", "goalStudents");
    const r = await post({ profileId: ID });
    expect(r.status).toBe(403);
    expect(kit.db.rpcCalls).toEqual([]);
  });

  test("profileId 가 없거나 uuid 가 아니면 400", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ profileId: "x" })).status).toBe(400);
    expect(kit.db.rpcCalls).toEqual([]);
  });

  test("학생 행이 없으면 404 NOT_FOUND", async () => {
    kit.db.rpcErrors.fn_goal_reset_student = "goal_student_not_found";
    const r = await post({ profileId: ID });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_FOUND",
      detail: "해당 학생을 찾을 수 없습니다.",
    });
  });

  test("그 밖의 RPC 오류는 500 과 고정 문구", async () => {
    kit.db.rpcErrors.fn_goal_reset_student = "boom";
    const r = await post({ profileId: ID });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ detail: "리셋 처리에 실패했습니다." });
  });

  test("POST 가 아니면 405", async () => {
    expect((await callHandler(handler, undefined, "GET")).status).toBe(405);
  });
});
