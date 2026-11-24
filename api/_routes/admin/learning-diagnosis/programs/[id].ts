// PATCH, DELETE /api/admin/learning-diagnosis/programs/:id
//
// PATCH: 추천 프로그램 수정. DELETE: 삭제. 닿은 행이 없으면 404.
// 권한: 메뉴 learningDiagnosis(edit).

import { itemHandler } from "../../../../_lib/learning-diagnosis/crud.js";
import { programBodySchema } from "../../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default itemHandler({
  table: "learning_diagnosis_programs",
  what: "추천 프로그램",
  patchSchema: programBodySchema,
  toRow: (body) => body,
});
