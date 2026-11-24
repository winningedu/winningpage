// GET, POST /api/admin/learning-diagnosis/questions
//
// GET: 질문 목록 { items }. POST: 질문 등록(201).
// 권한: 메뉴 learningDiagnosis(GET view, POST edit).

import { defineHandler } from "../../../_lib/handler.js";
import { handleCollection } from "../../../_lib/learning-diagnosis/crud.js";
import { questionBodySchema } from "../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  auth: "admin",
  errorShape: "problem",
  permission: { key: "learningDiagnosis" },
  unhandledMessage: "학습진단 데이터를 처리하지 못했어요.",
  methods: ["GET", "POST"],
  logLabel: "[admin/learning-diagnosis/questions]",
  handler: (req, res, ctx) =>
    handleCollection(req, res, ctx, {
      table: "learning_diagnosis_questions",
      what: "질문",
      createSchema: questionBodySchema,
      toRow: (body) => body,
    }),
});
