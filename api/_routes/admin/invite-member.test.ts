// 관리자 초대 계약 검증. 최고 관리자 전용 메뉴(adminMembers)이고 오류는 problem 모양이다.
// 계정은 auth.users 에서 확인된 이메일로만 찾고, 회원이 고칠 수 있던 profiles.email 복사본은 보지 않는다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  inviteResultSchema,
  needsConfirmExtraSchema,
} from "../../../shared/invite-member/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { app } from "../app.js";

const route = { app, path: "/api/admin/invite-member" };
const call = (body: unknown, method = "POST") =>
  callRoute(route, { method, body });

const INVITED = "target@b.co";
const BODY = { email: INVITED, name: "새 관리자", roleId: "role-1" };
const HQ = { id: "hq-1", role: "admin" };

function superAdmin(isSuper: boolean) {
  kit.state.rpc.fn_is_super_admin = () => ({ data: isSuper, error: null });
}

// profiles.email 이 초대 주소와 같지만 auth 이메일은 다른 행(예전 직접 쓰기로 남은 복사본).
const STALE_COPY = {
  id: "stale-1",
  email: INVITED,
  member_type: "student",
  name: "다른 사람",
};
// auth 이메일이 초대 주소인 실제 계정. profiles.email 은 옛 값이다.
const REAL = {
  id: "real-1",
  email: "old@b.co",
  member_type: null,
  name: "진짜 주인",
};

let invite: ReturnType<typeof vi.fn>;

function authUser(emailConfirmedAt: string | null) {
  kit.state.rpc.fn_auth_user_id_by_email = ({ p_email }) => ({
    data: p_email === INVITED ? REAL.id : null,
    error: null,
  });
  kit.state.auth.getUserById.mockImplementation(async (id: string) => ({
    data: {
      user:
        id === REAL.id
          ? { id, email: INVITED, email_confirmed_at: emailConfirmedAt }
          : null,
    },
    error: null,
  }));
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  kit.state.rows.profiles = (f) =>
    matchRows([HQ, STALE_COPY, REAL], f)[0] ?? null;
  kit.state.rows.admin_members = (f) =>
    matchRows([{ profile_id: REAL.id, status: "active" }], f)[0] ?? null;
  superAdmin(true);
  invite = vi.fn(async () => ({
    data: { user: { id: "new-1" } },
    error: null,
  }));
  (kit.state.auth as Record<string, unknown>).inviteUserByEmail = invite;
});

describe("admin/invite-member 기존 계정 찾기", () => {
  test("auth 이메일이 확인된 계정을 고르고 profiles.email 복사본은 고르지 않는다", async () => {
    authUser("2026-11-01T00:00:00Z");

    const r = await call(BODY);

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      status: 409,
      code: "ALREADY_ACTIVE_ADMIN",
      detail: "이미 활성 상태인 관리자입니다.",
    });
    expect(invite).not.toHaveBeenCalled();
  });

  test("profiles.email 만 초대 주소와 같고 auth 이메일이 다른 계정은 고르지 않는다", async () => {
    // 초대 주소를 auth 이메일로 가진 계정이 없다. STALE_COPY 의 profiles.email 만 같다.
    kit.state.rpc.fn_auth_user_id_by_email = () => ({
      data: null,
      error: null,
    });

    const r = await call(BODY);

    expect(r.status).toBe(200);
    expect(invite).toHaveBeenCalledWith(INVITED, expect.anything());
    expect(kit.state.upserts.map((u) => u.row.profile_id)).not.toContain(
      STALE_COPY.id,
    );
  });

  test("이메일 확인 전인 auth 계정은 고르지 않는다", async () => {
    authUser(null);

    const r = await call(BODY);

    expect(r.status).toBe(200);
    expect(invite).toHaveBeenCalledWith(INVITED, expect.anything());
    expect(kit.state.upserts.map((u) => u.row.profile_id)).not.toContain(
      REAL.id,
    );
  });
});

