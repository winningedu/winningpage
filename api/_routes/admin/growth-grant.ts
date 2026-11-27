// POST /api/admin/growth-grant. 관리자 앱(api/_routes/admin/app.ts)이 .route("/growth-grant", growthGrant) 로 붙인다.
// 요청 검증과 응답 모양은 shared/growth-ops/contract.ts 를 따른다.
//
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

import {
  GROWTH_OPS_ERROR,
  type GrowthGrantResult,
  growthGrantBody,
} from "../../../shared/growth-ops/contract.js";
import {
  buildGrantRow,
  GROWTH_PROGRAM_KEY,
  validateGrantBody,
} from "../../_lib/growth/ops/grant.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  findProgramAccessRow,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../../_lib/serviceAccess.js";

const guard = admin({
  permission: { key: "growthReports" },
  unhandledMessage: "성장설계 이용권 부여에 실패했습니다.",
  logLabel: "admin/growth-grant",
});

export const growthGrant = adminFactory
  .createApp()
  // 모양만 거르고 값 규칙과 한국어 사유는 validateGrantBody 가 맡는다.
  // 정의되지 않은 키는 400 으로 막아 insert 에는 buildGrantRow 의 컬럼만 간다.
  .post("/", guard, validate("json", growthGrantBody), async (c) => {
    const parsed = validateGrantBody(c.req.valid("json"));
    if (!parsed.ok) {
      throw new ProblemError(400, parsed.reason, GROWTH_OPS_ERROR.INVALID_BODY);
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
        GROWTH_OPS_ERROR.PROFILE_NOT_FOUND,
      );
    }
    if (profile.member_type !== "student") {
      throw new ProblemError(
        400,
        "학생 회원에게만 부여할 수 있습니다.",
        GROWTH_OPS_ERROR.NOT_STUDENT,
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

    return c.json({ grantId: inserted.id, quota } satisfies GrowthGrantResult);
  })
  .all("/", methodNotAllowed("POST"));
