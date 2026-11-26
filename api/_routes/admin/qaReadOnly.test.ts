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
import memberPurge from "./tenants/member-purge.js";
import moveStudent from "./tenants/move-student.js";
import schoolAdmin from "./tenants/school-admin.js";
import { app } from "../app.js";

const QA_BODY = {
  detail: "QA 계정이라 이 기능은 작동하지 않아요.",
  code: "QA_ACCOUNT_READ_ONLY",
};

const ROUTES = [
  ["tenants/member-purge", memberPurge],
  ["tenants/move-student", moveStudent],
  ["tenants/school-admin", schoolAdmin],
  ["console/proxy/start", startProxy],
] as const;

// Hono 로 옮긴 라우트는 루트 앱으로 부른다.
const HONO_ROUTES = ["send-message", "invite-member"] as const;

const WRITE_BODY = {
  tenantId: "t1",
  reason: "roster_proxy",
  profileId: "p1",
  text: "hi",
  phone: "01012345678",
  email: "a@b.co",
  name: "n",
  roleId: "r1",
};

beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  // auth:"admin" 라우트가 관리자 판정(role)으로 읽는다.
  kit.state.rows.profiles = () => ({ role: "admin" });
  // 모든 리소스에 edit 권한이 있고 최고 관리자인 본사 관리자.
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: ["tenants", "members", "teacherConsoleProxy"].map((resource_key) => ({
      resource_key,
      level: "edit",
    })),
    error: null,
  });
  // auth:"admin" 로 옮긴 라우트(send-message, move-student)가 resolveAdmin 에서 읽는 role 이다.
  kit.state.rows.profiles = () => ({ role: "admin" });
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

    const r = await callHandler(handler, WRITE_BODY);

    expect(r.status).toBe(403);
    expect(r.body).toEqual(expect.objectContaining(QA_BODY));
    expect(kit.state.inserts).toEqual([]);
    expect(
      kit.state.events.filter((e) => e.startsWith("rpc:fn_proxy")),
    ).toEqual([]);
  });
});

describe.each(HONO_ROUTES)("%s", (name) => {
  test("QA 본사 관리자는 403 QA_ACCOUNT_READ_ONLY 이고 아무것도 쓰지 않는다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "hq-1" });

    const response = await app.request(`/api/admin/${name}`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify(WRITE_BODY),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(expect.objectContaining(QA_BODY));
    expect(kit.state.inserts).toEqual([]);
  });
});
