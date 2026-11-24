// PATCH, DELETE /api/admin/learning-diagnosis/options/:id
//
// PATCH: 답변 수정(question_id 는 쓰지 않는다). DELETE: 답변 삭제. 닿은 행이 없으면 404.
// 권한: 메뉴 learningDiagnosis(edit).

import { itemHandler } from "../../../../_lib/learning-diagnosis/crud.js";
import {
  optionPatchSchema,
  withOptionText,
} from "../../../../_lib/learning-diagnosis/schemas.js";

export const config = { runtime: "nodejs" };

export default itemHandler({
  table: "learning_diagnosis_options",
  what: "답변",
  patchSchema: optionPatchSchema,
  toRow: withOptionText,
});
