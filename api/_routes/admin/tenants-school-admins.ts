// /api/admin/tenants 아래 전체 관리자(학교 관리자) 라우트(school-admin, school-admins). 관리자 앱이 .route("/tenants", tenantsSchoolAdmins) 로 붙인다.
// 글자 그대로인 경로라 tenants.ts 의 /:id 보다 먼저 붙인다. 요청 검증과 응답 모양은 shared/tenant/contract.ts 를 따른다.
//
// POST /school-admin { tenantId, name, phone, position?, email?, landline? }: 본사가 기관 관리 화면에서 학교 관리자를 발급한다(사 #132, #159, D9). 같은 사람(기관, 이름, 전화번호)이
//   이미 담임이면 그 행을 학교 관리자로 승격한다. 임시 비밀번호는 응답에 한 번만 싣는다. 대행 세션은 필요 없다. 권한: 메뉴 tenants edit.
// GET /school-admins?tenantId=: 본사가 기관 관리 화면에서 그 기관의 학교 관리자 목록을 본다(사 #159, 결정 102.6). 담임은 빼고,
//   주소(기관 주소), 발급일, 등록취소일은 읽기 전용 값이다. 취소와 재발급은 본사 대행으로 하므로 쓰기 길은 없다.
//   teachers 는 authenticated 에 막혀 있어 service_role 로 읽는다. 권한: 메뉴 tenants view 이상.

import {
  issueSchoolAdminBody,
  SCHOOL_ADMIN_LIMIT,
  type SchoolAdminList,
  schoolAdminsQuery,
} from "../../../shared/tenant/contract.js";
import {
  parseRegisterBody,
  registerResponseBody,
  registerTeacherWithAccount,
  teacherDbProblem,
} from "../../_lib/console/teacherAccounts.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { nodeHeaders } from "../../_lib/hono/request.js";
import { validate } from "../../_lib/hono/validate.js";
import { getBearerToken } from "../../_lib/serviceAccess.js";

const MAX_POSITION_LENGTH = 50;
const MAX_EMAIL_LENGTH = 254;

interface AdminProfileFields {
  position?: string;
  email?: string;
  landline?: string;
}

/** 직책, 담당 이메일, 일반전화(사 #159-q3). 모두 선택이고 잘못된 값이면 null. 전화는 숫자만으로 정규화한다. */
function parseProfileFields(body: unknown): AdminProfileFields | null {
  const { position, email, landline } = (body ?? {}) as Record<string, unknown>;
  const fields: AdminProfileFields = {};
  if (position !== undefined && position !== null) {
    if (typeof position !== "string") return null;
    const trimmed = position.trim();
    if (trimmed.length > MAX_POSITION_LENGTH) return null;
    if (trimmed) fields.position = trimmed;
  }
  if (email !== undefined && email !== null) {
    if (typeof email !== "string") return null;
    const normalized = email.trim().toLowerCase();
    if (normalized) {
      if (
        normalized.length > MAX_EMAIL_LENGTH ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
      ) {
        return null;
      }
      fields.email = normalized;
    }
  }
  if (landline !== undefined && landline !== null) {
    if (typeof landline !== "string") return null;
    const digits = landline.replace(/\D/g, "");
    if (digits) {
      if (!/^0[0-9]{8,10}$/.test(digits)) return null;
      fields.landline = digits;
    }
  }
  return fields;
}

interface TeacherRow {
  id: string;
  name: string;
  phone: string;
  landline: string | null;
  email: string | null;
  position: string | null;
  login_id: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const issueGuard = admin({
  permission: { key: "tenants" },
  // registerTeacherWithAccount 가 account_issue 행을 직접 남긴다.
  audit: false,
  unhandledMessage: "전체 관리자를 발급하지 못했습니다.",
  logLabel: "[admin/tenants/school-admin]",
});
const listGuard = admin({
  permission: { key: "tenants" },
  unhandledMessage: "전체 관리자를 불러오지 못했습니다.",
  logLabel: "[admin/tenants/school-admins]",
});

export const tenantsSchoolAdmins = adminFactory
  .createApp()
  .post(
    "/school-admin",
    issueGuard,
    validate("json", issueSchoolAdminBody),
    async (c) => {
      const userId = c.var.userId as string;
      const raw = c.req.valid("json");
      const { tenantId } = raw;
      const body = parseRegisterBody(raw);
      const profileFields = parseProfileFields(raw);
      if (!body || !profileFields) {
        throw new ProblemError(
          400,
          "기관, 이름, 전화번호, 직책, 이메일, 일반전화를 확인해 주세요.",
          "VALIDATION_FAILED",
        );
      }

      // 감사 로그의 실행자 이메일용. 관리자 판정은 user 를 싣지 않아 토큰으로 다시 읽는다.
      const { data: authData } = await c.var.supabaseAdmin.auth.getUser(
        getBearerToken({ headers: nodeHeaders(c) }),
      );

      try {
        const result = await registerTeacherWithAccount(
          {
            supabaseAdmin: c.var.supabaseAdmin,
            userId,
            user: authData.user ?? undefined,
            // 대행 세션 없이 본사 관리자가 직접 하는 일이라 proxySessionId 는 비어 있다.
            console: {
              kind: "hq",
              tenantId,
              teacherId: null,
              classIds: [],
              proxySessionId: null,
              mustChangePassword: false,
              loginId: null,
              readOnly: false,
            },
          },
          {
            tenantId,
            role: "school_admin",
            name: body.name,
            phone: body.phone,
            classes: [],
            ...profileFields,
          },
        );
        const { ok: _ok, ...created } = registerResponseBody(result);
        return c.json(created);
      } catch (error) {
        const problem = teacherDbProblem(error);
        if (problem) throw problem;
        throw error;
      }
    },
  )
  .all("/school-admin", methodNotAllowed("POST"))
  .get(
    "/school-admins",
    listGuard,
    validate("query", schoolAdminsQuery),
    async (c) => {
      const { tenantId } = c.req.valid("query");

      const [{ data: teachers, error }, { data: tenant, error: tenantError }] =
        await Promise.all([
          c.var.supabaseAdmin
            .from("teachers")
            .select(
              "id, name, phone, landline, email, position, login_id, status, created_at, updated_at, deleted_at",
            )
            .eq("tenant_id", tenantId)
            .eq("role", "school_admin")
            .order("created_at", { ascending: false })
            .limit(SCHOOL_ADMIN_LIMIT),
          c.var.supabaseAdmin
            .from("tenants")
            .select("address")
            .eq("id", tenantId)
            .maybeSingle(),
        ]);
      if (error || tenantError) throw new Error("school admins read failed");

      return c.json({
        address: (tenant as { address: string | null } | null)?.address ?? null,
        items: ((teachers ?? []) as TeacherRow[]).map((row) => ({
          id: row.id,
          name: row.name,
          phone: row.phone,
          landline: row.landline,
          email: row.email,
          position: row.position,
          loginId: row.login_id,
          status: row.status,
          issuedAt: row.created_at,
          canceledAt: row.deleted_at,
        })),
      } satisfies SchoolAdminList);
    },
  )
  .all("/school-admins", methodNotAllowed("GET"));
