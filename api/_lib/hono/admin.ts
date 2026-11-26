// defineHandler(auth:"admin" | "user", errorShape:"problem") 를 Hono 미들웨어로 옮긴 것.
//
// 순서는 defineHandler 와 같다: 요청 로그, 메서드(405), 응답 헤더, X-Time-Zone, 인증(관리자 판정과 QA 쓰기 차단), 메뉴 권한, 검증, 핸들러, 감사.
//   루트 앱(createAdminApp)이 원문 경로 검사, 요청 로그, JSON charset, 감사, onError, notFound 를 한 번 건다.
//   라우트마다 admin() 또는 user() 를 첫 미들웨어로 달고, 메서드 핸들러들 뒤에 .all(path, methodNotAllowed(...)) 를 단다.
//   검증은 validate.ts 의 zValidator 가 라우트에서 한다.
// 오류는 던지고 handleError 가 problem 응답으로 바꾼다. Hono 는 오류가 난 층에서 onError 를 부르므로 바깥 미들웨어(로그, 감사)는 최종 status 를 본다.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { type Context, type ErrorHandler, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AdminMenuKey } from "../../../shared/admin-permission/menu.js";
import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import { rawRouteKey } from "../../_routes/dispatch.js";
import {
  type AdminAuditAction,
  isAuditableMethod,
  scheduleAdminAudit,
} from "../accessLog/adminWrite.js";
import { adminProblemCode, resolveAdmin } from "../adminAuth.js";
import {
  type AdminLevel,
  assertSectionPermission,
  SectionPermissionDeniedError,
} from "../adminPermission.js";
import { RouteParamError } from "../handler.js";
import { resolveUser } from "../httpAuth.js";
import {
  AUTH_REQUIRED_MESSAGE,
  CONFIG_ERROR_RESPONSE_MESSAGE,
} from "../httpResponse.js";
import {
  isReadMethod,
  QA_ACCOUNT_MESSAGE,
  QaBlockedError,
  qaBlockedExtra,
} from "../qaAccount.js";
import {
  createSupabaseAdmin,
  isSupabaseConfigError,
} from "../supabaseAdmin.js";
import {
  InvalidTimeZoneError,
  readTimeZone,
  TimeZoneRequiredError,
} from "../timeZone.js";
import {
  notFound,
  ProblemError,
  problemResponse,
  validationFailed,
} from "./problem.js";

interface AuditTarget {
  actor: { userId: string; email: string | null };
  /** 권한 판정에 요청한 메뉴 키(별칭 해석 전). */
  requestedKey: string;
  /** 라우트 경로 값. 대상 id 를 고르는 데 쓴다. */
  params: Record<string, string>;
  action?: AdminAuditAction;
}

export type AdminEnv = {
  Variables: {
    /** 인증을 통과한 뒤에만 있다(요청 로그의 userId). */
    userId: string | undefined;
    /** auth user 모드에서만 있다. */
    user: User | undefined;
    token: string | undefined;
    /** 인증 직전에 만든다. 그 전에 끝나는 405, 시간대 400 은 환경 변수 없이도 응답한다. */
    supabaseAdmin: SupabaseClient;
    /** X-Time-Zone 헤더가 있고 유효할 때만 있다. */
    timeZone: string | undefined;
    /** 미처리 예외(500) 문구와 console.error 라벨. 라우트 미들웨어가 맨 먼저 채운다. */
    unhandledMessage: string;
    logLabel: string;
    /** 관리자 판정과 권한 키가 정해진 뒤에만 있다. 루트의 adminAudit 이 응답 뒤에 쓴다. */
    audit: AuditTarget | undefined;
  };
};

/** Fetch 헤더를 소문자 키 객체로. 기존 헬퍼(getBearerToken, readTimeZone, resolveAdmin)가 이 모양을 읽는다. */
function nodeHeaders(c: Context): Record<string, string> {
  return Object.fromEntries(c.req.raw.headers.entries());
}

/** 요청 주소에서 origin 과 쿼리를 뗀 원문 경로. defineHandler 의 req.url.split("?")[0] 과 같은 값이다. */
function rawPath(c: Context): string {
  const url = c.req.url;
  const start = url.indexOf("/", url.indexOf("://") + 3);
  return (start === -1 ? "/" : url.slice(start)).split("?")[0] ?? "/";
}

