// /api/admin/tenants 아래 계약 종료 회원 삭제 라우트(member-purge, member-purge-preview, purge-logs). 관리자 앱이 .route("/tenants", tenantsPurge) 로 붙인다.
// 글자 그대로인 경로라 tenants-detail.ts 의 /:id 보다 먼저 붙인다. 요청 검증과 응답 모양은 shared/tenants/purge.ts 를 따른다.
//
// POST /member-purge { tenantId, targetIds }: 본사 관리자가 계약 종료 기관 하나의 학생 개인정보 삭제(익명화)를 수동으로 실행한다(사 #162, #176).
//   크론은 하지 않는다. 유예 종료일이 지나지 않았으면 409 NOT_YET 과 그 날짜를 돌려주고, 유료 전환 학생은
//   제외한다. 본사가 미리보기에서 고른 targetIds 만 지우고(필수), 목록 밖 학생은 지우지 않고 skipped 로 센다. 판단과 member_purge 로그는
//   fn_anonymize_expired_b2b_members 가 하고, 로그의 실행자는 이 관리자다. 권한: 메뉴 memberPurge(tenants 별칭) edit.
// GET /member-purge-preview?tenantId=: 본사가 계약 종료 기관 하나의 회원 삭제 대상을 미리 본다(사 #162, 결정 102.1, 102.3, 102.4). 계약 종료일, 유예 종료일,
//   삭제 가능일(유예 종료 다음 날)과 D-day, 학생 목록(가린 이름, 학년, 반, 번호, 회원번호, 유료 전환 보호 표시)을 돌려준다.
//   이름은 가려서 내보내므로 풀어 본 것이 아니라 접근 로그를 남기지 않는다. 후보 조건은 실행 함수(fn_anonymize_expired_b2b_members)와
//   같고, D-day 의 오늘은 DB 가 기관 시간대(tenants.time_zone)로 센 local_today 다. 학생이 없는 기관은 DB 가 날짜만 담은 한 줄(profile_id 없음)을 준다.
//   권한: 메뉴 memberPurge(tenants 별칭) view 이상. 스쿨멘토 사이트에서만 열린다.
// GET /purge-logs[?tenantId=]: 본사가 계약 종료 회원 삭제 로그를 조회한다(사 #163, #177). 실행 일시, 실행자(로그인 아이디, 본사 실행이면 이메일), 기관, 계약 종료일, 삭제 건수,
//   제외(유료 전환) 건수, 직접 제외 건수(skipped_count, 예전 로그는 0), 삭제한 회원번호 목록을 돌려주고 이름과 연락처는 담지 않는다. 1년이 지난 로그는
//   fn_purge_b2b_retention 이 지운다. 파일 내려받기는 화면이 이 목록으로 만든다. 권한: 메뉴 memberPurgeLogs(tenants 별칭) view 이상.

import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import {
  memberPurgeBody,
  memberPurgePreviewQuery,
  PURGE_ERROR,
  PURGE_LOG_LIMIT,
  type PurgeLogEntry,
  type PurgePreview,
  type PurgeResult,
  purgeLogsQuery,
} from "../../../shared/tenants/purge.js";
import { maskName } from "../../_lib/console/maskName.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { nodeHeaders } from "../../_lib/hono/request.js";
import { validate } from "../../_lib/hono/validate.js";
import { getBearerToken } from "../../_lib/serviceAccess.js";
import { isSchoolmentorSite } from "../../_lib/site.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
}

function dayNumberToYmd(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10); // tz-literal-ok: Date.UTC 기준 달력 계산이라 시간대와 무관하다
}

const siteNotFound = () =>
  new ProblemError(404, "찾을 수 없어요.", PROBLEM_CODE.NOT_FOUND);

interface PurgeLogRow {
  id: string;
  created_at: string;
  actor_login_id: string | null;
  actor_email: string | null;
  tenant_id: string | null;
  meta: {
    contract_end_date?: string;
    deleted_count?: number;
    excluded_count?: number;
    skipped_count?: number;
    member_ids?: string[];
  };
  tenants: { code: string; name: string } | null;
}

