// GET /api/admin/tenants/school-admins?tenantId=
//
// 본사가 기관 관리 화면에서 그 기관의 학교 관리자 목록을 본다(사 #159, 결정 102.6). 담임은 빼고,
// 주소(기관 주소), 발급일, 등록취소일은 읽기 전용 값이다. 취소와 재발급은 본사 대행으로 하므로 쓰기 길은 없다.
// teachers 는 authenticated 에 막혀 있어 service_role 로 읽는다.
// 권한: 로그인 + HQ 권한 tenants view 이상(fn_admin_effective_permissions).

import { hasAdminViewPermission } from "../../_lib/console/proxy.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { isUuid } from "../../_lib/service-credit/adjust.js";

export const config = { runtime: "nodejs" };

const TENANTS_RESOURCE_KEY = "tenants";
const MAX_ADMINS = 200;

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

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학교 관리자를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/tenants/school-admins]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (
      !(await hasAdminViewPermission(
        ctx.supabaseAdmin,
        ctx.userId as string,
        TENANTS_RESOURCE_KEY,
      ))
    ) {
      sendError(res, "coded", 403, "기관 관리 권한이 없습니다.", "FORBIDDEN");
      return;
    }

    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !isUuid(tenantId)) {
      sendError(res, "coded", 400, "기관을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const [{ data: teachers, error }, { data: tenant, error: tenantError }] =
      await Promise.all([
        ctx.supabaseAdmin
          .from("teachers")
          .select(
            "id, name, phone, landline, email, position, login_id, status, created_at, updated_at, deleted_at",
          )
          .eq("tenant_id", tenantId)
          .eq("role", "school_admin")
          .order("created_at", { ascending: false })
          .limit(MAX_ADMINS),
        ctx.supabaseAdmin
          .from("tenants")
          .select("address")
          .eq("id", tenantId)
          .maybeSingle(),
      ]);
    if (error || tenantError) throw new Error("school admins read failed");

    res.status(200).json({
      ok: true,
      address: (tenant as { address: string | null } | null)?.address ?? null,
      admins: ((teachers ?? []) as TeacherRow[]).map((row) => ({
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
    });
  },
});
