// GET, PATCH /api/console/org-info 계약 검증(W17, 교 #230, #231). 최종확인 전에는 학교 관리자가 고치고, 이후에는 조회만 된다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  schoolAdminActor,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  confirmed: false,
}));

// 키트의 가짜 쿼리 빌더에는 .is() 가 없어 .eq() 와 같은 필터 기록으로 대신한다.
vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => {
    const fake = createFakeAdmin(kit.state);
    const from = fake.from;
    fake.from = (table: string) => {
      const chain = from(table);
      chain.is = chain.eq;
      return chain;
    };
    return fake;
  },
}));

import handler from "./org-info.js";

const patch = (body: unknown) => callHandler(handler, body, "PATCH");
const get = () => callHandler(handler, undefined, "GET");

const TENANT = {
  id: "tenant-1",
  code: "SCHOOL001",
  name: "한빛중학교",
  address: null,
  main_phone: null,
  contact_phone: null,
  contact_mobile: null,
  homepage: null,
  contact_email: null,
  info_confirmed_at: null,
};

beforeEach(() => {
  kit.state = createKitState();
  kit.confirmed = false;
  kit.state.actor = schoolAdminActor();
  // 조건부 update(info_confirmed_at is null 필터가 있는 호출)는 확정 전에만 한 행을 돌려준다.
  kit.state.rows.tenants = (filters) =>
    "info_confirmed_at" in filters
      ? kit.confirmed
        ? []
        : [{ id: "tenant-1" }]
      : {
          ...TENANT,
          info_confirmed_at: kit.confirmed ? "2026-11-05T01:00:00Z" : null,
        };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/console/org-info", () => {
  test("기관 정보와 확정 시각을 돌려준다(소속코드는 읽기 전용 값)", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      code: "SCHOOL001",
      name: "한빛중학교",
      address: null,
      mainPhone: null,
      contactPhone: null,
      contactMobile: null,
      homepage: null,
      contactEmail: null,
      infoConfirmedAt: null,
    });
  });
});

describe("PATCH /api/console/org-info", () => {
  test("학교 관리자가 확정 전에 입력 항목을 저장하면 자기 기관 행만 고치고 감사 로그를 남긴다", async () => {
    const r = await patch({
      name: " 한빛중학교 ",
      address: "세종시 마음안1로 61",
      mainPhone: "044-123-4567",
      contactPhone: "044-123-4568",
      contactMobile: "010-1234-5678",
      homepage: "https://hanbit.example.kr",
      contactEmail: "admin@hanbit.example.kr",
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(kit.state.updates).toEqual([
      {
        table: "tenants",
        values: {
          name: "한빛중학교",
          address: "세종시 마음안1로 61",
          main_phone: "044-123-4567",
          contact_phone: "044-123-4568",
          contact_mobile: "010-1234-5678",
          homepage: "https://hanbit.example.kr",
          contact_email: "admin@hanbit.example.kr",
        },
        filters: { id: "tenant-1", info_confirmed_at: null },
      },
    ]);
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "settings_change",
      resource_key: "console.org-info",
      target_id: "tenant-1",
      tenant_id: "tenant-1",
    });
  });

  test("보낸 항목만 고치고 빈 문자열은 비운다(null)", async () => {
    await patch({ address: "" });

    expect(kit.state.updates[0]?.values).toEqual({ address: null });
  });

  test("소속코드나 알 수 없는 항목은 무시하지 않고 400 이다", async () => {
    const r = await patch({ code: "HACK", name: "x" });

    expect(r.status).toBe(400);
    expect(kit.state.updates).toHaveLength(0);
  });

  test("바꿀 항목이 없으면 400", async () => {
    const r = await patch({});

    expect(r.status).toBe(400);
  });

  test.each([
    ["기관명 비움", { name: "  " }],
    ["전화번호에 문자", { mainPhone: "044-abc" }],
    ["담당자 핸드폰에 문자", { contactMobile: "010 1234" }],
    ["이메일 형식", { contactEmail: "no-at-sign" }],
    ["홈페이지가 http 로 시작하지 않음", { homepage: "ftp://x.kr" }],
    ["문자열이 아님", { address: 123 }],
  ])("%s 이면 400 이고 저장하지 않는다", async (_label, body) => {
    const r = await patch(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(kit.state.updates).toHaveLength(0);
  });

  test("최종확인 뒤에는 409 ALREADY_CONFIRMED 이고 감사 로그도 남기지 않는다", async () => {
    kit.confirmed = true;

    const r = await patch({ address: "새 주소" });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "ALREADY_CONFIRMED" } });
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("담임은 403 NOT_SCHOOL_ADMIN", async () => {
    kit.state.actor = schoolAdminActor({ kind: "homeroom" });

    const r = await patch({ address: "a" });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "NOT_SCHOOL_ADMIN" } });
  });

  test("본사 대행은 세션 기관 행만 고치고 감사 로그를 본사 직원 이름과 대행 세션 id 로 남긴다", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "hq_proxy",
      teacher_id: null,
      proxy_session_id: "session-1",
    });

    const r = await patch({ address: "새 주소" });

    expect(r.status).toBe(200);
    expect(kit.state.updates).toEqual([
      {
        table: "tenants",
        values: { address: "새 주소" },
        filters: { id: "tenant-1", info_confirmed_at: null },
      },
    ]);
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "settings_change",
      resource_key: "console.org-info",
      actor_kind: "hq_proxy",
      actor_email: "admin@example.com",
      proxy_session_id: "session-1",
      teacher_id: null,
      tenant_id: "tenant-1",
      target_id: "tenant-1",
    });
  });

  test("임시 비밀번호 상태의 관리자는 403 MUST_CHANGE_PASSWORD", async () => {
    kit.state.actor = schoolAdminActor({ must_change_password: true });

    const r = await patch({ address: "a" });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "MUST_CHANGE_PASSWORD" } });
  });
});