const qaBlocked = (code: string) =>
  new ProblemError(403, QA_ACCOUNT_MESSAGE, code, qaBlockedExtra(code));

/**
 * dispatch 와 같은 원문 경로 검사. 빈 구간, ".", "..", 역슬래시, "%", 대괄호가 있으면 라우트를 찾지 않고 404 다.
 * Request 는 URL 을 표준대로 정규화하므로 보통은 rewrite 의 lookahead 가 먼저 막는다. 원문이 그대로 오는 런타임을 위한 두 번째 줄이다.
 */
const pathGuard = createMiddleware<AdminEnv>(async (c, next) => {
  if (rawRouteKey(rawPath(c)) === undefined) return c.notFound();
  await next();
});

/** 요청당 한 줄. 토큰, 본문, 쿼리, 개인정보는 싣지 않는다. 키와 순서는 defineHandler 와 같다. */
const requestLog = createMiddleware<AdminEnv>(async (c, next) => {
  const startedAt = performance.now();
  await next();
  console.log(
    JSON.stringify({
      requestId: c.req.header("x-vercel-id") ?? null,
      route: rawPath(c),
      method: c.req.method,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
      userId: c.get("userId") ?? null,
    }),
  );
});

/** c.json 은 application/json 만 보낸다. Vercel res.json 과 같은 값으로 맞춘다. */
const jsonCharset = createMiddleware<AdminEnv>(async (c, next) => {
  await next();
  if (c.res.headers.get("content-type") === "application/json") {
    c.res.headers.set("content-type", "application/json; charset=utf-8");
  }
});

/** 응답이 정해진 뒤 감사 행을 예약한다(성공, 실패 모두). HEAD 는 감사 대상이 아니다. 적재 실패는 응답에 닿지 않는다. */
const adminAudit = createMiddleware<AdminEnv>(async (c, next) => {
  await next();
  const audit = c.get("audit");
  if (!audit || !isAuditableMethod(c.req.method)) return;
  scheduleAdminAudit(() => c.get("supabaseAdmin"), {
    req: {
      method: c.req.method,
      url: rawPath(c),
      headers: nodeHeaders(c),
      query: audit.params,
    },
    statusCode: c.res.status,
    actor: audit.actor,
    requestedKey: audit.requestedKey,
    ...(audit.action ? { action: audit.action } : {}),
  });
});

export const handleError: ErrorHandler<AdminEnv> = (error, c) => {
  if (error instanceof ProblemError) {
    return problemResponse(
      c,
      error.status,
      error.message,
      error.code,
      error.extra,
    );
  }
  if (error instanceof QaBlockedError) {
    const qa = qaBlocked(error.code);
    return problemResponse(c, 403, qa.message, qa.code, qa.extra);
  }
  if (error instanceof RouteParamError) {
    return validationFailed(c, [{ path: error.path, message: error.message }]);
  }
  // zValidator 의 깨진 JSON 본문.
  if (error instanceof HTTPException && error.status === 400) {
    return validationFailed(c, []);
  }
  if (error instanceof SectionPermissionDeniedError) {
    return problemResponse(c, 403, error.message, PROBLEM_CODE.FORBIDDEN);
  }
  if (error instanceof InvalidTimeZoneError) {
    return problemResponse(
      c,
      400,
      error.message,
      PROBLEM_CODE.INVALID_TIME_ZONE,
    );
  }
  if (error instanceof TimeZoneRequiredError) {
    return problemResponse(
      c,
      400,
      error.message,
      PROBLEM_CODE.TIME_ZONE_REQUIRED,
    );
  }
  console.error(`${c.get("logLabel") || "handler"} error:`, error);
  if (isSupabaseConfigError(error)) {
    return problemResponse(c, 500, CONFIG_ERROR_RESPONSE_MESSAGE);
  }
  return problemResponse(c, 500, c.get("unhandledMessage"));
};

