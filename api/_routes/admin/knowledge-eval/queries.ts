// GET, POST /api/admin/knowledge-eval/queries
//
// 기준 문제집(knowledge_golden_queries) 목록과 질의 추가.
// GET ?knowledgeType=  그 유형의 질의 전부(활성 먼저, 오래된 순). 200 { items }
// POST { knowledge_type, grade, subject, career, selected_topic, assessment_info, note, expected_resource_ids }
//   201 만든 행. 폼에 없는 열(id, is_active, created_by 등)은 400 이다.
// 오류(problem): 400 VALIDATION_FAILED, 401/403, 405, 500
// 권한: 메뉴 knowledgeEvals(GET view, POST edit).
// 쓰기 경계: 옛 RLS 는 is_admin 전체라 화면이 쓰던 insert 와 update 만 연다. delete 는 없다(비활성으로 갈음).
// 수정은 queries/[id].ts. 계약 검증은 queries.test.ts.

import { z } from "zod";
import { defineHandler, parseOrReject } from "../../../_lib/handler.js";
import {
  GOLDEN_COLUMNS,
  goldenCreateSchema,
  goldenKnowledgeTypeSchema,
} from "../../../_lib/knowledge/eval/golden.js";

const listQuerySchema = z.object({ knowledgeType: goldenKnowledgeTypeSchema });

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "knowledgeEvals" },
  unhandledMessage: "기준 문제집을 처리하지 못했어요.",
  logLabel: "admin/knowledge-eval/queries",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const db = ctx.supabaseAdmin;

    if (req.method === "POST") {
      const parsed = parseOrReject(
        res,
        "problem",
        goldenCreateSchema,
        req.body,
      );
      if (!parsed) return;
      const { data, error } = await db
        .from("knowledge_golden_queries")
        .insert(parsed.value as z.infer<typeof goldenCreateSchema>)
        .select(GOLDEN_COLUMNS)
        .single();
      if (error) throw new Error(`질의 저장 실패: ${error.message}`);
      res.status(201).json(data);
      return;
    }

    const parsed = parseOrReject(res, "problem", listQuerySchema, req.query);
    if (!parsed) return;
    const { knowledgeType } = parsed.value as z.infer<typeof listQuerySchema>;
    const { data, error } = await db
      .from("knowledge_golden_queries")
      .select(GOLDEN_COLUMNS)
      .eq("knowledge_type", knowledgeType)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(`문제집 조회 실패: ${error.message}`);
    res.status(200).json({ items: data ?? [] });
  },
});
