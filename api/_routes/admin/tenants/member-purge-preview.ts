// GET /api/admin/tenants/member-purge-preview?tenantId=
//
// 본사가 계약 종료 기관 하나의 회원 삭제 대상을 미리 본다(사 #162, 결정 102.1, 102.3, 102.4). 계약 종료일, 유예 종료일,
// 삭제 가능일(유예 종료 다음 날)과 D-day, 학생 목록(가린 이름, 학년, 반, 번호, 회원번호, 유료 전환 보호 표시)을 돌려준다.
// 이름은 가려서 내보내므로 풀어 본 것이 아니라 접근 로그를 남기지 않는다. 후보 조건은 실행 함수(fn_anonymize_expired_b2b_members)와
// 같고, D-day 의 오늘은 DB 가 기관 시간대(tenants.time_zone)로 센 local_today 다. 학생이 없는 기관은 DB 가 날짜만 담은 한 줄(profile_id 없음)을 준다.
// 권한: 관리자 + 메뉴 memberPurge(tenants 별칭) view 이상. 판정은 defineHandler 의 permission 옵션이 한다. 스쿨멘토 사이트에서만 열린다.

import { z } from "zod";
import { maskName } from "../../../_lib/console/maskName.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import { isSchoolmentorSite } from "../../../_lib/site.js";

export const config = { runtime: "nodejs" };

const querySchema = z.object({ tenantId: z.guid() });
const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
}

function dayNumberToYmd(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10); // tz-literal-ok: Date.UTC 기준 달력 계산이라 시간대와 무관하다
}

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "memberPurge" },
  query: querySchema,
  unhandledMessage: "삭제 대상을 불러오지 못했습니다.",
  logLabel: "[admin/tenants/member-purge-preview]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      sendError(res, "problem", 404, "찾을 수 없어요.", "NOT_FOUND");
      return;
    }

    const { tenantId } = ctx.query;

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
      contractEnd: first?.contract_end ?? null,
      graceEnd,
      deletableFrom:
        deletableDay === null ? null : dayNumberToYmd(deletableDay),
      dDay:
        deletableDay === null || first?.local_today == null
          ? null
          : deletableDay - dayNumber(first.local_today),
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
