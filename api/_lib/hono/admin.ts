// defineHandler(auth:"admin" | "user", errorShape:"problem") 를 Hono 미들웨어로 옮긴 것.
//
// 순서는 defineHandler 와 같다: 요청 로그, 메서드(405), 응답 헤더, X-Time-Zone, 인증(관리자 판정과 QA 쓰기 차단), 메뉴 권한, 검증, 핸들러, 감사.
//   루트 앱(root.ts)이 원문 경로 검사, 요청 로그, JSON charset, notFound, onError 를, 관리자 앱(createAdminApp)이 감사를 한 번 건다.
//   라우트 파일마다 const guard = admin({...}) 를 하나 만들어 메서드 라우트의 첫 미들웨어로 쓰고, 메서드들 뒤에 .all(path, methodNotAllowed(...)) 를 단다.
//   검증은 validate.ts 의 zValidator 가 라우트에서 한다. 오류는 던지고 error.ts 가 problem 응답으로 바꾼다.

import type { Context, MiddlewareHandler } from "hono";
import type { AdminMenuKey } from "../../../shared/admin-permission/menu.js";
import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import {
  type AdminAuditAction,
  isAuditableMethod,
  scheduleAdminAudit,
} from "../accessLog/adminWrite.js";
import { adminProblemCode, resolveAdmin } from "../adminAuth.js";
import {
  type AdminLevel,
  assertSectionPermission,
} from "../adminPermission.js";
import { resolveUser } from "../httpAuth.js";
import { AUTH_REQUIRED_MESSAGE } from "../httpResponse.js";
import { isReadMethod } from "../qaAccount.js";
import { getBearerToken } from "../serviceAccess.js";
import { createSupabaseAdmin } from "../supabaseAdmin.js";
import { createSupabaseUserClient } from "../supabaseUser.js";
import { readTimeZone } from "../timeZone.js";
import { type AdminEnv, adminFactory } from "./factory.js";
import { ProblemError, qaBlocked } from "./problem.js";
import { nodeHeaders, rawPath } from "./request.js";

/** 응답이 정해진 뒤 감사 행을 예약한다(성공, 실패 모두). HEAD 는 감사 대상이 아니다. 적재 실패는 응답에 닿지 않는다. */
const adminAudit = adminFactory.createMiddleware(async (c, next) => {
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

/** 관리자 영역 앱. 도메인 하위 앱을 .route() 로 붙인다(api/_routes/admin/app.ts). */
export const createAdminApp = () => adminFactory.createApp().use(adminAudit);

/** 관리자 본인 토큰으로 만든 클라이언트. auth.uid() 로 is_admin() 을 확인하는 rpc 와 RLS 로 범위가 정해지는 읽기에 쓴다(service_role 은 uid 가 null). */
export const userClient = (c: Context) =>
  createSupabaseUserClient(getBearerToken({ headers: nodeHeaders(c) }));

export interface RouteOptions {
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

// 관리자 응답은 개인정보가 섞여 캐시하지 않는다(owner 결정 2026-11-26). headers 옵션이 같은 이름을 주면 그 값을 쓴다.
const ADMIN_DEFAULT_HEADERS = { "Cache-Control": "no-store" };

// 라우트 미들웨어 공통 앞부분: 오류 문구, 응답 헤더, 시간대(인증보다 먼저, 잘못된 값은 어디서나 같은 400).
function prepare(
  c: Context<AdminEnv>,
  options: RouteOptions,
  headers: Record<string, string>,
): void {
  c.set("unhandledMessage", options.unhandledMessage);
  c.set("logLabel", options.logLabel);
  for (const [key, value] of Object.entries(headers)) c.header(key, value);
  const timeZone = readTimeZone({ headers: nodeHeaders(c) });
  if (timeZone) c.set("timeZone", timeZone);
}

// 라우트 표 가드(api/_routes/app.test.ts)가 메서드 라우트의 첫 미들웨어가 인증인지 본다.
const authMiddlewares = new WeakSet<MiddlewareHandler>();

export function isAuthMiddleware(handler: unknown): boolean {
  return authMiddlewares.has(handler as MiddlewareHandler);
}

export function registered<T extends MiddlewareHandler>(middleware: T): T {
  authMiddlewares.add(middleware);
  return middleware;
}

/** defineHandler auth:"admin". 관리자 판정(QA 관리자의 쓰기 차단 포함)과 메뉴 권한을 본다. */
export const admin = (options: AdminRouteOptions) =>
  registered(
    adminFactory.createMiddleware(async (c, next) => {
      prepare(c, options, { ...ADMIN_DEFAULT_HEADERS, ...options.headers });
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
      // 거부는 SectionPermissionDeniedError(403), 조회 오류는 일반 예외(500)로 error.ts 가 응답한다.
      await assertSectionPermission(
        supabaseAdmin,
        resolved.userId,
        requestedKey,
        level ?? (isReadMethod(c.req.method) ? "view" : "edit"),
      );
      await next();
    }),
  );

/** defineHandler auth:"user". 관리자가 되기 전 사용자가 부르는 라우트(admin/me/activate)용. */
export const user = (options: RouteOptions) =>
  registered(
    adminFactory.createMiddleware(async (c, next) => {
      prepare(c, options, options.headers ?? {});
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
    }),
  );
