// POST /api/signup/username-check  { username }
//
// 스쿨멘토 가입 폼의 아이디 중복 확인 버튼. 계정이 없는 상태라 auth:"none" 이다.
// is_username_available 은 service_role 전용이라 이 라우트가 대신 부른다.
// 최종 중복 판정은 가입 확정 때 DB 가 다시 한다(그 사이 선점될 수 있다).
// 요청 횟수 제한 공용 도구가 아직 없어 IP 제한은 두지 않는다.
// 위닝 배포에서는 404.

import { defineHandler } from "../_lib/handler.js";
import { isSchoolmentorSite } from "../_lib/signup/site.js";
import { normalizeUsername } from "../_lib/signup/username.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "detail",
  methodNotAllowedExtra: { code: "METHOD_NOT_ALLOWED" },
  unhandledMessage: "잠시 후 다시 시도해 주세요.",
  unhandledExtra: { code: "INTERNAL", message: "잠시 후 다시 시도해 주세요." },
  logLabel: "[signup/username-check]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      res.status(404).json({ code: "NOT_FOUND" });
      return;
    }
    const username = normalizeUsername(
      ((req.body ?? {}) as Record<string, unknown>).username,
    );
    if (!username) {
      res.status(400).json({ code: "VALIDATION", field: "username" });
      return;
    }
    const { data, error } = await ctx.supabaseAdmin.rpc(
      "is_username_available",
      { check_username: username },
    );
    if (error) throw error;
    res.status(200).json({ available: data === true });
  },
});
