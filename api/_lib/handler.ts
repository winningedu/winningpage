// 핸들러 공통 실행 골격 — method 체크 → auth 해석 → handler → 최상위 try/catch.
//
// 50개 핸들러가 각자 들고 있던 다음 4가지 중복을 흡수한다:
//   1. `if (req.method !== 'X') return res.status(405)...`
//   2. Bearer 토큰 → 유저/관리자 판정 인라인 복붙
//   3. try/catch로 감싼 뒤 실패 시 500 + 라우트별 에러 바디
//   4. 위 세 가지를 매번 같은 순서로 손으로 나열
//
// auth 등급 하향 금지: 기존 인증 패턴과 여기 `auth:` 값이 반드시 1:1이어야
// 한다(api/docs/refactor-plan.md의 대조표 참고). 등급을 낮추면 무인가 접근이
// 뚫린다.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveAdmin, resolveWinningAdmin } from "./adminAuth.js";
import { type ConsoleActor, resolveConsoleActor } from "./console/actor.js";
import { isAuthorizedCron } from "./cronAuth.js";
import { resolveUser } from "./httpAuth.js";
import { assertMethod } from "./httpMethod.js";
import { type ErrorShape, sendError } from "./httpResponse.js";
import { createSupabaseAdmin, isSupabaseConfigError } from "./supabaseAdmin.js";

// dev 원본 ~20파일이 개별 `try { createSupabaseAdmin() } catch { ... }`로 냈던
// 문구. 실제 예외 메시지(SUPABASE_CONFIG_ERROR_MESSAGE)와는 다르다 — 저건
// 개발자용 원인, 이건 클라이언트용 안내문이다.
const CONFIG_ERROR_RESPONSE_MESSAGE = "서버 설정이 올바르지 않습니다.";

export type AuthMode =
  | "none"
  | "user"
  | "admin"
  | "winningAdmin"
  | "cron"
  | "console";

export interface HandlerCtx {
  userId?: string;
  user?: User;
  token?: string;
  admin?: { userId: string };
  /** auth:"console" 일 때만 채워진다(교사, 학교 관리자, 본사 대행). */
  console?: ConsoleActor;
  supabaseAdmin: SupabaseClient;
}

/**
 * auth:"user" 라우트 전용 — ctx.userId가 채워져 있음을 non-null assertion(`!`)
 * 없이 좁힌다. defineHandler가 auth:"user"일 때만 ctx.userId를 채우므로, 이
 * 함수를 그 핸들러 안에서 부르는 한 실제로 throw할 일은 없다(다른 auth 모드
 * 핸들러에서 잘못 호출하는 프로그래밍 오류만 여기서 드러난다).
 */
export function requireUserId(ctx: HandlerCtx): string {
  if (!ctx.userId) {
    throw new Error(
      'requireUserId: ctx.userId가 없습니다 — auth:"user" 핸들러에서만 호출할 것.',
    );
  }
  return ctx.userId;
}

// 코드베이스 전역에서 이미 통일돼 있던 문구(변경 없이 그대로 채택) —
// api/performance/*.ts, api/check-service-access.ts, api/diagnosis/*.ts 등
// auth:user 401 전부가 이 문구/코드를 쓴다.
const AUTH_REQUIRED_MESSAGE = "로그인이 필요합니다.";
const AUTH_REQUIRED_CODE = "UNAUTHENTICATED";

const NOT_CONSOLE_MESSAGE = "콘솔 권한이 없습니다.";
const MUST_CHANGE_PASSWORD_MESSAGE = "임시 비밀번호를 먼저 변경해 주세요.";
const NOT_SCHOOL_ADMIN_MESSAGE = "학교 관리자만 사용할 수 있습니다.";

// api/performance/cleanup-attachments.ts, embed-session-vectors.ts 기준.
const CRON_REQUIRED_MESSAGE = "인증이 필요합니다.";
const CRON_REQUIRED_CODE = "UNAUTHORIZED";