/** 관리자 라우트의 루트 앱. 하위 앱은 .route() 로 붙인다. 끝 슬래시는 dispatch 처럼 같은 라우트로 본다. */
export const createAdminApp = () =>
  new Hono<AdminEnv>({ strict: false })
    .use(pathGuard, requestLog, jsonCharset, adminAudit)
    .notFound(notFound)
    .onError(handleError);

interface RouteOptions {
  /** 미처리 예외(500) 응답 문구. 라우트마다 다르다. */
  unhandledMessage: string;
  /** console.error 라벨(응답 바디에는 영향 없음). */
  logLabel: string;
  /** 인증보다 먼저 거는 응답 헤더. 401, 403 같은 오류 응답에도 실린다. */
  headers?: Record<string, string>;
}

export interface AdminRouteOptions extends RouteOptions {
  /** 메뉴 권한. key 는 메뉴 키이거나 요청에서 뽑는 함수다(던진 RouteParamError 는 400). level 생략 시 GET, HEAD 는 view, 나머지는 edit. */
  permission: {
    /** 리터럴은 메뉴 키 목록 안에서만. 키 함수는 요청 값에서 만들므로 string 을 돌려준다(모르는 키는 권한 판정에서 403). */
    key: AdminMenuKey | ((c: Context<AdminEnv>) => string);
    level?: AdminLevel;
  };
  /** false 면 자동 감사 행을 끈다(라우트가 직접 남기는 경우). { action } 은 메서드 기본값을 바꾼다. */
  audit?: false | { action: AdminAuditAction };
}

// 라우트 미들웨어 공통 앞부분: 오류 문구, 응답 헤더, 시간대(인증보다 먼저, 잘못된 값은 어디서나 같은 400).
function prepare(c: Context<AdminEnv>, options: RouteOptions): void {
  c.set("unhandledMessage", options.unhandledMessage);
  c.set("logLabel", options.logLabel);
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    c.header(key, value);
  }
  const timeZone = readTimeZone({ headers: nodeHeaders(c) });
  if (timeZone) c.set("timeZone", timeZone);
}

/** defineHandler auth:"admin". 관리자 판정(QA 관리자의 쓰기 차단 포함)과 메뉴 권한을 본다. */
export const admin = (options: AdminRouteOptions) =>
  createMiddleware<AdminEnv>(async (c, next) => {
    prepare(c, options);
    const supabaseAdmin = createSupabaseAdmin();
    c.set("supabaseAdmin", supabaseAdmin);

    const resolved = await resolveAdmin(supabaseAdmin, {
      headers: nodeHeaders(c),
      method: c.req.method,
    });
    if (!resolved.ok) {
      if (resolved.code) throw qaBlocked(resolved.code);
      throw new ProblemError(
        resolved.status,
        resolved.detail,
        adminProblemCode(resolved.status),
      );
    }
    c.set("userId", resolved.userId);

    const { key, level } = options.permission;
    // 키 함수가 던지면(400) 대상 메뉴가 없으니 감사 행도 없다.
    const requestedKey = typeof key === "function" ? key(c) : key;
    if (options.audit !== false) {
      c.set("audit", {
        actor: { userId: resolved.userId, email: resolved.email },
        requestedKey,
        params: c.req.param(),
        ...(options.audit ? { action: options.audit.action } : {}),
      });
    }
    // 거부는 SectionPermissionDeniedError(403), 조회 오류는 일반 예외(500)로 handleError 가 응답한다.
    await assertSectionPermission(
      supabaseAdmin,
      resolved.userId,
      requestedKey,
      level ?? (isReadMethod(c.req.method) ? "view" : "edit"),
    );
    await next();
  });

/** defineHandler auth:"user". 관리자가 되기 전 사용자가 부르는 라우트(admin/me/activate)용. */
export const user = (options: RouteOptions) =>
  createMiddleware<AdminEnv>(async (c, next) => {
    prepare(c, options);
    const authed = await resolveUser({ headers: nodeHeaders(c) });
    if (!authed) {
      throw new ProblemError(
        401,
        AUTH_REQUIRED_MESSAGE,
        PROBLEM_CODE.UNAUTHENTICATED,
      );
    }
    c.set("userId", authed.userId);
    c.set("user", authed.user);
    c.set("token", authed.token);
    c.set("supabaseAdmin", createSupabaseAdmin());
    await next();
  });