describe("admin/invite-member 실패 응답 detail", () => {
  const RAW = "secret_relation 홍길동 010-1234-5678";

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.rpc.fn_auth_user_id_by_email = () => ({
      data: null,
      error: null,
    });
  });

  test("초대 메일 발송이 실패해도 detail 에 Supabase 원문을 싣지 않는다", async () => {
    invite.mockResolvedValue({ data: { user: null }, error: { message: RAW } });

    const r = await call(BODY);

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
    expect(r.body).toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "초대 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(console.error).toHaveBeenCalled();
  });

  test("프로필 생성이 실패해도 detail 에 DB 원문을 싣지 않는다", async () => {
    kit.state.insertErrors.profiles = { message: RAW };

    const r = await call(BODY);

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
    expect(r.body).toMatchObject({
      code: "INTERNAL_ERROR",
      detail: "프로필 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  test("관리자 등록이 실패해도 detail 에 DB 원문을 싣지 않는다", async () => {
    kit.state.insertErrors.admin_members = { message: RAW };

    const r = await call(BODY);

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
    expect(r.body).toMatchObject({
      code: "INTERNAL_ERROR",
      detail: "관리자 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });
});
describe("admin/invite-member 권한과 입력", () => {
  beforeEach(() => {
    kit.state.rpc.fn_auth_user_id_by_email = () => ({
      data: null,
      error: null,
    });
  });

  const writes = () =>
    kit.state.events.filter((e) => /^(upsert|insert|update):/.test(e));

  test("최고 관리자가 아니면 403 이고 초대하지 않는다", async () => {
    superAdmin(false);

    const r = await call(BODY);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(invite).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  test("QA 관리자는 403 QA_ACCOUNT_READ_ONLY 이고 초대하지 않는다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "hq-1" });

    const r = await call(BODY);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "QA_ACCOUNT_READ_ONLY" });
    expect(invite).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  test.each([
    [
      "이메일 형식",
      { ...BODY, email: "abc" },
      "email",
      "이메일을 확인해 주세요.",
    ],
    [
      "이메일 없음",
      { name: "a", roleId: "r" },
      "email",
      "이메일을 확인해 주세요.",
    ],
    ["이름 공백", { ...BODY, name: "  " }, "name", "이름을 입력해 주세요."],
    [
      "권한 묶음 공백",
      { ...BODY, roleId: " " },
      "roleId",
      "권한 묶음을 선택해 주세요.",
    ],
  ])(
    "%s 오류는 옛 문구의 400 VALIDATION_FAILED 이다",
    async (_label, body, path, message) => {
      const r = await call(body);

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({
        code: "VALIDATION_FAILED",
        errors: [{ path, message }],
      });
      expect(invite).not.toHaveBeenCalled();
      expect(writes()).toEqual([]);
    },
  );

  test("POST 이외의 메서드는 405 이고 Allow 가 POST 다", async () => {
    const r = await call(undefined, "GET");

    expect(r.status).toBe(405);
    expect(r.body).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
    expect(r.headers.allow).toBe("POST");
    expect(invite).not.toHaveBeenCalled();
  });

  test("모르는 키는 400 이다", async () => {
    const r = await call({ ...BODY, invitedBy: "x" });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(invite).not.toHaveBeenCalled();
  });

  test("새 계정은 메일을 보내고 ok 없는 응답을 준다. 이메일은 소문자로, invited_by 는 호출한 관리자", async () => {
    const r = await call({
      ...BODY,
      email: "  Target@B.co ",
      department: " 운영팀 ",
    });

    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).toEqual({
      profileId: "new-1",
      resent: false,
      emailed: true,
    });
    expect(inviteResultSchema.safeParse(r.body).success).toBe(true);
    expect(invite).toHaveBeenCalledWith(INVITED, expect.anything());
    const member = kit.state.upserts.find((u) => u.table === "admin_members");
    expect(member?.onConflict).toBe("profile_id");
    expect(member?.row).toMatchObject({
      profile_id: "new-1",
      role_id: "role-1",
      department: "운영팀",
      status: "invited",
      invited_by: "hq-1",
    });
    expect(kit.state.upserts.find((u) => u.table === "profiles")?.row).toEqual({
      id: "new-1",
      email: INVITED,
      name: "새 관리자",
      role: "user",
    });
  });

  describe("서비스 회원 계정", () => {
    beforeEach(() => {
      authUser("2026-11-01T00:00:00Z");
      kit.state.rows.profiles = (f) =>
        matchRows([HQ, { ...REAL, member_type: "student" }], f)[0] ?? null;
      kit.state.rows.admin_members = () => null;
    });

    test("확인 없이는 409 NEEDS_CONFIRM 이고 회원 유형과 이름을 알려 준다", async () => {
      const r = await call(BODY);

      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({
        code: "NEEDS_CONFIRM",
        detail:
          "이 이메일은 이미 서비스 회원(student)으로 가입돼 있습니다. 그 계정을 관리자로 올리시겠습니까?",
        existingMemberType: "student",
        existingName: REAL.name,
      });
      expect(needsConfirmExtraSchema.safeParse(r.body).success).toBe(true);
      expect(writes()).toEqual([]);
    });

    test("confirmExisting 이면 메일 없이 관리자로 올린다", async () => {
      const r = await call({
        ...BODY,
        confirmExisting: true,
      });

      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        profileId: REAL.id,
        resent: false,
        emailed: false,
      });
      expect(invite).not.toHaveBeenCalled();
      expect(kit.state.upserts.map((u) => u.table)).toEqual(["admin_members"]);
    });
  });
});
