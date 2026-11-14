// POST /api/console/org-info/confirm
//
// 내정보관리 최종확인(W17, 교 #230, #231). info_confirmed_at 을 한 번만 기록하고, 이후 기관 정보는
// 학교 관리자에게 조회 전용이다. 이미 확정됐는지는 UPDATE 조건(info_confirmed_at is null)으로 판정해
// 동시에 두 번 눌러도 한 번만 기록된다. 확정 시각과 등록자는 감사 로그에 남는다.
// 확정은 관리자가 검토한 내용에만 건다. 요청은 화면이 그린 기관 id(tenantId)와 마지막으로 본 갱신 시각(updatedAt,
// org-info GET, PATCH 가 돌려준 tenants.updated_at)을 싣고, 시각이 UPDATE 조건에 들어가 그 사이 본사 대행이 고친
// 값은 확정되지 않는다(409 INFO_CHANGED). 기관 id 가 세션 기관과 다르면 409 SESSION_CHANGED.
// 권한: 학교 관리자만(본사 대행은 본사 화면에서 고친다).

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import { RpcError } from "../../../_lib/console/teacherAccounts.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

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
  handler: async (req, res, ctx) => {
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
    const { tenantId, updatedAt } = (req.body ?? {}) as Record<string, unknown>;
    if (
      typeof tenantId !== "string" ||
      tenantId === "" ||
      typeof updatedAt !== "string" ||
      updatedAt === ""
    ) {
      sendError(res, "coded", 400, "입력 항목을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    if (tenantId !== actor.tenantId) {
      sendError(
        res,
        "coded",
        409,
        "기관이 바뀌었어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
        "SESSION_CHANGED",
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
      .eq("updated_at", updatedAt)
      .select("id");
    if (error) throw new RpcError("tenants org info confirm", error.code);
    if (!data || data.length === 0) {
      // 이미 확정됐는지, 검토한 뒤 값이 바뀌었는지를 가른다.
      const { data: current, error: readError } = await admin
        .from("tenants")
        .select("info_confirmed_at")
        .eq("id", actor.tenantId)
        .maybeSingle();
      if (readError || !current) {
        throw new RpcError("tenants org info read", readError?.code);
      }
      if (!current.info_confirmed_at) {
        sendError(
          res,
          "coded",
          409,
          "그사이 기관 정보가 바뀌었어요. 내용을 다시 확인해 주세요.",
          "INFO_CHANGED",
        );
        return;
      }
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
