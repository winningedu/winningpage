// GET /api/admin/tenants/member-purge-preview?tenantId=
//
// 본사가 계약 종료 기관 하나의 회원 삭제 대상을 미리 본다(사 #162, 결정 102.1, 102.3, 102.4). 계약 종료일, 유예 종료일,
// 삭제 가능일(유예 종료 다음 날)과 D-day, 학생 목록(가린 이름, 학년, 반, 번호, 회원번호, 유료 전환 보호 표시)을 돌려준다.
// 이름은 가려서 내보내므로 풀어 본 것이 아니라 접근 로그를 남기지 않는다. 후보 조건은 실행 함수(fn_anonymize_expired_b2b_members)와
// 같고, 날짜 계산은 KST 다. 학생이 없는 기관은 DB 가 날짜만 담은 한 줄(profile_id 없음)을 준다.
// 권한: 로그인 + HQ 권한 tenants view 이상(fn_admin_effective_permissions). 스쿨멘토 사이트에서만 열린다.

import { maskName } from "../../../_lib/console/maskName.js";
import { hasAdminViewPermission } from "../../../_lib/console/proxy.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import { isUuid } from "../../../_lib/service-credit/adjust.js";
import { isSchoolmentorSite } from "../../../_lib/site.js";

export const config = { runtime: "nodejs" };

const TENANTS_RESOURCE_KEY = "tenants";
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function dayNumber(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
}

function todayKstDayNumber(): number {
  return Math.floor((Date.now() + KST_OFFSET_MS) / DAY_MS);
}

function dayNumberToYmd(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "삭제 대상을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/tenants/member-purge-preview]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      sendError(res, "coded", 404, "찾을 수 없어요.", "NOT_FOUND");
      return;
    }
    if (
      !(await hasAdminViewPermission(
        ctx.supabaseAdmin,
        ctx.userId as string,
        TENANTS_RESOURCE_KEY,
      ))
    ) {
      sendError(res, "coded", 403, "기관 관리 권한이 없습니다.", "FORBIDDEN");
      return;
    }

    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !isUuid(tenantId)) {
      sendError(res, "coded", 400, "기관을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_member_purge_preview",
      { p_tenant: tenantId },
    );
    if (error) throw new Error("member purge preview failed");
    const rows = data ?? [];
    const first = rows[0];

    const graceEnd = first?.grace_end ?? null;
    const deletableDay = graceEnd === null ? null : dayNumber(graceEnd) + 1;

    res.status(200).json({
      ok: true,
      contractEnd: first?.contract_end ?? null,
      graceEnd,
      deletableFrom:
        deletableDay === null ? null : dayNumberToYmd(deletableDay),
      dDay: deletableDay === null ? null : deletableDay - todayKstDayNumber(),
      students: rows
        .filter((row) => row.profile_id !== null)
        .map((row) => ({
          id: row.profile_id,
          name: maskName(row.name ?? ""),
          grade: row.grade,
          classLabel: row.class_label,
          number: row.number,
          protected: row.protected === true,
        })),
    });
  },
});
