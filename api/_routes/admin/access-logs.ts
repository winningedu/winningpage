// /api/admin/access-logs 아래 개인정보 접근 로그 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/access-logs", accessLogs) 로 붙인다.
// 요청 검증과 응답 모양은 shared/access-log/contract.ts 를 따른다.
//
// POST /api/admin/access-logs  { action, resourceKey, reason, rowCount?, targetId? } -> 201 { id, createdAt }
// GET /api/admin/access-logs[?tenantCode=&from=&to=&kind=&page=]  (from 포함, to 미포함인 ISO Z 시각)
//
// 본사 개인정보 접근 로그 화면의 목록(사 #170, 교 #66, 결정 102.5). 소속코드, 교사 이름과 로그인 아이디,
// 가린 교사 전화번호, 구분, 가린 학생 이름, 내용을 한 줄씩 돌려준다. teachers 는 authenticated 에 막혀 있어
// 뷰로는 붙일 수 없으므로 service_role 로 읽는다.
// 권한: 메뉴 권한 adminAccessLogs view(admin() 가드 permission) + fn_is_super_admin. 뒤쪽은 admin_access_logs 의 RLS 와 같은 데이터 술어다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCESS_LOG_PAGE_SIZE,
  type AccessLogCreated,
  type AccessLogPage,
  accessLogsQuery,
  accessLogWriteBody,
} from "../../../shared/access-log/contract.js";
import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import {
  actionsOfKind,
  contentSummary,
  kindLabel,
  kindOf,
  maskTeacherPhone,
} from "../../_lib/accessLog/describe.js";
import { maskName } from "../../_lib/console/maskName.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

interface LogRow {
  id: string;
  created_at: string;
  action: string;
  resource_key: string;
  reason: string | null;
  row_count: number | null;
  target_id: string | null;
  actor_email: string | null;
  actor_kind: string | null;
  actor_login_id: string | null;
  profile_id: string | null;
  teacher_id: string | null;
  proxy_session_id: string | null;
  meta: Record<string, unknown> | null;
  tenants: { code: string } | null;
}

interface TeacherRow {
  id: string;
  name: string;
  phone: string | null;
  login_id: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  member_type: string | null;
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))];
}

async function readById<T extends { id: string }>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await admin.from(table).select(columns).in("id", ids);
  if (error) throw new Error(`${table} read failed`);
  return new Map(((data ?? []) as unknown as T[]).map((row) => [row.id, row]));
}

const getGuard = admin({
  permission: { key: "adminAccessLogs" },
  unhandledMessage: "접근 로그를 불러오지 못했습니다.",
  logLabel: "[admin/access-logs]",
});

// 개인정보 반출 게이트의 접근 기록 적재. 감사 로그라 멱등 키 없이 제출마다 한 줄이다(추가만 되고,
// 클라이언트는 재시도하지 않으며 게이트가 이중 제출을 막는다).
const postGuard = admin({
  // 기록은 그 메뉴를 읽은 일(내려받기, 마스킹 해제)이므로 그 메뉴의 view 면 된다. edit 를 요구하면 조회 권한자는 내려받지 못한다.
  // 키는 본문의 resourceKey 다. 본문을 못 읽거나 문자열이 아니면 빈 키라 권한 판정에서 403 이다(검증보다 먼저 판정한다).
  permission: {
    key: async (c) => {
      const body: unknown = await c.req.json().catch(() => undefined);
      const resourceKey = (body as { resourceKey?: unknown } | null | undefined)
        ?.resourceKey;
      return typeof resourceKey === "string" ? resourceKey : "";
    },
    level: "view",
  },
  // 이 라우트가 곧 접근 로그 적재라 자동 감사 행을 따로 남기지 않는다.
  audit: false,
  unhandledMessage: "접근 기록을 남기지 못했습니다.",
  logLabel: "[admin/access-logs]",
});