const memberPurgeGuard = admin({
  permission: { key: "memberPurge" },
  // fn_anonymize_expired_b2b_members 가 member_purge 행을 직접 남긴다.
  audit: false,
  unhandledMessage: "계약 종료 회원 삭제를 하지 못했습니다.",
  logLabel: "[admin/tenants/member-purge]",
});
const previewGuard = admin({
  permission: { key: "memberPurge" },
  unhandledMessage: "삭제 대상을 불러오지 못했습니다.",
  logLabel: "[admin/tenants/member-purge-preview]",
});
const purgeLogsGuard = admin({
  permission: { key: "memberPurgeLogs" },
  unhandledMessage: "삭제 로그를 불러오지 못했습니다.",
  logLabel: "[admin/tenants/purge-logs]",
});

export const tenantsPurge = adminFactory
  .createApp()
  .post(
    "/member-purge",
    memberPurgeGuard,
    validate("json", memberPurgeBody),
    async (c) => {
      if (!isSchoolmentorSite()) throw siteNotFound();
      const userId = c.var.userId as string;
      const { tenantId, targetIds } = c.req.valid("json");

      // 실행자 이메일은 로그에 남긴다. 관리자 판정은 user 를 싣지 않아 토큰으로 다시 읽는다.
      const { data: authData } = await c.var.supabaseAdmin.auth.getUser(
        getBearerToken({ headers: nodeHeaders(c) }),
      );

      const { data, error } = await c.var.supabaseAdmin.rpc(
        "fn_anonymize_expired_b2b_members",
        {
          p_tenant: tenantId,
          p_actor_profile: userId,
          p_actor_email: authData.user?.email ?? undefined,
          p_targets: targetIds,
        },
      );
      if (error) throw new Error("member purge failed");
      const result = data?.[0];
      if (!result) throw new Error("fn_anonymize_expired_b2b_members no row");

      if (result.not_yet) {
        throw new ProblemError(
          409,
          "아직 삭제할 수 없는 기관입니다. 유예 종료일 다음 날부터 삭제할 수 있습니다.",
          PURGE_ERROR.NOT_YET,
          { graceEndsOn: result.grace_end },
        );
      }

      return c.json({
        deleted: Number(result.members_anonymized),
        excluded: Number(result.members_protected),
        skipped: Number(result.members_skipped),
        notProcessed: Number(result.not_processed),
      } satisfies PurgeResult);
    },
  )
  .all("/member-purge", methodNotAllowed("POST"))
  .get(
    "/member-purge-preview",
    previewGuard,
    validate("query", memberPurgePreviewQuery),
    async (c) => {
      if (!isSchoolmentorSite()) throw siteNotFound();

      const { tenantId } = c.req.valid("query");

      const { data, error } = await c.var.supabaseAdmin.rpc(
        "fn_member_purge_preview",
        { p_tenant: tenantId },
      );
      if (error) throw new Error("member purge preview failed");
      const rows = data ?? [];
      const first = rows[0];

      const graceEnd = first?.grace_end ?? null;
      const deletableDay = graceEnd === null ? null : dayNumber(graceEnd) + 1;

      return c.json({
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
      } satisfies PurgePreview);
    },
  )
  .all("/member-purge-preview", methodNotAllowed("GET"))
  .get(
    "/purge-logs",
    purgeLogsGuard,
    validate("query", purgeLogsQuery),
    async (c) => {
      const { tenantId } = c.req.valid("query");
      let query = c.var.supabaseAdmin
        .from("admin_access_logs")
        .select(
          "id, created_at, actor_login_id, actor_email, tenant_id, meta, tenants(code, name)",
        )
        .eq("action", "member_purge");
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(PURGE_LOG_LIMIT);
      if (error) throw new Error("purge logs read failed");

      return c.json({
        items: ((data ?? []) as unknown as PurgeLogRow[]).map(
          (row) =>
            ({
              id: row.id,
              executedAt: row.created_at,
              executedBy: row.actor_login_id ?? row.actor_email,
              tenant: row.tenants
                ? {
                    id: row.tenant_id,
                    code: row.tenants.code,
                    name: row.tenants.name,
                  }
                : null,
              contractEndDate: row.meta.contract_end_date ?? null,
              deletedCount: row.meta.deleted_count ?? 0,
              excludedCount: row.meta.excluded_count ?? 0,
              skippedCount: row.meta.skipped_count ?? 0,
              memberIds: row.meta.member_ids ?? [],
            }) satisfies PurgeLogEntry,
        ),
      });
    },
  )
  .all("/purge-logs", methodNotAllowed("GET"));
