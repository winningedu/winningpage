// GET, POST /api/admin/learning-diagnosis/questions
//
// GET: 질문 목록 { items }. POST: 질문 등록(201).
// 권한: 메뉴 learningDiagnosis(GET view, POST edit).

import { collectionHandler } from "../../../_lib/learning-diagnosis/crud.js";
import { questionBodySchema } from "../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default collectionHandler({
  table: "learning_diagnosis_questions",
  what: "질문",
  createSchema: questionBodySchema,
  toRow: (body) => body,
});
