// 콘솔 범위 도우미. 목록은 기관과 담당 학급으로 거르고, 범위 밖 대상 id 는 404 로 숨긴다
// (다른 기관의 id 가 존재하는지 알려 주지 않는다).

import type { VercelResponse } from "@vercel/node";
import { type ErrorShape, sendError } from "../httpResponse.js";
import type { ConsoleActor } from "./actor.js";

interface ScopableQuery<Q> {
  eq(column: string, value: string): Q;
  in(column: string, values: string[]): Q;
}

/** 기관으로 거르고, 담임이면 담당 학급으로 한 번 더 거른다. */
export function scopeQuery<Q extends ScopableQuery<Q>>(
  query: Q,
  actor: ConsoleActor,
  options: { classColumn: string },
): Q {
  const tenantScoped = query.eq("tenant_id", actor.tenantId);
  return actor.kind === "homeroom"
    ? tenantScoped.in(options.classColumn, actor.classIds)
    : tenantScoped;
}

export interface ScopeTarget {
  tenantId: string | null;
  classId?: string | null;
}

export function isInScope(actor: ConsoleActor, target: ScopeTarget): boolean {
  if (target.tenantId !== actor.tenantId) return false;
  if (actor.kind !== "homeroom") return true;
  return !!target.classId && actor.classIds.includes(target.classId);
}

/** 범위 밖이면 404 를 보내고 false 를 돌려준다. 호출부는 false 일 때 바로 return 한다. */
export function requireInScope(
  res: VercelResponse,
  errorShape: ErrorShape,
  actor: ConsoleActor,
  target: ScopeTarget,
): boolean {
  if (isInScope(actor, target)) return true;
  sendError(res, errorShape, 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
  return false;
}
