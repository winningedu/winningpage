// POST /api/diagnosis/access
// Authorization: Bearer <access_token>
//
// 학습진단 진입 판정 — 읽기 전용. check-service-access.ts와 같은 성격의 엔드포인트지만
// 학습진단은 "회원가입 시 1회 무료" 축이 이용권(program_access/program_access_grants)
// 판정과 별도로 존재한다(supabase/migrations/20260821000005_diagnosis_gating.sql).
// 그래서 이 파일은 두 판정을 합쳐 allowed 하나로 낸다.
//
// 응답 규격
//   200 {
//     allowed: boolean,            — freeAvailable || (이용권 allowed && 회차 남음)
//     freeAvailable: boolean,      — 무료 1회 미사용 여부(diagnosis_attempts에 kind='free' 행 없음)
//     quotaRemaining: int|null,    — 이용권 잔여 회차. null이면 무제한(0이 아니다).
//     quotaTotal: int|null,
//     planEndsAt: string|null,
//   }
//   401 { detail }                — 토큰 없음/무효.
//   405 { detail }                — POST 아님.
//   500 { detail }                — 서버 설정 누락 등 예외.
//
// ⚠️ 이 응답은 안내용이다. 실제 차단 권위는 api/diagnosis/consume.ts가 부르는
//    consume_diagnosis_attempt RPC 하나뿐이다(check-service-access.ts와 동일 원칙).
//    프런트(diagnosisAccess.ts)는 네트워크/5xx 실패를 fail-open으로 처리한다 —
//    이 라우트는 그 계약을 흔들지 않고 그냥 실패를 그대로 던진다.

import { defineHandler, requireUserId } from "../../_lib/handler.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../../_lib/serviceAccess.js";
import { isSchoolmentorSite } from "../../_lib/site.js";
import { readTenantQuota, readTenantUsage } from "../../_lib/tenantUsage.js";

const DIAGNOSE_CONFIG = SERVICE_CONFIGS.diagnose!;

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "detail",
  unhandledMessage: "학습진단 이용 가능 여부 확인 중 오류가 발생했습니다.",
  logLabel: "diagnosis/access",
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);

    // 스쿨멘토: 무료 1회 없이 기관 설정만 따른다. 이 라우트는 시작 지점이라 한도(month_cap,
    // term_cap)도 여기서 막는다. tenantReason 은 거부 사유다(catch_all, disabled, outside_period,
    // grace, month_cap, term_cap). 읽지 못하면 열지 않는다(500).
    if (isSchoolmentorSite()) {
      const tenant = await readTenantUsage(
        ctx.supabaseAdmin,
        userId,
        "diagnose",
      );
      const quota = readTenantQuota(tenant);
      res.status(200).json({
        allowed: tenant.allowed,
        freeAvailable: false,
        quotaRemaining: quota.quotaRemaining,
        quotaTotal: quota.quotaTotal,
        planEndsAt: quota.planEndsAt,
        tenantReason: tenant.denyReason,
      });
      return;
    }

    // 무료 1회 판정 — diagnosis_attempts에 kind='free' 행이 있으면 이미 썼다는 뜻이다
    // (부분 유니크 인덱스가 프로필당 1행을 보장한다). service role로 직접 조회한다 —
    // 이 테이블은 쓰기 정책이 consume RPC 경유뿐이라 읽기도 여기서 admin 클라이언트로 한다.
    const { data: freeAttempt, error: freeError } = await ctx.supabaseAdmin
      .from("diagnosis_attempts")
      .select("id")
      .eq("profile_id", userId)
      .eq("kind", "free")
      .limit(1)
      .maybeSingle();

    if (freeError) {
      // 판정 불가 — fail-closed(freeAvailable=false)로 두고 아래 이용권 판정에 맡긴다.
      // 이 라우트 전체를 죽이면 프런트가 fail-open으로 흡수해 버려 무료 오판정이
      // "진입 허용"으로 새는 것보다는, 여기서 무료를 보수적으로 접고 이용권 유무로
      // 판가름 나는 편이 낫다.
      console.error(
        "diagnosis/access 무료 사용 이력 조회 실패:",
        userId,
        freeError,
      );
    }
    const freeAvailable = !freeError && !freeAttempt;

    const { allowed: entitlementAllowed } = await hasPaidServiceAccess(
      ctx.supabaseAdmin,
      userId,
      DIAGNOSE_CONFIG,
    );

    let quota = await readQuotaSnapshot(ctx.supabaseAdmin, userId, null);
    try {
      const accessRow = await findProgramAccessRow(
        ctx.supabaseAdmin,
        userId,
        DIAGNOSE_CONFIG,
      );
      quota = await readQuotaSnapshot(ctx.supabaseAdmin, userId, accessRow);
    } catch (quotaError) {
      console.error("diagnosis/access quota lookup 실패(무시):", quotaError);
    }

    const hasQuotaLeft =
      quota.quotaRemaining === null || quota.quotaRemaining > 0;
    const allowed = freeAvailable || (entitlementAllowed && hasQuotaLeft);

    res.status(200).json({
      allowed,
      freeAvailable,
      quotaRemaining: quota.quotaRemaining,
      quotaTotal: quota.quotaTotal,
      planEndsAt: quota.planEndsAt,
    });
  },
});
