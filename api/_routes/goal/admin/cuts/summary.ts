// GET /api/goal/admin/cuts/summary
//
// 목표관리 컷 현황 요약(GoalCutsOverviewBlock). 여섯 건수와 (대학, 학과) 조합 수를 서버에서 계산해 돌려준다.
// 6,600행짜리 옵션 뷰를 브라우저로 보내지 않는다. 메뉴 권한은 goalUniversityCuts(GET 은 view).

import { countCuts, fetchOptionRows } from "../../../../_lib/goal/cuts.js";
import { defineHandler } from "../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "컷 현황을 불러오지 못했습니다.",
  logLabel: "[goal/admin/cuts/summary]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const [total, active, normal, special, jungsi, missing] = await Promise.all(
      [
        countCuts(admin),
        countCuts(admin, (q) => q.eq("is_active", true)),
        countCuts(admin, (q) => q.eq("cut_type", "normal")),
        countCuts(admin, (q) => q.eq("cut_type", "special")),
        countCuts(admin, (q) => q.eq("cut_type", "jungsi")),
        countCuts(admin, (q) => q.is("avg_cut", null)),
      ],
    );
    const options = await fetchOptionRows(admin);
    res.status(200).json({
      total,
      active,
      normal,
      special,
      jungsi,
      missing,
      comboTotal: options.length,
      comboNoJungsi: options.filter((o) => !o.has_jungsi).length,
    });
  },
});
