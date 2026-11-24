// GET /api/goal/admin/cuts/jungsi-missing
//
// 정시 컷이 없는 (대학, 학과) 조합. 엑셀 정시 템플릿 다운로드가 id 빈 행으로 내려받는다.
// 대학명과 학과명은 뷰의 문자열을 그대로 준다: 관리자가 손으로 타이핑하면 완전일치 조회가 깨져
// 그 학생의 정시 확률이 계속 미산출로 남는다.

import { fetchOptionRows } from "../../../../_lib/goal/cuts.js";
import { defineHandler } from "../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "정시 컷 없는 조합을 불러오지 못했습니다.",
  logLabel: "[goal/admin/cuts/jungsi-missing]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const options = await fetchOptionRows(ctx.supabaseAdmin);
    res.status(200).json({
      items: options
        .filter((o) => !o.has_jungsi)
        .map((o) => ({
          university_name: o.university_name,
          department_name: o.department_name,
        })),
    });
  },
});
