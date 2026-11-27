// 회원 상세 라우트 응답이 브라우저가 검증하는 계약 스키마(shared/members/detail.ts)를 통과하는지 본다.
// 다른 테스트는 필요한 컬럼만 둔 행을 쓰므로, 여기서는 실제 컬럼을 다 채운 행으로 부른다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { memberRowSchema } from "../../../shared/members/contract.js";
import {
  memberLinksSchema,
  memberMessagesSchema,
  memberOrdersSchema,
  memberServicesSchema,
} from "../../../shared/members/detail.js";
import {
  createSectionAdmin,
  type SectionDb,
} from "../../_lib/admin-sections/sectionTestKit.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";
import { MEMBER_ID, seedMembersDb } from "../../_lib/members/membersTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
  userState: null as unknown as KitState,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createSectionAdmin(kit.state, kit.db),
}));

vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: () => createFakeAdmin(kit.userState),
}));

import { app } from "../app.js";

const TENANT = "9f506e7f-8192-43a4-8ebf-3a4b5c6d7e8f";
const PARENT = "7d3e4c5d-6f70-4182-8c9d-1e2f3a4b5c6d";

const TABLES = {
  profiles: [
    {
      id: MEMBER_ID,
      name: "가 학생",
      username: null,
      email: "a@x.kr",
      phone: "01011112222",
      member_type: "student",
      role: "student",
      created_at: "2026-03-01T00:00:00Z",
      birth_date: "2010-01-01",
      gender: null,
      school_name: "한빛중",
      school_type: "middle",
      region: null,
      address: null,
      address_detail: null,
      landline: null,
      guardian_phone: "01099998888",
      memo: null,
      member_category: "일반",
      tenant_id: TENANT,
      is_active: true,
      terms_service_agreed: true,
      privacy_required_agreed: true,
      privacy_optional_agreed: false,
      marketing_agreed: false,
      ads_agreed: false,
      sms_agreed: false,
    },
    { id: PARENT, name: "학부모", email: "p@x.kr", phone: "01033334444" },
  ],
  tenants: [{ id: TENANT, name: "한빛 학원" }],
  parent_child_links: [
    { id: "l-1", parent_id: PARENT, student_id: MEMBER_ID, status: "approved" },
  ],
  program_access: [
    {
      id: MEMBER_ID,
      program_key: "diagnose",
      payment_status: "paid",
      access_status: "active",
      paid_amount: 18000,
      starts_at: "2026-03-01T00:00:00Z",
      expires_at: null,
      access_started_at: "2026-03-01T00:00:00Z",
      access_expires_at: "2026-09-01T00:00:00Z",
    },
  ],
  orders: [
    {
      id: "o-1",
      status: "paid",
      order_name: "진단",
      amount: 18000,
      list_amount: 20000,
      discount_amount: 2000,
      method: "card",
      paid_at: "2026-03-01T00:00:00Z",
      created_at: "2026-03-01T00:00:00Z",
      student_profile_id: MEMBER_ID,
      parent_profile_id: PARENT,
    },
  ],
  alimtalk_send_logs: [
    {
      id: 7,
      profile_id: MEMBER_ID,
      template_key: "welcome",
      channel: "alimtalk",
      subject: null,
      message: "안녕하세요",
      status: "sent",
      provider_message: null,
      sent_at: "2026-03-01T00:00:00Z",
    },
  ],
};

beforeEach(() => {
  kit.state = createKitState();
  kit.db = seedMembersDb(kit.state, "edit", TABLES, "view");
  kit.userState = createKitState();
  kit.userState.rpc.fn_admin_set_profile_tenant = () => ({
    data: null,
    error: null,
  });
});

const path = (suffix = "") => ({
  app,
  path: `/api/admin/members/:id${suffix}`,
});
const get = (suffix = "") =>
  callRoute(path(suffix), { query: { id: MEMBER_ID } });

describe("회원 상세 응답이 계약을 따른다", () => {
  test("GET /:id", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(memberRowSchema.parse(r.body)).toMatchObject({
      id: MEMBER_ID,
      tenant_name: "한빛 학원",
    });
  });

  test("PATCH /:id", async () => {
    const r = await callRoute(path(), {
      method: "PATCH",
      query: { id: MEMBER_ID },
      body: { member_category: "VIP" },
    });

    expect(r.status).toBe(200);
    expect(memberRowSchema.parse(r.body).member_category).toBe("VIP");
  });

  test("PUT /:id/tenant", async () => {
    const r = await callRoute(path("/tenant"), {
      method: "PUT",
      query: { id: MEMBER_ID },
      body: { tenantId: TENANT },
    });

    expect(r.status).toBe(200);
    expect(memberRowSchema.parse(r.body).tenant_id).toBe(TENANT);
  });

  test("GET /:id/links", async () => {
    const r = await get("/links");

    expect(memberLinksSchema.parse(r.body).items).toHaveLength(1);
  });

  test("GET /:id/services", async () => {
    const r = await get("/services");

    expect(memberServicesSchema.parse(r.body).items[0]).toMatchObject({
      program_key: "diagnose",
      paid_amount: 18000,
    });
  });

  test("GET /:id/orders", async () => {
    const r = await get("/orders");

    expect(memberOrdersSchema.parse(r.body).items[0]).toMatchObject({
      amount: 18000,
    });
  });

  test("GET /:id/messages", async () => {
    const r = await get("/messages");

    expect(memberMessagesSchema.parse(r.body).items[0]).toMatchObject({
      id: 7,
    });
  });
});
