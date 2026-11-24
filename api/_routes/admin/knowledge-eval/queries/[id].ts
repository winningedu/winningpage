// PATCH /api/admin/knowledge-eval/queries/:id?knowledgeType=
//
// 기준 문제집 질의 수정과 비활성 토글. 본문은 폼 필드(knowledge_type 제외) 중 일부와 is_active 이고
// 키는 하나 이상이다. knowledge_type 은 쓰지 않는다(질의를 다른 유형으로 옮기지 않는다).
// knowledgeType 쿼리로 범위를 좁힌다: 옛 화면은 고른 유형의 질의만 보이고 고쳤으므로 다른 유형 행은 404 다.
// 200 고쳐진 행. 오류(problem): 400 VALIDATION_FAILED, 404 NOT_FOUND, 401/403, 405, 500
// 권한: 메뉴 knowledgeEvals 의 edit. 삭제는 없다(옛 화면도 비활성으로 갈음).
// 계약 검증은 [id].test.ts.

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";
import {
  GOLDEN_COLUMNS,
  goldenKnowledgeTypeSchema,
  goldenPatchSchema,
} from "../../../../_lib/knowledge/eval/golden.js";

export default defineHandler({
  methods: ["PATCH"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "knowledgeEvals" },
  unhandledMessage: "질의를 고치지 못했어요.",
  logLabel: "admin/knowledge-eval/queries/id",
  headers: { "Cache-Control": "no-store" },
  query: z.object({ id: z.uuid(), knowledgeType: goldenKnowledgeTypeSchema }),
  body: goldenPatchSchema,
  handler: async (_req, res, ctx) => {
    const { id, knowledgeType } = ctx.query;
    const { data, error } = await ctx.supabaseAdmin
      .from("knowledge_golden_queries")
      .update(ctx.body)
      .eq("id", id)
      .eq("knowledge_type", knowledgeType)
      .select(GOLDEN_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`질의 수정 실패: ${error.message}`);
    if (!data) {
      sendError(res, "problem", 404, "질의를 찾지 못했어요.", "NOT_FOUND");
      return;
    }
    res.status(200).json(data);
  },
});
