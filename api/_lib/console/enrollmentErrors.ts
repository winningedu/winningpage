// 학적 RPC(WC077 에서 WC087, WC094, WC096, WC098, WC099, WC068, 외래키 23503, 22023, 23514)의 에러를 코드가 붙은 HTTP 에러로 바꾼다.
// 코드는 supabase/migrations 의 b2b_student_enrollments, b2b_enrollment_change_requests,
// b2b_school_year_rollover 가 정한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";
import type { ConsoleActor } from "./actor.js";
import { maskName } from "./maskName.js";

interface Mapped {
  status: number;
  code: string;
  message: string;
}

const INVALID_CLASS: Mapped = {
  status: 400,
  code: "INVALID_CLASS",
  message: "학년, 학급 정보를 확인해 주세요.",
};

const MAPPED: Record<string, Mapped> = {
  WC077: {
    status: 409,
    code: "NUMBER_TAKEN",
    message: "이미 사용 중인 번호예요.",
  },
  WC078: {
    status: 409,
    code: "VERSION_CONFLICT",
    message: "다른 분이 먼저 바꿨어요. 새로 고침해 주세요.",
  },
  WC079: {
    status: 409,
    code: "ALREADY_ASSIGNED",
    message: "이미 학급이 정해져 있어요.",
  },
  WC080: {
    status: 400,
    code: "GROUP_NOT_REGISTERED",
    message: "등록되지 않은 그룹이에요.",
  },
  WC081: { status: 404, code: "NOT_FOUND", message: "학적을 찾을 수 없어요." },
  WC082: {
    status: 409,
    code: "REQUEST_PENDING",
    message: "이미 처리 중인 변경 신청이 있어요.",
  },
  WC083: {
    status: 404,
    code: "REQUEST_NOT_FOUND",
    message: "신청을 찾을 수 없거나 이미 처리됐어요.",
  },
  WC084: {
    status: 403,
    code: "NOT_APPROVER",
    message: "이 신청을 처리할 권한이 없어요.",
  },
  WC085: {
    status: 400,
    code: "REJECT_REASON_REQUIRED",
    message: "거절 사유를 입력해 주세요.",
  },
  WC086: {
    status: 409,
    code: "GROUP_HAS_STUDENTS",
    message: "재학생이 있는 그룹은 삭제할 수 없어요.",
  },
  WC087: {
    status: 404,
    code: "NOT_FOUND",
    message: "그룹을 찾을 수 없어요.",
  },
  WC094: {
    status: 403,
    code: "NOT_STUDENT",
    message: "학생 계정만 쓸 수 있어요.",
  },
  // 기타 소속 학생의 소속코드 이동(결정 96): WC068 코드 시도 한도, WC096 옮겨 갈 기관의 휴대폰 번호 중복, WC098 기타 소속 아님.
  WC068: {
    status: 429,
    code: "TOO_MANY_ATTEMPTS",
    message:
      "소속코드 확인을 너무 많이 시도했어요. 잠시 후 다시 시도해 주세요.",
  },
  WC096: {
    status: 409,
    code: "PHONE_TAKEN",
    message:
      "이 기관에 같은 휴대폰 번호로 가입한 계정이 있어요. 선생님께 문의해 주세요.",
  },
  WC098: {
    status: 403,
    code: "NOT_CATCH_ALL",
    message: "기타 소속 학생만 소속코드를 입력할 수 있어요.",
  },
  // 본사 학생 이동(fn_admin_move_student_tenant): WC099 같은 기관으로는 옮길 수 없다.
  WC099: {
    status: 400,
    code: "SAME_TENANT",
    message: "이미 이 기관에 속한 학생이에요.",
  },
  "23503": INVALID_CLASS,
  // 학급 이름 정규화(22023)와 학년, 번호 CHECK(23514)
  "22023": INVALID_CLASS,
  "23514": INVALID_CLASS,
};

export interface OccupantSlot {
  grade: string | null;
  className: string | null;
  number: number | null;
}

/** WC077 응답에 실을 점유 학생 정보. slot 은 막힌 학급과 번호, maskName 이면 이름을 가린다. */
export interface OccupantContext {
  slot: OccupantSlot;
  maskName: boolean;
}

/**
 * 알려진 코드면 응답을 보내고 true. 아니면 false 라서 호출부가 예외로 던진다.
 * WC077 의 DETAIL 은 그 번호를 쓰는 학생 이름이다(교 #200). occupant 를 넘긴 호출만 응답에 싣고,
 * 담임 이외에는 가린 이름을 쓴다(결정 30). 넘기지 않으면 이름은 응답에 나가지 않는다.
 */
export function sendEnrollmentRpcError(
  res: VercelResponse,
  error: { code?: string; details?: string | null } | null | undefined,
  occupant?: OccupantContext,
): boolean {
  const mapped = error?.code ? MAPPED[error.code] : undefined;
  if (!mapped) return false;
  const holder = error?.details || null;
  const extra =
    error?.code === "WC077" && occupant
      ? {
          occupant: {
            ...occupant.slot,
            displayName:
              holder && occupant.maskName ? maskName(holder) : holder,
          },
        }
      : undefined;
  sendError(res, "coded", mapped.status, mapped.message, mapped.code, extra);
  return true;
}

/** WC077 응답용: 막힌 학급의 학년과 이름을 읽어 점유 정보의 자리를 만든다. 학급이 없으면 undefined. */
export async function loadOccupantContext(
  admin: SupabaseClient,
  actor: ConsoleActor,
  classId: string | null,
  number: number | null,
): Promise<OccupantContext | undefined> {
  if (!classId) return undefined;
  const { data, error } = await admin
    .from("classes")
    .select("grade, name")
    .eq("id", classId)
    .eq("tenant_id", actor.tenantId)
    .maybeSingle();
  if (error || !data) return undefined;
  return {
    slot: { grade: data.grade, className: data.name, number },
    maskName: actor.kind !== "homeroom",
  };
}
