// GET, POST /api/admin/learning-diagnosis/options
//
// GET: 답변 목록 { items }. POST: 답변 등록(201), 없는 질문은 404.
// 권한: 메뉴 learningDiagnosis(GET view, POST edit).

import { defineHandler } from "../../../_lib/handler.js";
import { handleCollection } from "../../../_lib/learning-diagnosis/crud.js";
import {
  optionCreateSchema,
  withOptionText,
} from "../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  auth: "admin",
  errorShape: "problem",
  permission: { key: "learningDiagnosis" },
  unhandledMessage: "학습진단 데이터를 처리하지 못했어요.",
  methods: ["GET", "POST"],
  logLabel: "[admin/learning-diagnosis/options]",
  handler: (req, res, ctx) =>
    handleCollection(req, res, ctx, {
      table: "learning_diagnosis_options",
      what: "답변",
      createSchema: optionCreateSchema,
      toRow: withOptionText,
    }),
});
