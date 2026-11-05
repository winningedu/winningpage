// GET /api/console/me
//
// 콘솔 셸이 처음 읽는 현재 사용자 정보(설계 5.2절). 역할, 기관, 교사, 담당 학급, 본사 대행 배너,
// 임시 비밀번호 상태를 돌려준다. 임시 비밀번호 상태의 교사도 읽어야 첫 비밀번호 화면으로 보낼 수 있다(allowMustChange).
// 권한: 로그인한 교사, 학교 관리자, 본사 대행.

import { RpcError } from "../_lib/console/teacherAccounts.js";
import { defineHandler } from "../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  allowMustChange: true,
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "내 정보를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/me]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("id, code, name")
      .eq("id", actor.tenantId)
      .maybeSingle();
    if (tenantError || !tenant)
      throw new RpcError("tenant read", tenantError?.code);

    let teacher: {
      id: string;
      loginId: string | null;
      name: string;
      role: string;
    } | null = null;
    if (actor.teacherId) {
      const { data, error } = await admin
        .from("teachers")
        .select("id, login_id, name, role")
        .eq("id", actor.teacherId)
        .maybeSingle();
      if (error || !data) throw new RpcError("teacher read", error?.code);
      teacher = {
        id: data.id,
        loginId: data.login_id,
        name: data.name,
        role: data.role,
      };
    }

    let proxySession: {
      id: string;
      tenantName: string;
      expiresAt: string;
    } | null = null;
    if (actor.proxySessionId) {
      const { data, error } = await admin
        .from("proxy_sessions")
        .select("id, expires_at")
        .eq("id", actor.proxySessionId)
        .maybeSingle();
      if (error || !data) throw new RpcError("proxy session read", error?.code);
      proxySession = {
        id: data.id,
        tenantName: tenant.name,
        expiresAt: data.expires_at,
      };
    }

    res.status(200).json({
      kind: actor.kind,
      tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
      teacher,
      classIds: actor.classIds,
      proxySession,
      mustChangePassword: actor.mustChangePassword,
    });
  },
});
