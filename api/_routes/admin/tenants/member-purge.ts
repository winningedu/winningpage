// POST /api/admin/tenants/member-purge  { tenantId, targetIds }
//
// 본사 관리자가 계약 종료 기관 하나의 학생 개인정보 삭제(익명화)를 수동으로 실행한다(사 #162, #176).
// 크론은 하지 않는다. 유예 종료일이 지나지 않았으면 409 NOT_YET 과 그 날짜를 돌려주고, 유료 전환 학생은
// 제외한다. 본사가 미리보기에서 고른 targetIds 만 지우고(필수), 목록 밖 학생은 지우지 않고 skipped 로 센다. 판단과 member_purge 로그는 fn_anonymize_expired_b2b_members 가 하고, 로그의 실행자는 이 관리자다.
// 권한: 관리자 + 메뉴 memberPurge(tenants 별칭) edit. 판정과 QA 계정 쓰기 차단은 defineHandler 가 한다.

import { z } from "zod";
import { getBearerToken } from "../../../_lib/adminAuth.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import { isSchoolmentorSite } from "../../../_lib/site.js";

export const config = { runtime: "nodejs" };

const MAX_TARGETS = 5000;

// 지울 학생 번호 목록. 1명 이상 5,000명 이하, 모두 uuid 이고 겹치지 않아야 한다.
const bodySchema = z.object({
  tenantId: z.guid().transform((value) => value.toLowerCase()),
  targetIds: z
    .array(z.guid().transform((value) => value.toLowerCase()))
    .min(1)
    .max(MAX_TARGETS)
    .refine((ids) => new Set(ids).size === ids.length),
});

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "memberPurge" },
  body: bodySchema,
  // fn_anonymize_expired_b2b_members 가 member_purge 행을 직접 남긴다.
  audit: false,
  unhandledMessage: "계약 종료 회원 삭제를 하지 못했습니다.",
  logLabel: "[admin/tenants/member-purge]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      sendError(res, "problem", 404, "찾을 수 없어요.", "NOT_FOUND");
      return;
    }
    const userId = ctx.userId as string;
    const { tenantId, targetIds } = ctx.body;

    // 실행자 이메일은 로그에 남긴다. auth:"admin" 은 user 를 싣지 않아 토큰으로 다시 읽는다.
    const { data: authData } = await ctx.supabaseAdmin.auth.getUser(
      getBearerToken(req),
    );

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_anonymize_expired_b2b_members",
      {
        p_tenant: tenantId,
        p_actor_profile: userId,
        p_actor_email: authData.user?.email ?? undefined,
        p_targets: targetIds,
      },
    );
    if (error) throw new Error("member purge failed");
    const result = data?.[0];
    if (!result) throw new Error("fn_anonymize_expired_b2b_members no row");

    if (result.not_yet) {
      sendError(
        res,
        "problem",
        409,
        "아직 삭제할 수 없는 기관입니다. 유예 종료일 다음 날부터 삭제할 수 있습니다.",
        "NOT_YET",
        { graceEndsOn: result.grace_end },
      );
      return;
    }

    res.status(200).json({
      deleted: Number(result.members_anonymized),
      excluded: Number(result.members_protected),
      skipped: Number(result.members_skipped),
      notProcessed: Number(result.not_processed),
    });
  },
});
