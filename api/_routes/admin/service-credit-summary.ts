// /api/admin/service-credit-summary 의 GET. 관리자 앱(api/_routes/admin/app.ts)이 .route("/service-credit-summary", serviceCreditSummary) 로 붙인다.
// GET ?profileId=<uuid>
// Authorization: Bearer <supabase access token>   (관리자)
// 권한: 메뉴 serviceCreditAdjust(GET view).
//
// 고객 한 명의 6개 서비스(diagnose, target, growth, suhaeng, inquiry, selfeval) 이용횟수 현황.
// 이용권이 없는 서비스도 행은 나오며 총/사용/잔여는 0, 만료는 null 이다.
//
// 응답 200 { student: { id, name, email }, items: ServiceCreditRow[] } (shared/service-credit/contract.ts)
// 오류(problem): 400 VALIDATION_FAILED(profileId 없음 또는 uuid 아님), 404 PROFILE_NOT_FOUND, 401/403 인증, 405 METHOD_NOT_ALLOWED, 500
//
// 조립은 api/_lib/service-credit/summary.ts.

import {
  SERVICE_CREDIT_ERROR,
  type ServiceCreditSummary,
  summaryQuery,
} from "../../../shared/service-credit/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { readServiceCredits } from "../../_lib/service-credit/summary.js";

const guard = admin({
  permission: { key: "serviceCreditAdjust" },
  unhandledMessage: "서비스 이용횟수 조회에 실패했습니다.",
  logLabel: "admin/service-credit-summary",
});

export const serviceCreditSummary = adminFactory
  .createApp()
  .get("/", guard, validate("query", summaryQuery), async (c) => {
    const db = c.var.supabaseAdmin;
    const { profileId } = c.req.valid("query");
    // 화면이 새로고침해도 학생 이름을 보이도록 같이 돌려준다.
    const { data: student, error } = await db
      .from("profiles")
      .select("id, name, email")
      .eq("id", profileId)
      .maybeSingle();
    if (error) throw new Error(`profiles 조회 실패: ${error.message}`);
    if (!student) {
      throw new ProblemError(
        404,
        "회원을 찾을 수 없습니다.",
        SERVICE_CREDIT_ERROR.PROFILE_NOT_FOUND,
      );
    }
    return c.json({
      student: { id: student.id, name: student.name, email: student.email },
      items: await readServiceCredits(db, profileId),
    } satisfies ServiceCreditSummary);
  })
  .all("/", methodNotAllowed("GET"));
