// POST /api/enrollment/request-change  { grade?, groupName?, className?, number? }
//
// 학생이 자기 학적(학년, 학급, 번호) 변경을 신청한다(사 #110). 학생 id 는 받지 않는다.
// 학생 본인 토큰의 클라이언트로 fn_request_enrollment_change 를 불러 auth.uid() 가 학생이 되게 한다.
// 열린 신청은 학생당 하나이고, 승인은 콘솔의 decide 라우트가 한다.

import { sendEnrollmentRpcError } from "../_lib/console/enrollmentErrors.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { createSupabaseUserClient } from "../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

const GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"] as const;

interface ChangeRequest {
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
}

// 비운 학급은 지금 값을 유지한다는 뜻이다. 빈 문자열은 null 과 같게 보낸다.
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseBody(body: unknown): ChangeRequest | null {
  const { grade, groupName, className, number } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (grade != null && !GRADES.some((g) => g === grade)) return null;
  if (groupName != null && typeof groupName !== "string") return null;
  if (className != null && typeof className !== "string") return null;
  if (
    number != null &&
    !(
      Number.isInteger(number) &&
      (number as number) >= 1 &&
      (number as number) <= 99
    )
  ) {
    return null;
  }
  const parsed: ChangeRequest = {
    grade: (grade as string | null | undefined) ?? null,
    groupName: blankToNull(groupName as string | null | undefined),
    className: blankToNull(className as string | null | undefined),
    number: (number as number | null | undefined) ?? null,
  };
  const changesNothing = Object.values(parsed).every(
    (v) => v === null || v === "",
  );
  return changesNothing ? null : parsed;
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "변경 신청을 보내지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[enrollment/request-change]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    requireUserId(ctx);
    const body = parseBody(req.body);
    if (!body) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data: changeId, error } = await createSupabaseUserClient(
      ctx.token as string,
    ).rpc("fn_request_enrollment_change", {
      p_to_grade: body.grade as string,
      p_to_group_name: body.groupName as string,
      p_to_class_name: body.className as string,
      p_to_number: body.number as number,
    });
    if (error) {
      if (sendEnrollmentRpcError(res, error)) return;
      throw new Error("fn_request_enrollment_change failed");
    }
    if (typeof changeId !== "string") {
      throw new Error("fn_request_enrollment_change returned no id");
    }

    res.status(200).json({ ok: true, changeId });
  },
});
