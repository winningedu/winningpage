// GET /api/cron/b2b-retention-purge, 기관(B2B) 보관 기간 정리 (매일 04:40 KST)
//
// 졸업한 지 2년이 지난 학생의 학적과 변경 이력, 2년이 지난 접근 로그, 1년이 지난 member_purge 로그를 지우고
// (설계 5.3 fn_purge_b2b_retention, 교 #138, 사 #163, #177), 계약 종료와 유예가 지난 기관의 학생 개인정보를
// 익명화한다(fn_anonymize_expired_b2b_members, 사 #162, #176, 설계 P23).
// 판단은 DB 함수가 하고 이 라우트는 부르기만 한다.
//
// 시각: 04:40 KST = 19:40 UTC (vercel.json crons "40 19 * * *").

import { defineHandler } from "../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "detail",
  authFailureMessage: "Unauthorized",
  unhandledMessage: "기관 보관 기간 정리 중 오류가 발생했습니다.",
  logLabel: "cron/b2b-retention-purge",
  handler: async (_req, res, ctx) => {
    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_purge_b2b_retention",
    );
    if (error) throw error;

    const purged = data?.[0];
    if (!purged) throw new Error("fn_purge_b2b_retention returned no row");

    const { data: anonymized, error: anonymizeError } =
      await ctx.supabaseAdmin.rpc("fn_anonymize_expired_b2b_members");
    if (anonymizeError) throw anonymizeError;
    const members = anonymized?.[0];
    if (!members)
      throw new Error("fn_anonymize_expired_b2b_members returned no row");

    const result = {
      enrollmentChangesDeleted: Number(purged.enrollment_changes_deleted),
      enrollmentsDeleted: Number(purged.enrollments_deleted),
      accessLogsDeleted: Number(purged.access_logs_deleted),
      membersAnonymized: Number(members.members_anonymized),
      membersProtected: Number(members.members_protected),
    };
    console.log(
      `cron/b2b-retention-purge 학적 이력 ${result.enrollmentChangesDeleted}건, 학적 ${result.enrollmentsDeleted}건, 접근 로그 ${result.accessLogsDeleted}건 삭제, 학생 ${result.membersAnonymized}명 익명화(유료 보호 ${result.membersProtected}명)`,
    );

    res.status(200).json({ ok: true, ...result });
  },
});
