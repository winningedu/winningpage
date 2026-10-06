// 성장설계 실행계획 항목 상태 변경 규칙(No.161, 164). 순수 함수.
// 학생 직접 update 가드(fn_growth_plan_items_guard_student_update)와 같은 방향의 규칙을 API 에서 먼저 판정한다.

import type { PlanItemAction, PlanItemRow } from "./types.js";

export type PlanItemValidation =
  | { ok: true; action: PlanItemAction }
  | { ok: false; reason: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isRealDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validatePlanItemBody(raw: unknown): PlanItemValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "본문이 객체가 아니에요" };
  }
  const body = raw as Record<string, unknown>;
  if (!isUuid(body.itemId)) {
    return { ok: false, reason: "itemId 가 올바르지 않아요" };
  }
  const itemId = body.itemId;

  switch (body.action) {
    case "check":
      if (typeof body.done !== "boolean") {
        return { ok: false, reason: "done 은 true 또는 false 여야 해요" };
      }
      return { ok: true, action: { action: "check", itemId, done: body.done } };
    case "set-deadline":
      if (body.deadline !== null && !isRealDate(body.deadline)) {
        return {
          ok: false,
          reason: "deadline 은 null 또는 실제 날짜(YYYY-MM-DD)여야 해요",
        };
      }
      return {
        ok: true,
        action: { action: "set-deadline", itemId, deadline: body.deadline },
      };
    case "program-done":
      // 하위 프로그램이 서버 간으로만 부르는 액션이다(complete.ts). HTTP 로는 받지 않는다.
      return { ok: false, reason: "허용되지 않는 액션" };
    default:
      return { ok: false, reason: "알 수 없는 action 이에요" };
  }
}

export type MutationDecision =
  | { kind: "update"; patch: Partial<PlanItemRow> }
  | {
      kind: "noop";
      reason:
        | "already_done"
        | "already_pending"
        | "same_deadline"
        | "duplicate_confirm";
    }
  | { kind: "reject"; code: string; message: string };

export function decideMutation(
  item: PlanItemRow,
  action: PlanItemAction,
  nowIso: string,
): MutationDecision {
  switch (action.action) {
    case "check": {
      if (action.done) {
        if (item.status === "done")
          return { kind: "noop", reason: "already_done" };
        return {
          kind: "update",
          patch: {
            status: "done",
            done_source_program: "manual",
            done_ref_id: null,
            done_at: nowIso,
          },
        };
      }
      if (item.status === "pending") {
        return { kind: "noop", reason: "already_pending" };
      }
      if (
        item.done_source_program === "self" ||
        item.done_source_program === "deep"
      ) {
        return {
          kind: "reject",
          code: "PROGRAM_DONE_LOCKED",
          message: "하위 프로그램에서 확정된 항목은 여기서 되돌릴 수 없어요",
        };
      }
      return {
        kind: "update",
        patch: {
          status: "pending",
          done_source_program: null,
          done_ref_id: null,
          done_at: null,
        },
      };
    }
    case "set-deadline": {
      if (item.period !== "course_selection") {
        return {
          kind: "reject",
          code: "DEADLINE_NOT_ALLOWED",
          message: "마감일은 과목 선택 시기 항목에만 정할 수 있어요",
        };
      }
      if (item.deadline === action.deadline) {
        return { kind: "noop", reason: "same_deadline" };
      }
      return { kind: "update", patch: { deadline: action.deadline } };
    }
    case "program-done": {
      if (item.program !== action.program) {
        return {
          kind: "reject",
          code: "PROGRAM_MISMATCH",
          message: "이 항목을 맡은 프로그램이 아니에요",
        };
      }
      if (item.status === "done") {
        if (item.done_ref_id === action.refId) {
          return { kind: "noop", reason: "duplicate_confirm" };
        }
        // 이미 완료된 항목은 먼저 확정된 것을 유지한다(수동 완료, 다른 산출물 모두).
        return { kind: "noop", reason: "already_done" };
      }
      return {
        kind: "update",
        patch: {
          status: "done",
          done_source_program: action.program,
          done_ref_id: action.refId,
          done_at: nowIso,
        },
      };
    }
  }
}
