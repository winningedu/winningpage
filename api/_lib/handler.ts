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
import type { z } from "zod";
import {
  type AdminAuditAction,
  isAuditableMethod,
  scheduleAdminAudit,
} from "./accessLog/adminWrite.js";
import { resolveAdmin, resolveWinningAdmin } from "./adminAuth.js";
import {
  type AdminLevel,
  assertSectionPermission,
  SectionPermissionDeniedError,
} from "./adminPermission.js";
import { type ConsoleActor, resolveConsoleActor } from "./console/actor.js";
import { isAuthorizedCron } from "./cronAuth.js";
import { resolveUser } from "./httpAuth.js";
import { assertMethod } from "./httpMethod.js";
import { type ErrorShape, sendError } from "./httpResponse.js";
import { QaBlockedError, sendQaBlocked } from "./qaAccount.js";
import { createSupabaseAdmin, isSupabaseConfigError } from "./supabaseAdmin.js";
import {
  InvalidTimeZoneError,
  readTimeZone,
  TimeZoneRequiredError,
} from "./timeZone.js";

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
  /** X-Time-Zone 헤더가 있고 유효할 때만 채워진다(보는 사람의 시간대). */
  timeZone?: string;
}

/**
 * 보는 사람의 하루 기준이 필요한 라우트 전용 — 헤더가 없으면 400 TIME_ZONE_REQUIRED.
 * 던진 에러는 defineHandler 의 catch 가 라우트의 errorShape 로 응답한다.
 */
export function requireTimeZone(ctx: HandlerCtx): string {
  if (!ctx.timeZone) throw new TimeZoneRequiredError();
  return ctx.timeZone;
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
// api/performance/*.ts, api/_routes/check-service-access.ts, api/diagnosis/*.ts 등
// auth:user 401 전부가 이 문구/코드를 쓴다.
const AUTH_REQUIRED_MESSAGE = "로그인이 필요합니다.";
const AUTH_REQUIRED_CODE = "UNAUTHENTICATED";

const METHOD_NOT_ALLOWED_CODE = "METHOD_NOT_ALLOWED";
const FORBIDDEN_CODE = "FORBIDDEN";

const VALIDATION_FAILED_CODE = "VALIDATION_FAILED";
const VALIDATION_FAILED_MESSAGE = "요청 값이 올바르지 않아요.";

const INVALID_TIME_ZONE_CODE = "INVALID_TIME_ZONE";
const TIME_ZONE_REQUIRED_CODE = "TIME_ZONE_REQUIRED";

const NOT_CONSOLE_MESSAGE = "선생님 화면 권한이 없습니다.";
const MUST_CHANGE_PASSWORD_MESSAGE = "임시 비밀번호를 먼저 변경해 주세요.";
const NOT_SCHOOL_ADMIN_MESSAGE = "전체 관리자만 사용할 수 있습니다.";
const READ_ONLY_PROXY_MESSAGE = "읽기 전용 대행 중에는 바꿀 수 없습니다.";
const READ_ONLY_METHODS = new Set(["GET", "HEAD"]);

// api/performance/cleanup-attachments.ts, embed-session-vectors.ts 기준.
const CRON_REQUIRED_MESSAGE = "인증이 필요합니다.";
const CRON_REQUIRED_CODE = "UNAUTHORIZED";

// resolveAdmin 계열은 code 없이 status 와 detail 만 준다. problem 은 code 가 필수라
// 여기서만 채우고, 다른 shape 의 바디는 그대로 둔다.
function adminFailureCode(
  shape: ErrorShape,
  status: number,
): string | undefined {
  if (shape !== "problem") return undefined;
  if (status === 401) return AUTH_REQUIRED_CODE;
  if (status === 403) return FORBIDDEN_CODE;
  return undefined;
}

type ZodSchema = z.ZodType;

/**
 * 경로 파라미터 값이 잘못됐을 때(예: 모르는 섹션 키) 던진다. 권한 키 함수나 핸들러에서 던지면
 * zod 검증 실패와 같은 400 VALIDATION_FAILED 로 응답한다(권한 판정보다 먼저 막는다).
 */
export class RouteParamError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(message);
    this.name = "RouteParamError";
    this.path = path;
  }
}

function sendValidationFailed(
  res: VercelResponse,
  shape: ErrorShape,
  errors: { path: string; message: string }[],
): void {
  sendError(
    res,
    shape,
    400,
    VALIDATION_FAILED_MESSAGE,
    VALIDATION_FAILED_CODE,
    { errors },
  );
}

