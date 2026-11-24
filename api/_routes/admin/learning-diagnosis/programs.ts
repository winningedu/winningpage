// GET, POST /api/admin/learning-diagnosis/programs
//
// GET: 추천 프로그램 목록 { items }. POST: 등록(201).
// 권한: 메뉴 learningDiagnosis(GET view, POST edit).

import { defineHandler } from "../../../_lib/handler.js";
import { handleCollection } from "../../../_lib/learning-diagnosis/crud.js";
import { programBodySchema } from "../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  auth: "admin",
  errorShape: "problem",
  permission: { key: "learningDiagnosis" },
  unhandledMessage: "학습진단 데이터를 처리하지 못했어요.",
  methods: ["GET", "POST"],
  logLabel: "[admin/learning-diagnosis/programs]",
  handler: (req, res, ctx) =>
    handleCollection(req, res, ctx, {
      table: "learning_diagnosis_programs",
      what: "추천 프로그램",
      createSchema: programBodySchema,
      toRow: (body) => body,
    }),
});
