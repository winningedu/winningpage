// POST /api/console/org-info/confirm
//
// 내정보관리 최종확인(W17, 교 #230, #231). info_confirmed_at 을 한 번만 기록하고, 이후 기관 정보는
// 학교 관리자에게 조회 전용이다. 이미 확정됐는지는 UPDATE 조건(info_confirmed_at is null)으로 판정해
// 동시에 두 번 눌러도 한 번만 기록된다. 확정 시각과 등록자는 감사 로그에 남는다.
// 권한: 학교 관리자만(본사 대행은 본사 화면에서 고친다).

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { RpcError } from "../../_lib/console/teacherAccounts.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const ORG_INFO_RESOURCE_KEY = "console.org-info";

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "최종확인을 처리하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/org-info/confirm]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    if (actor.kind !== "school_admin") {
      sendError(
        res,
        "coded",
        403,
        "기관 정보는 본사 관리 화면에서 변경합니다.",
        "FORBIDDEN",
      );
      return;
    }
    const admin = ctx.supabaseAdmin;

    const confirmedAt = new Date().toISOString();
    const { data, error } = await admin
      .from("tenants")
      .update({ info_confirmed_at: confirmedAt })
      .eq("id", actor.tenantId)
      .is("info_confirmed_at", null)
      .select("id");
    if (error) throw new RpcError("tenants org info confirm", error.code);
    if (!data || data.length === 0) {
      sendError(
        res,
        "coded",
        409,
        "이미 최종확인이 끝났습니다.",
        "ALREADY_CONFIRMED",
      );
      return;
    }

    await writeConsoleAuditLog(
      {
        supabaseAdmin: admin,
        userId: ctx.userId,
        user: ctx.user,
        console: actor,
      },
      {
        action: "settings_change",
        resourceKey: ORG_INFO_RESOURCE_KEY,
        targetId: actor.tenantId,
        meta: { step: "confirm" },
      },
    );
    res.status(200).json({ ok: true, infoConfirmedAt: confirmedAt });
  },
});
