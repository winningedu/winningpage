// GET /api/admin/tenants/school-admins?tenantId=
//
// 본사가 기관 관리 화면에서 그 기관의 학교 관리자 목록을 본다(사 #159, 결정 102.6). 담임은 빼고,
// 주소(기관 주소), 발급일, 등록취소일은 읽기 전용 값이다. 취소와 재발급은 본사 대행으로 하므로 쓰기 길은 없다.
// teachers 는 authenticated 에 막혀 있어 service_role 로 읽는다.
// 권한: 관리자 + 메뉴 tenants view 이상. 판정은 defineHandler 의 permission 옵션이 한다.

import { z } from "zod";
import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

const MAX_ADMINS = 200;

const querySchema = z.object({ tenantId: z.guid() });

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
  auth: "admin",
  errorShape: "problem",
  permission: { key: "tenants" },
  query: querySchema,
  unhandledMessage: "전체 관리자를 불러오지 못했습니다.",
  logLabel: "[admin/tenants/school-admins]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const { tenantId } = ctx.query;

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
    });
  },
});
