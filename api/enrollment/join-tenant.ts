// POST /api/enrollment/join-tenant  { code, grade, className, groupName?, number? }
//
// 기타 소속 학생이 소속코드로 기관을 스스로 옮긴다(결정 96). 학생 id 는 토큰에서만 정하고 기관은 서버가 코드로 다시 찾는다.
// 반은 필수, 번호는 선택 1~99(결정 98.10)이다. 그룹은 화면이 학원일 때만 받고 DB 가 등록 여부를 본다(WC080).
// 프로필, 학적, 열린 변경 신청 정리는 DB 함수 한 번의 트랜잭션이라 실패하면 소속이 그대로다. 위닝 배포에서는 404.

import { sendEnrollmentRpcError } from "../_lib/console/enrollmentErrors.js";
import {
  isEnrollmentGrade,
  isEnrollmentNumber,
} from "../_lib/console/enrollmentInput.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { isSchoolmentorSite } from "../_lib/site.js";

export const config = { runtime: "nodejs" };

interface JoinTenant {
  code: string;
  grade: string;
  groupName: string | null;
  className: string;
  number: number | null;
}

type Parsed =
  | { ok: true; value: JoinTenant }
  | { ok: false; code: string; message: string };

const BAD_REQUEST = {
  ok: false,
  code: "BAD_REQUEST",
  message: "입력 값을 확인해 주세요.",
} as const;

function parseBody(body: unknown): Parsed {
  const { code, grade, groupName, className, number } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof code !== "string" || !code.trim()) return BAD_REQUEST;
  if (!isEnrollmentGrade(grade)) return BAD_REQUEST;
  if (typeof className !== "string" || !className.trim()) {
    return {
      ok: false,
      code: "CLASS_REQUIRED",
      message: "반을 입력해 주세요.",
    };
  }
  if (groupName != null && typeof groupName !== "string") return BAD_REQUEST;
  if (number != null && !isEnrollmentNumber(number)) return BAD_REQUEST;
  return {
    ok: true,
    value: {
      code: code.trim(),
      grade,
      groupName: (groupName as string | null | undefined) || null,
      className: className.trim(),
      number: (number as number | null | undefined) ?? null,
    },
  };
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "소속을 옮기지 못했어요. 잠시 후 다시 시도해 주세요.",
  unhandledCode: "INTERNAL",
  logLabel: "[enrollment/join-tenant]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      sendError(res, "coded", 404, "찾을 수 없어요.", "NOT_FOUND");
      return;
    }
    const studentId = requireUserId(ctx);
    const parsed = parseBody(req.body);
    if (!parsed.ok) {
      sendError(res, "coded", 400, parsed.message, parsed.code);
      return;
    }
    const body = parsed.value;

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_catch_all_join_tenant",
      {
        p_user: studentId,
        p_code: body.code,
        p_grade: body.grade,
        p_group_name: body.groupName as string,
        p_class_name: body.className,
        p_number: body.number as number,
      },
    );
    if (error) {
      if (sendEnrollmentRpcError(res, error)) return;
      throw new Error("fn_catch_all_join_tenant failed");
    }
    const row = data?.[0];
    if (!row) {
      sendError(
        res,
        "coded",
        404,
        "소속코드를 다시 확인해 주세요.",
        "TENANT_NOT_FOUND",
      );
      return;
    }
    res.status(200).json({
      ok: true,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      enrollmentId: row.enrollment_id,
    });
  },
});
