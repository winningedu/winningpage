// GET, POST /api/admin/learning-diagnosis/options
//
// GET: 답변 목록 { items }. POST: 답변 등록(201), 없는 질문은 404.
// 권한: 메뉴 learningDiagnosis(GET view, POST edit).

import { collectionHandler } from "../../../_lib/learning-diagnosis/crud.js";
import {
  optionCreateSchema,
  withOptionText,
} from "../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default collectionHandler({
  table: "learning_diagnosis_options",
  what: "답변",
  createSchema: optionCreateSchema,
  toRow: withOptionText,
});
