// GET /api/admin/access-logs[?tenantCode=&from=&to=&kind=&page=]
//
// 본사 개인정보 접근 로그 화면의 목록(사 #170, 교 #66, 결정 102.5). 소속코드, 교사 이름과 로그인 아이디,
// 가린 교사 전화번호, 구분, 가린 학생 이름, 내용을 한 줄씩 돌려준다. teachers 는 authenticated 에 막혀 있어
// 뷰로는 붙일 수 없으므로 service_role 로 읽는다.
// 권한: 로그인 + fn_is_super_admin. admin_access_logs 의 RLS 와 같은 술어다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCESS_LOG_KINDS,
  type AccessLogKind,
  actionsOfKind,
  contentSummary,
  kindLabel,
  kindOf,
  maskTeacherPhone,
} from "../../_lib/accessLog/describe.js";
import { maskName } from "../../_lib/console/maskName.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

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

interface Filter {
  tenantCode: string | null;
  from: string | null;
  before: string | null;
  kind: AccessLogKind | null;
  page: number;
}

function one(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// 날짜는 YYYY-MM-DD 한국 날짜다. 시작일 0시(포함)부터 종료일 다음 날 0시(미포함)까지 읽는다.
function kstDay(date: string, plusDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const moment = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(moment.getTime())) return null;
  if (moment.toISOString().slice(0, 10) !== date) return null;
  moment.setUTCDate(moment.getUTCDate() + plusDays);
  return `${moment.toISOString().slice(0, 10)}T00:00:00+09:00`;
}

/** 쿼리를 읽는다. 형식이 틀린 값이 하나라도 있으면 null. */
function parseFilter(query: Record<string, unknown>): Filter | null {
  const fromText = one(query.from);
  const toText = one(query.to);
  const kindText = one(query.kind);
  const pageText = one(query.page);
  const from = fromText ? kstDay(fromText, 0) : null;
  const before = toText ? kstDay(toText, 1) : null;
  const kind = ACCESS_LOG_KINDS.find((k) => k === kindText) ?? null;
  const page = pageText === null ? 1 : Number(pageText);
  if (fromText && !from) return null;
  if (toText && !before) return null;
  if (kindText && !kind) return null;
  if (!Number.isInteger(page) || page < 1) return null;
  return { tenantCode: one(query.tenantCode), from, before, kind, page };
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
  handler: async (req, res, ctx) => {
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

    const filter = parseFilter(req.query);
    if (!filter) {
      sendError(res, "coded", 400, "조회 조건을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    let tenantId: string | null = null;
    if (filter.tenantCode) {
      const { data: tenant, error: tenantError } = await ctx.supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("code", filter.tenantCode)
        .maybeSingle();
      if (tenantError) throw new Error("tenant read failed");
      if (!tenant) {
        res
          .status(200)
          .json({ ok: true, logs: [], page: filter.page, hasNext: false });
        return;
      }
      tenantId = (tenant as { id: string }).id;
    }

    let query = ctx.supabaseAdmin
      .from("admin_access_logs")
      .select(
        "id, created_at, action, resource_key, reason, row_count, target_id, actor_email, actor_kind, actor_login_id, profile_id, teacher_id, proxy_session_id, meta, tenants(code)",
      );
    if (tenantId) query = query.eq("tenant_id", tenantId);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.before) query = query.lt("created_at", filter.before);
    if (filter.kind) query = query.in("action", actionsOfKind(filter.kind));
    const offset = (filter.page - 1) * PAGE_SIZE;
    // 한 줄 더 읽어 다음 쪽이 있는지 안다.
    const { data, error: readError } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE);
    if (readError) throw new Error("access logs read failed");
    const all = (data ?? []) as unknown as LogRow[];
    const rows = all.slice(0, PAGE_SIZE);

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
      hasNext: all.length > PAGE_SIZE,
    });
  },
});
