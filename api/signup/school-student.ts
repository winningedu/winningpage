// POST /api/signup/school-student
//
// 스쿨멘토 학생 가입 확정. 위닝 배포에서는 404.

import { defineHandler } from "../_lib/handler.js";
import { parseSchoolStudentBody } from "../_lib/signup/schoolStudent.js";
import { isSchoolmentorSite } from "../_lib/signup/site.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "detail",
  methodNotAllowedExtra: { code: "METHOD_NOT_ALLOWED" },
  unhandledMessage: "가입하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  unhandledExtra: {
    code: "INTERNAL",
    message: "가입하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
  logLabel: "[signup/school-student]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res) => {
    if (!isSchoolmentorSite()) {
      res.status(404).json({ code: "NOT_FOUND" });
      return;
    }
    const parsed = parseSchoolStudentBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        code: "VALIDATION",
        message: "입력한 내용을 확인해 주세요.",
        field: parsed.field,
      });
      return;
    }
  },
});
