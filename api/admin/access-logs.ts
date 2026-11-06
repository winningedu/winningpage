// GET /api/admin/access-logs[?tenantCode=&from=&to=&kind=&page=]
//
// 본사 개인정보 접근 로그 화면의 목록(사 #170, 교 #66, 결정 102.5). 소속코드, 교사 이름과 로그인 아이디,
// 가린 교사 전화번호, 구분, 가린 학생 이름, 내용을 한 줄씩 돌려준다. teachers 는 authenticated 에 막혀 있어
// 뷰로는 붙일 수 없으므로 service_role 로 읽는다.
// 권한: 로그인 + fn_is_super_admin. admin_access_logs 의 RLS 와 같은 술어다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  contentSummary,
  kindLabel,
  kindOf,
  maskTeacherPhone,
} from "../_lib/accessLog/describe.js";
import { maskName } from "../_lib/console/maskName.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const PAGE_SIZE = 50;

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

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "접근 로그를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/access-logs]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const { data: isSuper, error } = await ctx.supabaseAdmin.rpc(
      "fn_is_super_admin",
      { p_profile_id: ctx.userId },
    );
    if (error) throw new Error("super admin check failed");
    if (isSuper !== true) {
      sendError(
        res,
        "coded",
        403,
        "최고 관리자만 볼 수 있습니다.",
        "FORBIDDEN",
      );
      return;
    }

    const { data, error: readError } = await ctx.supabaseAdmin
      .from("admin_access_logs")
      .select(
        "id, created_at, action, resource_key, reason, row_count, target_id, actor_email, actor_kind, actor_login_id, profile_id, teacher_id, proxy_session_id, meta, tenants(code)",
      )
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);
    if (readError) throw new Error("access logs read failed");
    const rows = (data ?? []) as unknown as LogRow[];

    const teacherIds = unique(rows.map((r) => r.teacher_id));
    const profileIds = unique(rows.flatMap((r) => [r.profile_id, r.target_id]));
    const [teachers, profiles] = await Promise.all([
      readById<TeacherRow>(
        ctx.supabaseAdmin,
        "teachers",
        "id, name, phone, login_id",
        teacherIds,
      ),
      readById<ProfileRow>(
        ctx.supabaseAdmin,
        "profiles",
        "id, name, member_type",
        profileIds,
      ),
    ]);

    res.status(200).json({
      ok: true,
      logs: rows.map((row) => {
        const teacher = row.teacher_id ? teachers.get(row.teacher_id) : null;
        const target = row.target_id ? profiles.get(row.target_id) : null;
        const kind = kindOf(row.action);
        return {
          id: row.id,
          createdAt: row.created_at,
          tenantCode: row.tenants?.code ?? null,
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
      page: 1,
      hasNext: false,
    });
  },
});