export interface DefineHandlerOptions {
  methods: readonly ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[];
  /** 명시 필수 — 기본값을 두지 않는다(등급 누락을 컴파일 타임에 강제로 드러내기 위함). */
  auth: AuthMode;
  errorShape: ErrorShape;
  /** 405 문구. 라우트마다 다르므로 기본값("Method not allowed") 외에는 지정한다. */
  methodNotAllowedMessage?: string;
  /** errorShape가 "coded"일 때만 쓰는 405 코드. */
  methodNotAllowedCode?: string;
  /**
   * 405 바디에 얹을 추가 필드(예: mentor-apply의 `reason: "method_not_allowed"`).
   * sendError의 extra와 동일하게 최상위 형제 키로 스프레드된다.
   */
  methodNotAllowedExtra?: Record<string, unknown>;
  /**
   * auth:"cron" 401 문구 오버라이드. 기본값(CRON_REQUIRED_MESSAGE)은
   * performance/cleanup-attachments·embed-session-vectors 기준이고, cron/* 3종은
   * dev 원본이 "Unauthorized"라 이걸로 override한다.
   */
  authFailureMessage?: string;
  /**
   * auth 실패(401) 바디에 얹을 추가 필드(예: diagnosis/consume의 `ok: false`).
   * auth:"user"·"cron" 양쪽에 적용된다 — admin·winningAdmin은 resolveAdmin/
   * resolveWinningAdmin이 이미 자체 detail을 돌려주므로 대상이 아니다.
   */
  authFailureExtra?: Record<string, unknown>;
  /** auth:"console" 전용 — "schoolAdmin" 이면 담임을 403 으로 막는다(대행은 통과). */
  consoleRole?: "schoolAdmin";
  /** auth:"console" 전용 — 임시 비밀번호 상태의 계정도 허용한다(비밀번호 설정 라우트용). */
  allowMustChange?: boolean;
  /** 미처리 예외(500) 응답 문구 — 라우트마다 달라 필수로 받는다. */
  unhandledMessage: string;
  /** errorShape가 "coded"일 때만 쓰는 500 코드. */
  unhandledCode?: string;
  /** 미처리 예외(500) 바디에 얹을 추가 필드(예: diagnosis/consume의 `ok: false`). */
  unhandledExtra?: Record<string, unknown>;
  /** console.error 라벨(응답 바디에는 영향 없음). */
  logLabel?: string;
  /**
   * method 체크 통과 직후, auth 해석보다 먼저 설정할 응답 헤더(예: Cache-Control:
   * no-store). 기존 코드 중 일부(diagnosis/consume.ts)가 이 위치에서 헤더를 걸어
   * 401/403 등 auth 실패 응답에도 헤더가 실리게 했다 — 그 순서를 그대로 재현한다.
   */
  headers?: Record<string, string>;
  handler: (
    req: VercelRequest,
    res: VercelResponse,
    ctx: HandlerCtx,
  ) => Promise<void>;
}

