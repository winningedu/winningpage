// PATCH, DELETE /api/admin/learning-diagnosis/questions/:id
//
// PATCH: 질문 수정. DELETE: 질문 삭제(답변은 FK cascade 로 함께 지워진다). 닿은 행이 없으면 404.
// 권한: 메뉴 learningDiagnosis(edit).

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { handleItem } from "../../../../_lib/learning-diagnosis/crud.js";
import { questionBodySchema } from "../../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  auth: "admin",
  errorShape: "problem",
  permission: { key: "learningDiagnosis" },
  unhandledMessage: "학습진단 데이터를 처리하지 못했어요.",
  methods: ["PATCH", "DELETE"],
  logLabel: "[admin/learning-diagnosis/questions/id]",
  query: z.object({ id: z.uuid() }),
  handler: (req, res, ctx) =>
    handleItem(req, res, ctx, {
      table: "learning_diagnosis_questions",
      what: "질문",
      patchSchema: questionBodySchema,
      toRow: (body) => body,
    }),
});
