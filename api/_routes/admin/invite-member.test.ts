// 관리자 초대가 기존 계정을 고르는 기준을 검증한다.
// 계정은 auth.users 에서 확인된 이메일로만 찾고, 회원이 고칠 수 있던 profiles.email 복사본은 보지 않는다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
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

import inviteMember from "./invite-member.js";

const INVITED = "target@b.co";
const BODY = { email: INVITED, name: "새 관리자", roleId: "role-1" };

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
  kit.state.rows.profiles = (f) => matchRows([STALE_COPY, REAL], f)[0] ?? null;
  kit.state.rows.admin_members = (f) =>
    matchRows(
      [
        {
          profile_id: "hq-1",
          status: "active",
          admin_roles: { is_super: true },
        },
        { profile_id: REAL.id, status: "active" },
      ],
      f,
    )[0] ?? null;
  invite = vi.fn(async () => ({
    data: { user: { id: "new-1" } },
    error: null,
  }));
  (kit.state.auth as Record<string, unknown>).inviteUserByEmail = invite;
});

describe("admin/invite-member 기존 계정 찾기", () => {
  test("auth 이메일이 확인된 계정을 고르고 profiles.email 복사본은 고르지 않는다", async () => {
    authUser("2026-11-01T00:00:00Z");

    const r = await callHandler(inviteMember, BODY);

    expect(r.status).toBe(409);
    expect(r.body).toEqual({ detail: "이미 활성 상태인 관리자입니다." });
    expect(invite).not.toHaveBeenCalled();
  });

  test("profiles.email 만 초대 주소와 같고 auth 이메일이 다른 계정은 고르지 않는다", async () => {
    // 초대 주소를 auth 이메일로 가진 계정이 없다. STALE_COPY 의 profiles.email 만 같다.
    kit.state.rpc.fn_auth_user_id_by_email = () => ({
      data: null,
      error: null,
    });

    const r = await callHandler(inviteMember, BODY);

    expect(r.status).toBe(200);
    expect(invite).toHaveBeenCalledWith(INVITED, expect.anything());
    expect(kit.state.upserts.map((u) => u.row.profile_id)).not.toContain(
      STALE_COPY.id,
    );
  });

  test("이메일 확인 전인 auth 계정은 고르지 않는다", async () => {
    authUser(null);

    const r = await callHandler(inviteMember, BODY);

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

    const r = await callHandler(inviteMember, BODY);

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
    expect(r.body).toEqual({
      detail: "초대 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(console.error).toHaveBeenCalled();
  });

  test("프로필 생성이 실패해도 detail 에 DB 원문을 싣지 않는다", async () => {
    kit.state.insertErrors.profiles = { message: RAW };

    const r = await callHandler(inviteMember, BODY);

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
    expect(r.body).toEqual({
      detail: "프로필 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  test("관리자 등록이 실패해도 detail 에 DB 원문을 싣지 않는다", async () => {
    kit.state.insertErrors.admin_members = { message: RAW };

    const r = await callHandler(inviteMember, BODY);

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
    expect(r.body).toEqual({
      detail: "관리자 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });
});
