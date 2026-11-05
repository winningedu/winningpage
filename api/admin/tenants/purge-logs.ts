// GET /api/admin/tenants/purge-logs[?tenantId=]
//
// 본사가 계약 종료 회원 삭제 로그를 조회한다(사 #163, #177). 실행 일시, 실행자(로그인 아이디, 본사 실행이면 이메일), 기관, 계약 종료일, 삭제 건수,
// 제외(유료 전환) 건수, 삭제한 회원번호 목록을 돌려주고 이름과 연락처는 담지 않는다. 1년이 지난 로그는
// fn_purge_b2b_retention 이 지운다. 파일 내려받기는 화면이 이 목록으로 만든다.
// 권한: 로그인 + HQ 권한 tenants view 이상(fn_admin_effective_permissions).

import { hasAdminViewPermission } from "../../_lib/console/proxy.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const TENANTS_RESOURCE_KEY = "tenants";
const MAX_LOGS = 200;

interface PurgeLogRow {
  id: string;
  created_at: string;
  actor_login_id: string | null;
  actor_email: string | null;
  tenant_id: string | null;
  meta: {
    contract_end_date?: string;
    deleted_count?: number;
    excluded_count?: number;
    member_ids?: string[];
  };
  tenants: { code: string; name: string } | null;
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "삭제 로그를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/tenants/purge-logs]",
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
    let query = ctx.supabaseAdmin
      .from("admin_access_logs")
      .select(
        "id, created_at, actor_login_id, actor_email, tenant_id, meta, tenants(code, name)",
      )
      .eq("action", "member_purge");
    if (typeof tenantId === "string" && tenantId !== "") {
      query = query.eq("tenant_id", tenantId);
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(MAX_LOGS);
    if (error) throw new Error("purge logs read failed");

    res.status(200).json({
      ok: true,
      logs: ((data ?? []) as unknown as PurgeLogRow[]).map((row) => ({
        id: row.id,
        executedAt: row.created_at,
        executedBy: row.actor_login_id ?? row.actor_email,
        tenant: row.tenants
          ? {
              id: row.tenant_id,
              code: row.tenants.code,
              name: row.tenants.name,
            }
          : null,
        contractEndDate: row.meta.contract_end_date ?? null,
        deletedCount: row.meta.deleted_count ?? 0,
        excludedCount: row.meta.excluded_count ?? 0,
        memberIds: row.meta.member_ids ?? [],
      })),
    });
  },
});
