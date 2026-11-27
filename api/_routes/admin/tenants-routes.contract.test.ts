// 기관 라우트 응답이 브라우저가 검증하는 계약 스키마(shared/tenants/*.ts)를 통과하는지 본다.
// 다른 기관 테스트는 필요한 칼럼만 둔 행을 쓰므로, 여기서는 실제 칼럼을 다 채운 행으로 루트 앱을 부른다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { z } from "zod";
import {
  tenantListSchema,
  tenantRowSchema,
} from "../../../shared/tenants/contract.js";
import {
  serviceSettingsSchema,
  settingRowSchema,
  tenantDetailSchema,
  tenantSavedSchema,
} from "../../../shared/tenants/detail.js";
import {
  purgeLogsSchema,
  purgePreviewSchema,
  purgeResultSchema,
} from "../../../shared/tenants/purge.js";
import { schoolAdminListSchema } from "../../../shared/tenants/school-admins.js";
import {
  movedStudentSchema,
  studentUsageSavedSchema,
  studentUsageSchema,
} from "../../../shared/tenants/students.js";
import {
  callRoute,
  createAdminFake,
  createRecorder,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  user: null as unknown,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: () => kit.user,
}));

import { app } from "../app.js";

const TENANT_ID = "8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c";
const PROFILE_ID = "3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b";

const TENANT_ROW = {
  id: TENANT_ID,
  code: "ABCD1234",
  name: "한빛고",
  region: "서울",
  org_type: "학교",
  tier: "A",
  created_at: "2026-11-01T00:00:00.000Z",
  contract_start_date: "2026-03-01",
  contract_end_date: "2026-12-31",
  grace_ends_on: "2027-01-31",
  mou_status: "signed",
  is_catch_all: false,
  time_zone: "Asia/Seoul", // tz-literal-ok: 계약 검증용 기관 행 값
};

const DETAIL_ROW = {
  id: TENANT_ID,
  code: "ABCD1234",
  name: "한빛고",
  region: "서울",
  org_type: "학교",
  tier: "A",
  contract_start_date: "2026-03-01",
  contract_end_date: "2026-12-31",
  term_months: 6,
  mou_status: "signed",
  grace_ends_on: "2027-01-31",
  trial_start_date: null,
  trial_end_date: null,
  contact_name: "김담당",
  contact_phone: "02-123-4567",
  contact_mobile: "010-1234-5678",
  contact_email: "a@b.co",
  address: "서울시",
  main_phone: "02-123-4567",
  homepage: "https://example.com",
  is_catch_all: false,
  updated_at: "2026-11-24T05:00:00.000000+00:00",
};

const SETTING_ROW = {
  program_key: "diagnose",
  enabled: true,
  starts_on: "2026-03-01",
  ends_on: null,
  monthly_limit: 5,
  term_limit: 20,
};

// 서버가 보내는 칸을 스키마가 하나도 버리지 않아야 한다(버리면 계약이 서버와 어긋난 것이다).
function conforms<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
): z.output<Schema> {
  const parsed = schema.parse(body);
  expect(parsed).toEqual(body);
  return parsed;
}

const none: Respond = () => ({ data: null, error: null });

function setup(options: {
  permissions: { resource_key: string; level: string }[];
  tables?: Record<string, Respond>;
  rpcs?: Record<string, (args: Record<string, unknown>) => never>;
  userTables?: Record<string, Respond>;
  userRpcs?: Record<string, () => { data: unknown; error: null }>;
}) {
  kit.admin = createAdminFake({
    permissions: options.permissions,
    tables: options.tables ?? {},
    rpcs: options.rpcs ?? {},
  });
  kit.user = createRecorder(options.userTables ?? {}, options.userRpcs ?? {});
}

const view = (key: string) => [{ resource_key: key, level: "view" }];
const edit = (key: string) => [{ resource_key: key, level: "edit" }];

beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("기관 라우트 응답이 계약 스키마를 통과한다", () => {
  test("GET /api/admin/tenants", async () => {
    setup({
      permissions: view("tenants"),
      tables: {
        tenants: () => ({ data: [TENANT_ROW], error: null }),
        app_settings: () => ({ data: { value: 14 }, error: null }),
      },
    });
    const r = await callRoute({ app, path: "/api/admin/tenants" });
    expect(r.status).toBe(200);
    expect(conforms(tenantListSchema, r.body).graceDays).toBe(14);
  });

  test("POST /api/admin/tenants", async () => {
    setup({
      permissions: edit("tenants"),
      userRpcs: { fn_create_tenant: () => ({ data: TENANT_ROW, error: null }) },
    });
    const r = await callRoute(
      { app, path: "/api/admin/tenants" },
      {
        method: "POST",
        body: { name: "한빛고", region: "서울", org_type: "학교", tier: "A" },
      },
    );
    expect(r.status).toBe(201);
    conforms(tenantRowSchema, r.body);
  });

  test("GET /api/admin/tenants/:id", async () => {
    setup({
      permissions: view("tenants"),
      tables: { tenants: () => ({ data: DETAIL_ROW, error: null }) },
    });
    const r = await callRoute(
      { app, path: "/api/admin/tenants/:id" },
      { query: { id: TENANT_ID } },
    );
    expect(r.status).toBe(200);
    conforms(tenantDetailSchema, r.body);
  });

  test("PATCH /api/admin/tenants/:id", async () => {
    setup({
      permissions: edit("tenants"),
      userTables: {
        tenants: () => ({
          data: [
            { id: TENANT_ID, updated_at: "2026-11-25T05:00:00.000000+00:00" },
          ],
          error: null,
        }),
      },
    });
    const { id: _id, updated_at: updatedAt, ...rest } = DETAIL_ROW;
    const { code: _code, is_catch_all: _catchAll, ...values } = rest;
    const r = await callRoute(
      { app, path: "/api/admin/tenants/:id" },
      {
        method: "PATCH",
        query: { id: TENANT_ID },
        body: { updatedAt, values },
      },
    );
    expect(r.status).toBe(200);
    conforms(tenantSavedSchema, r.body);
  });

  test("GET /api/admin/tenants/:id/service-settings", async () => {
    setup({
      permissions: view("tenants"),
      tables: {
        tenant_service_settings: () => ({ data: [SETTING_ROW], error: null }),
        app_settings: () => ({
          data: {
            value: {
              diagnose: {
                monthly_limit: 5,
                term_limit_by_term_months: { "3": 10, "6": 20 },
              },
            },
          },
          error: null,
        }),
      },
    });
    const r = await callRoute(
      { app, path: "/api/admin/tenants/:id/service-settings" },
      { query: { id: TENANT_ID } },
    );
    expect(r.status).toBe(200);
    expect(conforms(serviceSettingsSchema, r.body).items).toHaveLength(1);
  });

  test("PUT /api/admin/tenants/:id/service-settings", async () => {
    setup({
      permissions: edit("tenants"),
      userTables: {
        tenant_service_settings: () => ({ data: SETTING_ROW, error: null }),
      },
    });
    const r = await callRoute(
      { app, path: "/api/admin/tenants/:id/service-settings" },
      { method: "PUT", query: { id: TENANT_ID }, body: SETTING_ROW },
    );
    expect(r.status).toBe(200);
    conforms(settingRowSchema, r.body);
  });

  test("GET /api/admin/tenants/school-admins", async () => {
    setup({
      permissions: view("tenants"),
      tables: {
        teachers: () => ({
          data: [
            {
              id: "teacher-1",
              name: "박관리",
              phone: "01099998888",
              landline: null,
              email: "a@b.co",
              position: "교감",
              login_id: "ABCD2345XY7Z9K",
              status: "active",
              created_at: "2026-11-01T00:00:00.000Z",
              updated_at: "2026-11-02T00:00:00.000Z",
              deleted_at: null,
            },
          ],
          error: null,
        }),
        tenants: () => ({ data: { address: "서울시" }, error: null }),
      },
    });
    const r = await callRoute(
      { app, path: "/api/admin/tenants/school-admins" },
      { query: { tenantId: TENANT_ID } },
    );
    expect(r.status).toBe(200);
    expect(conforms(schoolAdminListSchema, r.body).items).toHaveLength(1);
  });

  test("GET /api/admin/tenants/purge-logs", async () => {
    setup({
      permissions: view("tenants"),
      tables: {
        admin_access_logs: () => ({
          data: [
            {
              id: "log-1",
              created_at: "2026-11-05T19:40:00Z",
              actor_login_id: null,
              actor_email: "hq@example.com",
              tenant_id: TENANT_ID,
              meta: {
                contract_end_date: "2026-09-01",
                deleted_count: 2,
                excluded_count: 1,
                member_ids: ["m-1", "m-2"],
              },
              tenants: { code: "ABCD1234", name: "한빛고" },
            },
          ],
          error: null,
        }),
      },
    });
    const r = await callRoute({ app, path: "/api/admin/tenants/purge-logs" });
    expect(r.status).toBe(200);
    expect(conforms(purgeLogsSchema, r.body).items[0]?.skippedCount).toBe(0);
  });

  test("GET /api/admin/tenants/member-purge-preview", async () => {
    setup({
      permissions: view("tenants"),
      rpcs: {
        fn_member_purge_preview: () =>
          ({
            data: [
              {
                contract_end: "2026-09-01",
                grace_end: "2026-10-01",
                local_today: "2026-10-05",
                profile_id: PROFILE_ID,
                name: "김하늘",
                grade: "중1",
                class_label: "1반",
                number: 3,
                protected: false,
              },
            ],
            error: null,
          }) as never,
      },
    });
    const r = await callRoute(
      { app, path: "/api/admin/tenants/member-purge-preview" },
      { query: { tenantId: TENANT_ID } },
    );
    expect(r.status).toBe(200);
    expect(conforms(purgePreviewSchema, r.body).students).toHaveLength(1);
  });

  test("POST /api/admin/tenants/member-purge", async () => {
    setup({
      permissions: edit("tenants"),
      rpcs: {
        fn_anonymize_expired_b2b_members: () =>
          ({
            data: [
              {
                not_yet: false,
                grace_end: "2026-10-01",
                members_anonymized: 2,
                members_protected: 1,
                members_skipped: 0,
                not_processed: 0,
              },
            ],
            error: null,
          }) as never,
      },
    });
    const r = await callRoute(
      { app, path: "/api/admin/tenants/member-purge" },
      {
        method: "POST",
        body: { tenantId: TENANT_ID, targetIds: [PROFILE_ID] },
      },
    );
    expect(r.status).toBe(200);
    expect(conforms(purgeResultSchema, r.body).deleted).toBe(2);
  });

  test("POST /api/admin/tenants/move-student", async () => {
    setup({
      permissions: edit("members"),
      rpcs: {
        fn_admin_move_student_tenant: () =>
          ({
            data: [
              {
                from_tenant_id: null,
                tenant_id: TENANT_ID,
                enrollment_id: "enrollment-1",
              },
            ],
            error: null,
          }) as never,
      },
    });
    const r = await callRoute(
      { app, path: "/api/admin/tenants/move-student" },
      {
        method: "POST",
        body: { profileId: PROFILE_ID, tenantId: TENANT_ID, grade: "중1" },
      },
    );
    expect(r.status).toBe(200);
    expect(conforms(movedStudentSchema, r.body).fromTenantId).toBeNull();
  });

  test("GET, PUT /api/admin/tenants/student-usage", async () => {
    setup({
      permissions: [
        { resource_key: "serviceCreditAdjust", level: "edit" },
        { resource_key: "tenants", level: "view" },
      ],
      tables: {
        profiles: () => ({
          data: { id: PROFILE_ID, tenant_id: TENANT_ID },
          error: null,
        }),
        tenants: () => ({
          data: { id: TENANT_ID, name: "한빛고", is_catch_all: false },
          error: null,
        }),
        tenant_service_settings: () => ({
          data: [
            {
              program_key: "diagnose",
              enabled: true,
              monthly_limit: 5,
              term_limit: null,
            },
          ],
          error: null,
        }),
        student_usage_overrides: () => ({
          data: [
            { program_key: "diagnose", monthly_limit: 7, term_limit: null },
          ],
          error: null,
        }),
      },
      rpcs: {
        fn_tenant_usage_state: () =>
          ({
            data: [
              {
                allowed: true,
                deny_reason: null,
                month_used: 1,
                month_limit: 7,
                month_remaining: 6,
                term_used: 3,
                term_limit: null,
                term_remaining: null,
                month_resets_on: "2026-12-01",
                term_resets_on: null,
              },
            ],
            error: null,
          }) as never,
      },
      userTables: { student_usage_overrides: none },
    });
    const route = { app, path: "/api/admin/tenants/student-usage" };
    const got = await callRoute(route, { query: { profileId: PROFILE_ID } });
    expect(got.status).toBe(200);
    expect(
      conforms(studentUsageSchema, got.body).programs.length,
    ).toBeGreaterThan(0);

    const saved = await callRoute(route, {
      method: "PUT",
      body: {
        rows: [
          { profile_id: PROFILE_ID, program_key: "diagnose", monthly_limit: 3 },
        ],
      },
    });
    expect(saved.status).toBe(200);
    expect(conforms(studentUsageSavedSchema, saved.body).saved).toBe(1);
  });
});
