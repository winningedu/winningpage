// PATCH, DELETE /api/admin/learning-diagnosis/options/:id
//
// PATCH: 답변 수정(question_id 는 쓰지 않는다). DELETE: 답변 삭제. 닿은 행이 없으면 404.
// 권한: 메뉴 learningDiagnosis(edit).

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { handleItem } from "../../../../_lib/learning-diagnosis/crud.js";
import {
  optionPatchSchema,
  withOptionText,
} from "../../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  auth: "admin",
  errorShape: "problem",
  permission: { key: "learningDiagnosis" },
  unhandledMessage: "학습진단 데이터를 처리하지 못했어요.",
  methods: ["PATCH", "DELETE"],
  logLabel: "[admin/learning-diagnosis/options/id]",
  query: z.object({ id: z.uuid() }),
  handler: (req, res, ctx) =>
    handleItem(req, res, ctx, {
      table: "learning_diagnosis_options",
      what: "답변",
      patchSchema: optionPatchSchema,
      toRow: withOptionText,
    }),
});
