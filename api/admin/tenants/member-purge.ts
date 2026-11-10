// POST /api/admin/tenants/member-purge  { tenantId, targetIds }
//
// 본사 관리자가 계약 종료 기관 하나의 학생 개인정보 삭제(익명화)를 수동으로 실행한다(사 #162, #176).
// 크론은 하지 않는다. 유예 종료일이 지나지 않았으면 409 NOT_YET 과 그 날짜를 돌려주고, 유료 전환 학생은
// 제외한다. 본사가 미리보기에서 고른 targetIds 만 지우고(필수), 목록 밖 학생은 지우지 않고 skipped 로 센다. 판단과 member_purge 로그는 fn_anonymize_expired_b2b_members 가 하고, 로그의 실행자는 이 관리자다.
// 권한: 로그인 + HQ 권한 tenants edit(fn_admin_effective_permissions).

import { hasAdminEditPermission } from "../../_lib/console/proxy.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { assertQaAdminMayWrite } from "../../_lib/qaAccount.js";
import { isUuid } from "../../_lib/service-credit/adjust.js";
import { isSchoolmentorSite } from "../../_lib/site.js";

export const config = { runtime: "nodejs" };

const TENANTS_RESOURCE_KEY = "tenants";
const MAX_TARGETS = 5000;

// 지울 학생 번호 목록. 1명 이상 5,000명 이하, 모두 uuid 이고 겹치지 않아야 한다. 아니면 null.
function parseTargetIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0 || value.length > MAX_TARGETS) return null;
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isUuid(item)) return null;
    ids.push(item.trim().toLowerCase());
  }
  return new Set(ids).size === ids.length ? ids : null;
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "계약 종료 회원 삭제를 하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/tenants/member-purge]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      sendError(res, "coded", 404, "찾을 수 없어요.", "NOT_FOUND");
      return;
    }
    const userId = ctx.userId as string;
    if (
      !(await hasAdminEditPermission(
        ctx.supabaseAdmin,
        userId,
        TENANTS_RESOURCE_KEY,
      ))
    ) {
      sendError(res, "coded", 403, "기관 관리 권한이 없습니다.", "FORBIDDEN");
      return;
    }

    await assertQaAdminMayWrite(ctx.supabaseAdmin, userId);

    const body = req.body as
      | { tenantId?: unknown; targetIds?: unknown }
      | undefined;
    const tenantId = body?.tenantId;
    if (typeof tenantId !== "string" || !isUuid(tenantId)) {
      sendError(res, "coded", 400, "기관을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const targetIds = parseTargetIds(body?.targetIds);
    if (!targetIds) {
      sendError(
        res,
        "coded",
        400,
        "삭제할 학생을 1명 이상 5,000명 이하로 골라 주세요.",
        "BAD_REQUEST",
      );
      return;
    }

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_anonymize_expired_b2b_members",
      {
        p_tenant: tenantId.trim().toLowerCase(),
        p_actor_profile: userId,
        p_actor_email: ctx.user?.email ?? undefined,
        p_targets: targetIds,
      },
    );
    if (error) throw new Error("member purge failed");
    const result = data?.[0];
    if (!result) throw new Error("fn_anonymize_expired_b2b_members no row");

    if (result.not_yet) {
      sendError(
        res,
        "coded",
        409,
        "아직 삭제할 수 없는 기관입니다. 유예 종료일 다음 날부터 삭제할 수 있습니다.",
        "NOT_YET",
        { graceEndsOn: result.grace_end },
      );
      return;
    }

    res.status(200).json({
      ok: true,
      deleted: Number(result.members_anonymized),
      excluded: Number(result.members_protected),
      skipped: Number(result.members_skipped),
      notProcessed: Number(result.not_processed),
    });
  },
});
