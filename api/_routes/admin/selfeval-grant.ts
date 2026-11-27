// /api/admin/selfeval-grant. 관리자 앱(api/_routes/admin/app.ts)이 .route("/selfeval-grant", selfevalGrant) 로 붙인다.
// 요청 검증과 응답 모양은 shared/selfeval-ops/contract.ts 를 따른다.
//
// POST /api/admin/selfeval-grant { profileId, sessionQuota, months? | endsAt? }
// Authorization: Bearer <supabase access token>   (관리자)
//
// 학생에게 자기평가서 이용권을 수동 부여한다. program_access_grants 에 admin 부여 행을 넣고
// fn_sync_program_access_cache 로 program_access 캐시를 맞춘 뒤 현재 회차 현황을 돌려준다.
// 컬럼 규칙은 api/_lib/selfeval/ops/grant.ts 상단 주석 참고.
//
// 권한: 메뉴 selfevalSessions(POST edit).
//
// 응답 200 { grantId, quota: { quotaTotal, quotaUsed, quotaRemaining, planEndsAt, planLabel } }
// 오류(problem): 400 VALIDATION_FAILED, 400 INVALID_BODY, 400 NOT_STUDENT, 404 PROFILE_NOT_FOUND,
//   401/403 인증, 405 METHOD_NOT_ALLOWED, 500
//
// 본문은 zod 가 모양을 보고 모르는 키를 버린다. 값 규칙은 validateGrantBody 가 맡고 insert 는 buildGrantRow 의 컬럼만 쓴다.
// 멱등 키는 아직 없다(후속 PR). 판단과 조립은 api/_lib/selfeval/ops/grant.ts.

import {
  SELFEVAL_OPS_ERROR,
  type SelfevalGrantResult,
  selfevalGrantBody,
} from "../../../shared/selfeval-ops/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  buildGrantRow,
  SELFEVAL_PROGRAM_KEY,
  validateGrantBody,
} from "../../_lib/selfeval/ops/grant.js";
import {
  findProgramAccessRow,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../../_lib/serviceAccess.js";

const guard = admin({
  permission: { key: "selfevalSessions" },
  unhandledMessage: "자기평가서 이용권 부여에 실패했습니다.",
  logLabel: "admin/selfeval-grant",
});

export const selfevalGrant = adminFactory
  .createApp()
  .post("/", guard, validate("json", selfevalGrantBody), async (c) => {
    const parsed = validateGrantBody(c.req.valid("json"));
    if (!parsed.ok) {
      throw new ProblemError(
        400,
        parsed.reason,
        SELFEVAL_OPS_ERROR.INVALID_BODY,
      );
    }
    const { body } = parsed;
    const db = c.var.supabaseAdmin;
    const actorId = c.var.userId;
    if (!actorId) throw new Error("관리자 id 가 없습니다.");

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, member_type")
      .eq("id", body.profileId)
      .maybeSingle();
    if (profileError)
      throw new Error(`profiles 조회 실패: ${profileError.message}`);
    if (!profile) {
      throw new ProblemError(
        404,
        "회원을 찾을 수 없습니다.",
        SELFEVAL_OPS_ERROR.PROFILE_NOT_FOUND,
      );
    }
    if (profile.member_type !== "student") {
      throw new ProblemError(
        400,
        "학생 회원에게만 부여할 수 있습니다.",
        SELFEVAL_OPS_ERROR.NOT_STUDENT,
      );
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

    return c.json({
      grantId: inserted.id,
      quota,
    } satisfies SelfevalGrantResult);
  })
  .all("/", methodNotAllowed("POST"));
