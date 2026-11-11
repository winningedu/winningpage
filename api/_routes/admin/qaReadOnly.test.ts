// 권한을 DB 함수나 admin_members 로 따로 판정하는 관리자 쓰기 라우트가 QA 관리자를 막는지 검증한다.
// auth:"admin" 라우트는 resolveAdmin 이 막는다(api/_lib/qaAccount.test.ts, handler.qa.test.ts).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import startProxy from "../console/proxy/start.js";
import inviteMember from "./invite-member.js";
import sendMessage from "./send-message.js";
import memberPurge from "./tenants/member-purge.js";
import moveStudent from "./tenants/move-student.js";
import schoolAdmin from "./tenants/school-admin.js";

const QA_BODY = {
  detail: "QA 계정이라 이 기능은 작동하지 않아요.",
  code: "QA_ACCOUNT_READ_ONLY",
};

const ROUTES = [
  ["tenants/member-purge", memberPurge],
  ["tenants/move-student", moveStudent],
  ["tenants/school-admin", schoolAdmin],
  ["console/proxy/start", startProxy],
  ["send-message", sendMessage],
  ["invite-member", inviteMember],
] as const;

beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  // 모든 리소스에 edit 권한이 있고 최고 관리자인 본사 관리자.
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: ["tenants", "members", "teacherConsoleProxy"].map((resource_key) => ({
      resource_key,
      level: "edit",
    })),
    error: null,
  });
  kit.state.rows.admin_members = () => ({
    profile_id: "hq-1",
    status: "active",
    admin_roles: { is_super: true },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(ROUTES)("%s", (_name, handler) => {
  test("QA 본사 관리자는 403 QA_ACCOUNT_READ_ONLY 이고 아무것도 쓰지 않는다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "hq-1" });

    const r = await callHandler(handler, {
      tenantId: "t1",
      reason: "support",
      profileId: "p1",
      text: "hi",
      phone: "01012345678",
      email: "a@b.co",
      name: "n",
      roleId: "r1",
    });

    expect(r.status).toBe(403);
    expect(r.body).toEqual(expect.objectContaining(QA_BODY));
    expect(kit.state.inserts).toEqual([]);
    expect(
      kit.state.events.filter((e) => e.startsWith("rpc:fn_proxy")),
    ).toEqual([]);
  });
});
