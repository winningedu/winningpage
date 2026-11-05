// POST /api/auth/login  { identifier, password }
//
// 스쿨멘토 전용 서버 로그인. 아이디(또는 이메일)로 로그인하고 연속 실패를 센다.
// 위닝은 클라이언트에서 signInWithPassword 를 직접 부른다(이 라우트를 쓰지 않는다).
// 설계: schoolmentor-notes/design-data-foundation.md 4절, 5.2절.

import { createClient } from "@supabase/supabase-js";
import { attemptLogin, isValidLoginBody } from "../_lib/auth/login.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { getClientIp } from "../_lib/phoneCode.js";
import { getEnv } from "../_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "잠시 후 다시 시도해 주세요.",
  unhandledCode: "RETRY",
  logLabel: "[auth/login]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isValidLoginBody(req.body)) {
      sendError(
        res,
        "coded",
        400,
        "아이디와 비밀번호를 입력해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }
    const { identifier, password } = req.body;
    const ip = getClientIp(req);
    const authClient = createClient(
      getEnv("WINNING_SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL"),
      getEnv("SUPABASE_SECRET_KEY"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: ip ? { "Sb-Forwarded-For": ip } : {} },
      },
    );

    const result = await attemptLogin(ctx.supabaseAdmin, {
      identifier,
      password,
      signIn: async (email, pw) =>
        authClient.auth.signInWithPassword({ email, password: pw }),
    });

    if (result.ok) {
      res.status(200).json({
        session: result.session,
        mustChangePassword: result.mustChangePassword,
      });
    } else {
      if (result.retryAfterSeconds !== undefined) {
        res.setHeader("Retry-After", String(result.retryAfterSeconds));
      }
      sendError(
        res,
        "coded",
        result.status,
        result.message,
        result.code,
        result.extra,
      );
    }
  },
});
