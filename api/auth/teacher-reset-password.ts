// POST /api/auth/teacher-reset-password  { loginId, phone, password }
//
// 선생님 비밀번호 찾기(결정 103). 휴대폰 인증(reset_password 목적)으로 번호 소유를 증명한 뒤
// 아이디와 번호가 같은 교사의 비밀번호를 새로 정한다. 스쿨멘토 전용이라 위닝에서는 404.

import { defineHandler } from "../_lib/handler.js";
import { isSchoolmentorSite } from "../_lib/site.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "비밀번호를 바꾸지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[auth/teacher-reset-password]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res) => {
    if (!isSchoolmentorSite()) {
      res.status(404).json({ code: "NOT_FOUND" });
      return;
    }
  },
});