export const accessLogs = adminFactory
  .createApp()
  .get("/", getGuard, validate("query", accessLogsQuery), async (c) => {
    // 메뉴 권한이 아니라 데이터 술어다(admin_access_logs 의 RLS 와 같다).
    const { data: isSuper, error } = await c.var.supabaseAdmin.rpc(
      "fn_is_super_admin",
      { p_profile_id: c.var.userId },
    );
    if (error) throw new Error("super admin check failed");
    if (isSuper !== true) {
      throw new ProblemError(
        403,
        "최고 관리자만 볼 수 있습니다.",
        PROBLEM_CODE.FORBIDDEN,
      );
    }

    const filter = c.req.valid("query");

    let tenantId: string | null = null;
    if (filter.tenantCode) {
      const { data: tenant, error: tenantError } = await c.var.supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("code", filter.tenantCode)
        .maybeSingle();
      if (tenantError) throw new Error("tenant read failed");
      if (!tenant) {
        return c.json({
          items: [],
          page: filter.page,
          hasNext: false,
        } satisfies AccessLogPage);
      }
      tenantId = (tenant as { id: string }).id;
    }

    let query = c.var.supabaseAdmin
      .from("admin_access_logs")
      .select(
        "id, created_at, action, resource_key, reason, row_count, target_id, actor_email, actor_kind, actor_login_id, profile_id, teacher_id, proxy_session_id, meta, tenants(code)",
      );
    if (tenantId) query = query.eq("tenant_id", tenantId);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.to) query = query.lt("created_at", filter.to);
    if (filter.kind) query = query.in("action", actionsOfKind(filter.kind));
    const offset = (filter.page - 1) * ACCESS_LOG_PAGE_SIZE;
    // 한 줄 더 읽어 다음 쪽이 있는지 안다.
    const { data, error: readError } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + ACCESS_LOG_PAGE_SIZE);
    if (readError) throw new Error("access logs read failed");
    const all = (data ?? []) as unknown as LogRow[];
    const rows = all.slice(0, ACCESS_LOG_PAGE_SIZE);

    const teacherIds = unique(rows.map((r) => r.teacher_id));
    const profileIds = unique(rows.flatMap((r) => [r.profile_id, r.target_id]));
    const [teachers, profiles] = await Promise.all([
      readById<TeacherRow>(
        c.var.supabaseAdmin,
        "teachers",
        "id, name, phone, login_id",
        teacherIds,
      ),
      readById<ProfileRow>(
        c.var.supabaseAdmin,
        "profiles",
        "id, name, member_type",
        profileIds,
      ),
    ]);

    return c.json({
      items: rows.map((row) => {
        const teacher = row.teacher_id ? teachers.get(row.teacher_id) : null;
        const actor = row.profile_id ? profiles.get(row.profile_id) : null;
        const target = row.target_id ? profiles.get(row.target_id) : null;
        const kind = kindOf(row.action);
        return {
          id: row.id,
          createdAt: row.created_at,
          tenantCode: row.tenants?.code ?? null,
          actorName: actor?.name ?? null,
          actorEmail: row.actor_email,
          reason: row.reason,
          teacherName: teacher?.name ?? null,
          teacherLoginId: teacher?.login_id ?? row.actor_login_id,
          teacherPhone: maskTeacherPhone(teacher?.phone ?? null),
          kind,
          kindLabel: kindLabel(kind),
          targetStudentName:
            target?.member_type === "student" && target.name
              ? maskName(target.name)
              : null,
          content: contentSummary({
            action: row.action,
            resourceKey: row.resource_key,
            rowCount: row.row_count,
            meta: row.meta,
          }),
          isProxy:
            row.proxy_session_id !== null || row.actor_kind === "hq_proxy",
        };
      }),
      page: filter.page,
      hasNext: all.length > ACCESS_LOG_PAGE_SIZE,
    } satisfies AccessLogPage);
  })
  .post("/", postGuard, validate("json", accessLogWriteBody), async (c) => {
    const body = c.req.valid("json");
    const profileId = c.var.userId as string;
    // 실행자 이메일은 관리자 판정에서 이미 읽었다.
    const email = c.var.userEmail;
    if (!email) throw new Error("auth user lookup failed");

    const { data, error } = await c.var.supabaseAdmin
      .from("admin_access_logs")
      .insert({
        profile_id: profileId,
        actor_email: email,
        action: body.action,
        resource_key: body.resourceKey,
        reason: body.reason,
        row_count: body.rowCount ?? null,
        target_id: body.targetId ?? null,
      })
      .select("id, created_at")
      .single();
    if (error || !data) throw new Error("access log insert failed");

    return c.json(
      { id: data.id, createdAt: data.created_at } satisfies AccessLogCreated,
      201,
    );
  })
  .all("/", methodNotAllowed("GET", "POST"));
