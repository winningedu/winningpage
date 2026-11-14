// GET /api/console/school-year
//
// 학년도 넘기기(W11)의 상태. 학교 관리자와 본사 대행만, 기관은 행위자에서 정한다.
// 넘기기 RPC 는 같은 학년도로 다시 부르면 0 만 돌려주므로, 이미 넘겼는지는 여기서 알려 준다(결정 32).
//   toYear     이번에 넘어갈 학년도. 달력의 학년도(3월 시작, KST)와 기관의 다음 학년도 중 이른 쪽이다.
//              RPC 가 한 해씩만 올리므로 두 해 이상 밀린 기관은 한 해씩 넘긴다(schoolYear.ts).
//   rolledOver 기관의 학년도가 이미 달력의 학년도면 true.
//   mode       rollover(학년 +1 과 졸업) 또는 midyear(학년은 두고 그룹, 반, 번호만). 서버가 정한다.
//   lastRollover 이번 학년도로 넘긴 마지막 기록(시각, 졸업과 진급 수). 아직이면 null.

import {
  gradeRank,
  loadTenant,
  readAll,
} from "../../_lib/console/directory.js";
import { rosterModeOf } from "../../_lib/console/schoolYear.js";
import { defineHandler } from "../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학년도 정보를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/school-year]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const { schoolYear, orgType } = await loadTenant(admin, actor.tenantId);
    const { mode, toYear } = rosterModeOf(schoolYear);

    const [enrollments, changes] = await Promise.all([
      readAll<{ grade: string | null }>(
        admin,
        "student_enrollments",
        "grade",
        (q) =>
          q
            .eq("tenant_id", actor.tenantId)
            .eq("school_year", schoolYear)
            .eq("status", "active"),
      ),
      readAll<{ to_grade: string | null; decided_at: string }>(
        admin,
        "enrollment_changes",
        "to_grade, decided_at",
        (q) =>
          q
            .eq("tenant_id", actor.tenantId)
            .eq("kind", "rollover")
            .eq("status", "applied")
            .eq("school_year", schoolYear),
      ),
    ]);

    const counts = new Map<string, number>();
    for (const e of enrollments) {
      if (e.grade) counts.set(e.grade, (counts.get(e.grade) ?? 0) + 1);
    }
    const gradeCounts = [...counts]
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade));

    const lastRollover =
      changes.length === 0
        ? null
        : {
            at: changes.reduce(
              (latest, c) => (c.decided_at > latest ? c.decided_at : latest),
              "",
            ),
            graduated: changes.filter((c) => c.to_grade === null).length,
            promoted: changes.filter((c) => c.to_grade !== null).length,
          };

    res.status(200).json({
      schoolYear,
      toYear,
      rolledOver: mode === "midyear",
      mode,
      gradeCounts,
      graduatingGrades: orgType === "학교" ? ["중3", "고3"] : ["고3"],
      lastRollover,
    });
  },
});
