// PATCH, DELETE /api/admin/learning-diagnosis/questions/:id
//
// PATCH: 질문 수정. DELETE: 질문 삭제(답변은 FK cascade 로 함께 지워진다). 닿은 행이 없으면 404.
// 권한: 메뉴 learningDiagnosis(edit).

import { itemHandler } from "../../../../_lib/learning-diagnosis/crud.js";
import { questionBodySchema } from "../../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default itemHandler({
  table: "learning_diagnosis_questions",
  what: "질문",
  patchSchema: questionBodySchema,
  toRow: (body) => body,
});
