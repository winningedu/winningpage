// GET, POST /api/admin/learning-diagnosis/programs
//
// GET: 추천 프로그램 목록 { items }. POST: 등록(201).
// 권한: 메뉴 learningDiagnosis(GET view, POST edit).

import { collectionHandler } from "../../../_lib/learning-diagnosis/crud.js";
import { programBodySchema } from "../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default collectionHandler({
  table: "learning_diagnosis_programs",
  what: "추천 프로그램",
  createSchema: programBodySchema,
  toRow: (body) => body,
});
