// Hono 앱과 미들웨어의 Env 타입과 팩토리. 인증 모드마다 Env 하나와 팩토리 하나를 둔다(관리자, 로그인 사용자).
// AdminEnv, UserEnv 는 DB 클라이언트를 담아 서버 전용이다. 브라우저와 나누는 것은 shared/ 의 요청, 응답 스키마다.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createFactory } from "hono/factory";
import type { AdminAuditAction } from "../accessLog/adminWrite.js";

/** 루트 앱 미들웨어(요청 로그, 오류 처리)가 읽는 값. 라우트 미들웨어가 채운다. */
export type BaseVariables = {
  /** 인증을 통과한 뒤에만 있다(요청 로그의 userId). */
  userId: string | undefined;
  /** 미처리 예외(500) 문구와 console.error 라벨. 라우트 미들웨어가 맨 먼저 채운다. */
  unhandledMessage: string;
  logLabel: string;
};

export type BaseEnv = { Variables: BaseVariables };

export interface AuditTarget {
  actor: { userId: string; email: string | null };
  /** 권한 판정에 요청한 메뉴 키(별칭 해석 전). */
  requestedKey: string;
  /** 라우트 경로 값. 대상 id 를 고르는 데 쓴다. */
  params: Record<string, string>;
  action?: AdminAuditAction;
}

export type AdminEnv = {
  Variables: BaseVariables & {
    /** auth user 모드에서만 있다. */
    user: User | undefined;
    token: string | undefined;
    /** 인증 직전에 만든다. 그 전에 끝나는 405, 시간대 400 은 환경 변수 없이도 응답한다. */
    supabaseAdmin: SupabaseClient;
    /** X-Time-Zone 헤더가 있고 유효할 때만 있다. */
    timeZone: string | undefined;
    /** 관리자 판정과 권한 키가 정해진 뒤에만 있다. 관리자 앱의 adminAudit 이 응답 뒤에 쓴다. */
    audit: AuditTarget | undefined;
  };
};

/** 로그인한 사용자 라우트(user() 미들웨어 뒤). 인증을 통과한 핸들러만 읽으므로 user, token 은 undefined 가 아니다. */
export type UserEnv = {
  Variables: BaseVariables & {
    user: User;
    token: string;
    supabaseAdmin: SupabaseClient;
    /** X-Time-Zone 헤더가 있고 유효할 때만 있다. */
    timeZone: string | undefined;
  };
};

// 끝 슬래시는 dispatch 처럼 같은 라우트로 본다.
const defaultAppOptions = { strict: false };

export const baseFactory = createFactory<BaseEnv>({ defaultAppOptions });
export const adminFactory = createFactory<AdminEnv>({ defaultAppOptions });
export const userFactory = createFactory<UserEnv>({ defaultAppOptions });