export function defineHandler(opts: DefineHandlerOptions) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    if (
      !assertMethod(
        req,
        res,
        opts.methods,
        opts.errorShape,
        opts.methodNotAllowedMessage,
        opts.methodNotAllowedCode,
        opts.methodNotAllowedExtra,
      )
    ) {
      return;
    }

    if (opts.headers) {
      for (const [key, value] of Object.entries(opts.headers)) {
        res.setHeader(key, value);
      }
    }

    try {
      // ctx.supabaseAdmin은 lazy getter다 — 실제로 접근하는 시점에만
      // createSupabaseAdmin()을 호출한다(내부적으로 module-level 싱글턴이라 여러
      // 번 접근해도 클라이언트는 하나만 만들어진다). auth:"none" 핸들러가 토큰·
      // service_key 검증 같은 early return을 supabaseAdmin 없이 먼저 처리하는
      // dev 원본 순서(예: create-service-ticket.ts의 suhaeng 200, monthly-report.ts의
      // not_month_end 200 skip)를 재현하기 위함이다 — env 미설정이어도 그 경로들은
      // 여전히 200을 낸다.
      const ctx = {} as HandlerCtx;
      let cachedAdmin: SupabaseClient | undefined;
      Object.defineProperty(ctx, "supabaseAdmin", {
        enumerable: true,
        configurable: true,
        get(): SupabaseClient {
          if (!cachedAdmin) cachedAdmin = createSupabaseAdmin();
          return cachedAdmin;
        },
      });

      if (opts.auth === "user" || opts.auth === "console") {
        const authed = await resolveUser(req);
        if (!authed) {
          sendError(
            res,
            opts.errorShape,
            401,
            AUTH_REQUIRED_MESSAGE,
            AUTH_REQUIRED_CODE,
            opts.authFailureExtra,
          );
          return;
        }
        ctx.userId = authed.userId;
        ctx.user = authed.user;
        ctx.token = authed.token;

        if (opts.auth === "console") {
          const actor = await resolveConsoleActor(
            ctx.supabaseAdmin,
            authed.userId,
          );
          if (!actor) {
            sendError(
              res,
              opts.errorShape,
              403,
              NOT_CONSOLE_MESSAGE,
              "NOT_CONSOLE",
              opts.authFailureExtra,
            );
            return;
          }
          if (actor.mustChangePassword && !opts.allowMustChange) {
            sendError(
              res,
              opts.errorShape,
              403,
              MUST_CHANGE_PASSWORD_MESSAGE,
              "MUST_CHANGE_PASSWORD",
              opts.authFailureExtra,
            );
            return;
          }
          if (opts.consoleRole === "schoolAdmin" && actor.kind === "homeroom") {
            sendError(
              res,
              opts.errorShape,
              403,
              NOT_SCHOOL_ADMIN_MESSAGE,
              "NOT_SCHOOL_ADMIN",
              opts.authFailureExtra,
            );
            return;
          }
          ctx.console = actor;
        }
      } else if (opts.auth === "admin") {
        // adminAuth.ts는 req.headers를 Record<string, string>으로 선언한다 —
        // VercelRequest.headers(IncomingHttpHeaders)와는 형태만 다를 뿐 실사용
        // (단일 문자열 헤더 읽기)은 호환된다(기존 admin-embed.ts 등과 동일 캐스트).
        const admin = await resolveAdmin(
          ctx.supabaseAdmin,
          req as unknown as { headers: Record<string, string> },
        );
        if (!admin.ok) {
          sendError(res, opts.errorShape, admin.status, admin.detail);
          return;
        }
        ctx.userId = admin.userId;
        ctx.admin = { userId: admin.userId };
      } else if (opts.auth === "winningAdmin") {
        const admin = await resolveWinningAdmin(
          ctx.supabaseAdmin,
          req as unknown as { headers: Record<string, string> },
        );
        if (!admin.ok) {
          sendError(res, opts.errorShape, admin.status, admin.detail);
          return;
        }
        ctx.userId = admin.userId;
        ctx.admin = { userId: admin.userId };
      } else if (opts.auth === "cron") {
        const authorized = isAuthorizedCron(
          req as unknown as { headers: Record<string, string | undefined> },
        );
        if (!authorized) {
          sendError(
            res,
            opts.errorShape,
            401,
            opts.authFailureMessage ?? CRON_REQUIRED_MESSAGE,
            CRON_REQUIRED_CODE,
            opts.authFailureExtra,
          );
          return;
        }
      }
      // auth === "none" → 통과, ctx에 유저 정보 없음

      await opts.handler(req, res, ctx);
    } catch (error) {
      console.error(`${opts.logLabel || "handler"} error:`, error);
      if (isSupabaseConfigError(error)) {
        sendError(
          res,
          opts.errorShape,
          500,
          CONFIG_ERROR_RESPONSE_MESSAGE,
          opts.unhandledCode,
          opts.unhandledExtra,
        );
        return;
      }
      sendError(
        res,
        opts.errorShape,
        500,
        opts.unhandledMessage,
        opts.unhandledCode,
        opts.unhandledExtra,
      );
    }
  };
}
