// POST /api/admin/growth-grant { profileId, sessionQuota, months? | endsAt? }
// Authorization: Bearer <supabase access token>   (관리자)
//
// 학생에게 성장설계 이용권을 수동 부여한다. program_access_grants 에 admin 부여 행을 넣고
// fn_sync_program_access_cache 로 program_access 캐시를 맞춘 뒤 현재 회차 현황을 돌려준다.
// 컬럼 규칙은 api/_lib/growth/ops/grant.ts 상단 주석 참고.
//
// 응답 200 { grantId, quota: { quotaTotal, quotaUsed, quotaRemaining, planEndsAt, planLabel } }
// 오류(problem): 400 VALIDATION_FAILED(모양, 정의되지 않은 키), 400 INVALID_BODY(값 규칙),
//   400 NOT_STUDENT, 404 PROFILE_NOT_FOUND, 401/403 인증, 405 METHOD_NOT_ALLOWED, 500 INTERNAL_ERROR
// 권한: 메뉴 growthReports edit.
//
// 판단과 조립은 api/_lib/growth/ops/grant.ts.

import { z } from "zod";
import {
  buildGrantRow,
  GROWTH_PROGRAM_KEY,
  validateGrantBody,
} from "../../_lib/growth/ops/grant.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import {
  findProgramAccessRow,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../../_lib/serviceAccess.js";

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "growthReports" },
  methodNotAllowedMessage: "POST만 허용됩니다.",
  unhandledMessage: "성장설계 이용권 부여에 실패했습니다.",
  logLabel: "admin/growth-grant",
  headers: { "Cache-Control": "no-store" },
  // 모양만 거르고 값 규칙과 한국어 사유는 validateGrantBody 가 맡는다.
  // 정의되지 않은 키는 400 으로 막아 insert 에는 buildGrantRow 의 컬럼만 간다.
  body: z
    .object({
      profileId: z.string(),
      sessionQuota: z.number(),
      months: z.number().nullish(),
      endsAt: z.string().nullish(),
    })
    .strict(),
  handler: async (_req, res, ctx) => {
    const parsed = validateGrantBody(ctx.body);
    if (!parsed.ok) {
      sendError(res, "problem", 400, parsed.reason, "INVALID_BODY");
      return;
    }
    const { body } = parsed;
    const db = ctx.supabaseAdmin;
    const actorId = ctx.admin?.userId;
    if (!actorId) throw new Error("ctx.admin 이 없습니다.");

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, member_type")
      .eq("id", body.profileId)
      .maybeSingle();
    if (profileError)
      throw new Error(`profiles 조회 실패: ${profileError.message}`);
    if (!profile) {
      sendError(
        res,
        "problem",
        404,
        "회원을 찾을 수 없습니다.",
        "PROFILE_NOT_FOUND",
      );
      return;
    }
    if (profile.member_type !== "student") {
      sendError(
        res,
        "problem",
        400,
        "학생 회원에게만 부여할 수 있습니다.",
        "NOT_STUDENT",
      );
      return;
    }

    const row = buildGrantRow(body, actorId, new Date().toISOString());
    const { data: inserted, error: insertError } = await db
      .from("program_access_grants")
      .insert(row)
      .select("id")
      .single();
    if (insertError)
      throw new Error(
        `program_access_grants 부여 실패: ${insertError.message}`,
      );

    const { error: syncError } = await db.rpc("fn_sync_program_access_cache", {
      p_profile_id: body.profileId,
      p_program_key: GROWTH_PROGRAM_KEY,
    });
    if (syncError)
      throw new Error(
        `fn_sync_program_access_cache 실패: ${syncError.message}`,
      );

    const config = SERVICE_CONFIGS.growth;
    if (!config) throw new Error("SERVICE_CONFIGS.growth 가 없습니다.");
    const quota = await readQuotaSnapshot(
      db,
      body.profileId,
      await findProgramAccessRow(db, body.profileId, config),
    );

    res.status(200).json({ grantId: inserted.id, quota });
  },
});

export const config = { runtime: "nodejs" };