// body/query 스키마가 있을 때만 ctx 에 해당 키가 생기고 출력 타입을 가진다.
// 스키마가 없으면 unknown 과의 교차라 기존 HandlerCtx 와 같다.
type ValidatedCtx<
  B extends ZodSchema | undefined,
  Q extends ZodSchema | undefined,
> = (B extends ZodSchema ? { body: z.output<B> } : unknown) &
  (Q extends ZodSchema ? { query: z.output<Q> } : unknown);

export interface DefineHandlerOptions<
  B extends ZodSchema | undefined = undefined,
  Q extends ZodSchema | undefined = undefined,
> {
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
  /**
   * auth:"console" 전용: 읽기 전용 대행에서도 GET 이 아닌 요청을 허용한다.
   * 데이터를 바꾸지 않는 POST(미리보기, 내려받기와 출력 기록)만 켠다.
   */
  allowReadOnlyProxy?: boolean;
  /**
   * auth:"admin" 전용 메뉴 권한(사용법은 adminPermission.ts 상단). key 는 메뉴 키이거나 요청에서 뽑는 함수다.
   * level 생략 시 GET, HEAD 는 view, 나머지는 edit.
   */
  permission?: {
    key: string | ((req: VercelRequest) => string);
    level?: AdminLevel;
  };
  /**
   * auth:"admin" 전용 감사 행. permission 이 있는 라우트의 요청(HEAD 제외)은 응답 뒤에
   * admin_access_logs 에 한 줄을 남긴다(성공, 실패 모두). false 면 자동 행을 끈다(라우트가 직접 남기는 경우).
   * { action } 은 메서드 기본값(GET view, POST create, PATCH, PUT update, DELETE delete)을 바꾼다.
   */
  audit?: false | { action: AdminAuditAction };
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
  /** 있으면 인증 뒤, handler 앞에서 req.body 를 검증해 ctx.body 로 넘긴다. */
  body?: B;
  /** 있으면 인증 뒤, handler 앞에서 req.query 를 검증해 ctx.query 로 넘긴다. */
  query?: Q;
  handler: (
    req: VercelRequest,
    res: VercelResponse,
    ctx: HandlerCtx & ValidatedCtx<B, Q>,
  ) => Promise<void>;
}

/** 검증 실패면 400 을 보내고 null, 통과하면 파싱된 값을 돌려준다. 메서드마다 입력이 다른 라우트가 직접 쓴다. */
export function parseOrReject(
  res: VercelResponse,
  shape: ErrorShape,
  schema: ZodSchema,
  input: unknown,
): { value: unknown } | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { value: parsed.data };
  sendValidationFailed(
    res,
    shape,
    parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  );
  return null;
}

export function defineHandler<
  B extends ZodSchema | undefined = undefined,
  Q extends ZodSchema | undefined = undefined,
