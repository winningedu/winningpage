// PUT /api/admin/members/:id/tenant  { tenantId: uuid | null }
//
// 회원 소속 배정과 해제. profiles.tenant_id 는 트리거(WC070)가 직접 UPDATE 를 막아 fn_admin_set_profile_tenant 로만 바꾼다.
// 그 함수가 auth.uid() 로 members 수정 권한(WC072)을 보고 변경자를 남기므로, 서비스 롤이 아니라 관리자 본인 토큰 클라이언트로 부른다.
// 스쿨멘토의 학생은 소속만 비우면 학적이 옛 기관에 남아 막는다(「기타」로 옮기게 한다). 위닝은 소속 없음이 개인 회원이다.

import { z } from "zod";
import { SITES } from "../../../../../src/config/sites.js";
import { getBearerToken } from "../../../../_lib/adminAuth.js";
import { defineHandler, requireUserId } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";
import {
  canViewTenantNames,
  findMemberStub,
  withTenantName,
} from "../../../../_lib/members/member.js";
import { getSiteKey } from "../../../../_lib/site.js";
import { createSupabaseUserClient } from "../../../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

const querySchema = z.object({ id: z.guid() });
const bodySchema = z.strictObject({ tenantId: z.guid().nullable() });

export default defineHandler({
  methods: ["PUT"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "members" },
  unhandledMessage: "소속을 바꾸지 못했습니다.",
  logLabel: "[admin/members/id/tenant]",
  headers: { "Cache-Control": "no-store" },
  query: querySchema,
  body: bodySchema,
  handler: async (req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { id } = ctx.query;
    const { tenantId } = ctx.body;
    const member = await findMemberStub(admin, res, id);
    if (!member) return;
    // 쓰기 전에 조회해 둔다(쓴 뒤에 권한 조회가 실패해 500 이 되지 않게).
    const canViewTenants = await canViewTenantNames(admin, requireUserId(ctx));

    const siteKey = getSiteKey();
    if (
      SITES[siteKey].features.studentEnrollment &&
      siteKey === "schoolmentor" &&
      member.member_type === "student" &&
      tenantId === null
    ) {
      sendError(
        res,
        "problem",
        400,
        "학생은 소속 없음으로 바꿀 수 없어요. 「기타」로 옮겨 주세요.",
        "STUDENT_TENANT_REQUIRED",
      );
      return;
    }

    const userClient = createSupabaseUserClient(getBearerToken(req));
    const { error } = await userClient.rpc("fn_admin_set_profile_tenant", {
      p_profile_id: id,
      // 생성 타입이 인자를 string 으로 좁혀 두었지만 실제 시그니처는 nullable uuid 다(null 은 해제).
      p_tenant_id: tenantId as string,
    });
    if (error) {
      if (error.code === "23505") {
        sendError(
          res,
          "problem",
          409,
          "이 기관에 같은 휴대폰 번호의 회원이 이미 있어요. 확인 후 다시 옮겨 주세요.",
          "PHONE_TAKEN",
        );
        return;
      }
      if (error.code === "WC100") {
        sendError(
          res,
          "problem",
          409,
          "이 학생은 올해 학적이 다른 기관에 있어요. 학생 기관 이동 화면에서 옮겨 주세요.",
          "OTHER_TENANT_ENROLLMENT",
        );
        return;
      }
      if (error.code === "WC072") {
        sendError(
          res,
          "problem",
          403,
          "회원 관리 수정 권한이 없습니다.",
          "FORBIDDEN",
        );
        return;
      }
      if (error.message === "tenant_not_found") {
        sendError(
          res,
          "problem",
          404,
          "기관을 찾을 수 없어요.",
          "TENANT_NOT_FOUND",
        );
        return;
      }
      throw new Error("set profile tenant failed");
    }

    const { data, error: readError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (readError || !data) throw new Error("profile re-read failed");
    res.status(200).json(await withTenantName(admin, data, canViewTenants));
  },
});
