// POST /api/admin/selfeval-grant { profileId, sessionQuota, months? | endsAt? }
// Authorization: Bearer <supabase access token>   (관리자)
//
// 학생에게 자기평가서 이용권을 수동 부여한다. program_access_grants 에 admin 부여 행을 넣고
// fn_sync_program_access_cache 로 program_access 캐시를 맞춘 뒤 현재 회차 현황을 돌려준다.
// 컬럼 규칙은 api/_lib/selfeval/ops/grant.ts 상단 주석 참고.
//
// 응답 200 { ok, grantId, quota: { quotaTotal, quotaUsed, quotaRemaining, planEndsAt, planLabel } }
// 오류(coded): 400 INVALID_BODY, 400 NOT_STUDENT, 404 PROFILE_NOT_FOUND,
//   401/403 인증, 405 METHOD_NOT_ALLOWED, 500 INTERNAL
//
// 핸들러 본문은 테스트하지 않는다. 판단과 조립은 api/_lib/selfeval/ops/grant.ts.

import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  buildGrantRow,
  SELFEVAL_PROGRAM_KEY,
  validateGrantBody,
} from "../_lib/selfeval/ops/grant.js";
import {
  findProgramAccessRow,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서 이용권 부여에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "admin/selfeval-grant",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const parsed = validateGrantBody(req.body);
    if (!parsed.ok) {
      sendError(res, "coded", 400, parsed.reason, "INVALID_BODY", {
        ok: false,
      });
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
        "coded",
        404,
        "회원을 찾을 수 없습니다.",
        "PROFILE_NOT_FOUND",
        { ok: false },
      );
      return;
    }
    if (profile.member_type !== "student") {
      sendError(
        res,
        "coded",
        400,
        "학생 회원에게만 부여할 수 있습니다.",
        "NOT_STUDENT",
        { ok: false },
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
      p_program_key: SELFEVAL_PROGRAM_KEY,
    });
    if (syncError)
      throw new Error(
        `fn_sync_program_access_cache 실패: ${syncError.message}`,
      );

    const config = SERVICE_CONFIGS.selfeval;
    if (!config) throw new Error("SERVICE_CONFIGS.selfeval 가 없습니다.");
    const quota = await readQuotaSnapshot(
      db,
      body.profileId,
      await findProgramAccessRow(db, body.profileId, config),
    );

    res.status(200).json({ ok: true, grantId: inserted.id, quota });
  },
});

export const config = { runtime: "nodejs" };