>(opts: DefineHandlerOptions<B, Q>) {
  // 다른 auth 모드에 붙이면 조용히 무시되므로 정의 시점에 막는다.
  if (opts.permission && opts.auth !== "admin") {
    throw new Error('defineHandler: permission 은 auth:"admin" 에서만 쓴다.');
  }
  if (opts.audit !== undefined && opts.auth !== "admin") {
    throw new Error('defineHandler: audit 은 auth:"admin" 에서만 쓴다.');
  }
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
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

    const startedAt = performance.now();
    // 응답이 끝나거나 연결이 끊길 때 요청당 한 줄만 남긴다(finish, close 중 먼저 온 쪽).
    // 토큰, 본문, 쿼리, 개인정보는 싣지 않는다.
    // 테스트용 가짜 res 에는 on 이 없을 수 있어 옵셔널 호출로 건다.
    let logged = false;
    const logRequest = () => {
      if (logged) return;
      logged = true;
      const requestId = req.headers["x-vercel-id"];
      console.log(
        JSON.stringify({
          requestId: typeof requestId === "string" ? requestId : null,
          route: req.url ? req.url.split("?")[0] : null,
          method: req.method ?? null,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
          userId: ctx.userId ?? null,
        }),
      );
    };
    res.on?.("finish", logRequest);
    res.on?.("close", logRequest);

    if (
      !assertMethod(
        req,
        res,
        opts.methods,
        opts.errorShape,
        opts.methodNotAllowedMessage,
        opts.errorShape === "problem"
          ? METHOD_NOT_ALLOWED_CODE
          : opts.methodNotAllowedCode,
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

    // 감사 행에 쓸 값. 관리자 판정을 통과하고 권한 키가 정해진 뒤에만 채워진다.
    let auditActor: { userId: string; email: string | null } | undefined;
    let auditKey: string | undefined;

    try {
      // 인증보다 먼저 읽는다: 모든 auth 모드에서 잘못된 값은 같은 400 이다.
      const timeZone = readTimeZone(req);
      if (timeZone) ctx.timeZone = timeZone;

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
          if (
            actor.readOnly &&
            !opts.allowReadOnlyProxy &&
            !READ_ONLY_METHODS.has(req.method ?? "")
          ) {
            sendError(
              res,
              opts.errorShape,
              403,
              READ_ONLY_PROXY_MESSAGE,
              "READ_ONLY_PROXY",
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
          if (admin.code) {
            sendQaBlocked(res, opts.errorShape, admin.code);
            return;
          }
          sendError(
            res,
            opts.errorShape,
            admin.status,
            admin.detail,
            adminFailureCode(opts.errorShape, admin.status),
          );
          return;
        }
        ctx.userId = admin.userId;
        ctx.admin = { userId: admin.userId };
        auditActor = { userId: admin.userId, email: admin.email };

        if (opts.permission) {
          const { key, level } = opts.permission;
          // 키 함수가 던지면(400) 대상 메뉴가 없으니 auditKey 는 비워 둔다.
          const requestedKey = typeof key === "function" ? key(req) : key;
          auditKey = requestedKey;
          // 거부는 SectionPermissionDeniedError(403), 조회 오류는 일반 예외(500)로 아래 catch 가 응답한다.
          await assertSectionPermission(
            ctx.supabaseAdmin,
            admin.userId,
            requestedKey,
            level ??
              (READ_ONLY_METHODS.has(req.method ?? "") ? "view" : "edit"),
          );
        }
      } else if (opts.auth === "winningAdmin") {
        const admin = await resolveWinningAdmin(
          ctx.supabaseAdmin,
          req as unknown as { headers: Record<string, string> },
        );
        if (!admin.ok) {
          if (admin.code) {
            sendQaBlocked(res, opts.errorShape, admin.code);
            return;
          }
          sendError(
            res,
            opts.errorShape,
            admin.status,
            admin.detail,
            adminFailureCode(opts.errorShape, admin.status),
          );
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

      if (opts.body) {
        const parsed = parseOrReject(res, opts.errorShape, opts.body, req.body);
        if (!parsed) return;
        (ctx as { body?: unknown }).body = parsed.value;
      }
      if (opts.query) {
        const parsed = parseOrReject(
          res,
          opts.errorShape,
          opts.query,
          req.query,
        );
        if (!parsed) return;
        (ctx as { query?: unknown }).query = parsed.value;
      }

      await opts.handler(req, res, ctx as Parameters<typeof opts.handler>[2]);
    } catch (error) {
      if (error instanceof QaBlockedError) {
        sendQaBlocked(res, opts.errorShape, error.code);
        return;
      }
      if (error instanceof RouteParamError) {
        sendValidationFailed(res, opts.errorShape, [
          { path: error.path, message: error.message },
        ]);
        return;
      }
      if (
        error instanceof InvalidTimeZoneError ||
        error instanceof TimeZoneRequiredError ||
        error instanceof SectionPermissionDeniedError
      ) {
        sendError(
          res,
          opts.errorShape,
          error instanceof SectionPermissionDeniedError ? 403 : 400,
          error.message,
          error instanceof SectionPermissionDeniedError
            ? FORBIDDEN_CODE
            : error instanceof InvalidTimeZoneError
              ? INVALID_TIME_ZONE_CODE
              : TIME_ZONE_REQUIRED_CODE,
          opts.authFailureExtra,
        );
        return;
      }
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
    } finally {
      // 상태 코드가 정해진 뒤(모든 종료 경로)에 한 번만 예약한다. 적재 실패는 응답에 닿지 않는다.
      if (
        auditActor &&
        auditKey !== undefined &&
        opts.audit !== false &&
        isAuditableMethod(req.method)
      ) {
        const actor = auditActor;
        const requestedKey = auditKey;
        scheduleAdminAudit(() => ctx.supabaseAdmin, {
          req,
          statusCode: res.statusCode,
          actor,
          requestedKey,
          ...(opts.audit ? { action: opts.audit.action } : {}),
        });
      }
    }
  };
}
