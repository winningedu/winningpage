// POST /api/admin/access-logs  { action, resourceKey, reason, rowCount?, targetId? } -> 201 { id, createdAt }
// GET /api/admin/access-logs[?tenantCode=&from=&to=&kind=&page=]  (from 포함, to 미포함인 ISO Z 시각)
//
// 본사 개인정보 접근 로그 화면의 목록(사 #170, 교 #66, 결정 102.5). 소속코드, 교사 이름과 로그인 아이디,
// 가린 교사 전화번호, 구분, 가린 학생 이름, 내용을 한 줄씩 돌려준다. teachers 는 authenticated 에 막혀 있어
// 뷰로는 붙일 수 없으므로 service_role 로 읽는다.
// 권한: 메뉴 권한 adminAccessLogs view(defineHandler permission) + fn_is_super_admin. 뒤쪽은 admin_access_logs 의 RLS 와 같은 데이터 술어다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  ACCESS_LOG_KINDS,
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

// 빈 문자열은 없는 값으로 본다(화면이 비운 칸을 그대로 보낸다).
const blankAsAbsent = (value: unknown) => (value === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankAsAbsent, schema.optional());

// 시각은 ISO 8601 Z(예: 2026-10-31T15:00:00.000Z)다. 달력에 없는 날이거나 형식이 다르면 거른다.
const ISO_Z = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isRealInstant(value: string): boolean {
  const match = ISO_Z.exec(value);
  if (!match) return false;
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return false;
  return moment.toISOString().slice(0, 10) === match[1]; // tz-literal-ok: ISO Z 입력의 UTC 날짜 부분이 실존하는지만 본다
}

const instant = z.string().refine(isRealInstant);

const querySchema = z.object({
  tenantCode: optional(z.string()),
  from: optional(instant),
  to: optional(instant),
  kind: optional(z.enum(ACCESS_LOG_KINDS)),
  page: z.preprocess(
    blankAsAbsent,
    z.string().transform(Number).pipe(z.number().int().min(1)).default(1),
  ),
});

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

const getHandler = defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "adminAccessLogs" },
  unhandledMessage: "접근 로그를 불러오지 못했습니다.",
  logLabel: "[admin/access-logs]",
  headers: { "Cache-Control": "no-store" },
  query: querySchema,
  handler: async (_req, res, ctx) => {
    // 메뉴 권한이 아니라 데이터 술어다(admin_access_logs 의 RLS 와 같다).
    const { data: isSuper, error } = await ctx.supabaseAdmin.rpc(
      "fn_is_super_admin",
      { p_profile_id: ctx.userId },
    );
    if (error) throw new Error("super admin check failed");
    if (isSuper !== true) {
      sendError(
        res,
        "problem",
        403,
        "최고 관리자만 볼 수 있습니다.",
        "FORBIDDEN",
      );
      return;
    }

    const filter = ctx.query;

    let tenantId: string | null = null;
    if (filter.tenantCode) {
      const { data: tenant, error: tenantError } = await ctx.supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("code", filter.tenantCode)
        .maybeSingle();
      if (tenantError) throw new Error("tenant read failed");
      if (!tenant) {
        res.status(200).json({ items: [], page: filter.page, hasNext: false });
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
    if (filter.to) query = query.lt("created_at", filter.to);
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
      hasNext: all.length > PAGE_SIZE,
    });
  },
});

const postBodySchema = z.object({
  action: z.enum(["download", "unmask"]),
  resourceKey: z.string().min(1),
  reason: z.string().trim().min(1),
  rowCount: z.number().int().min(0).optional(),
  targetId: z.string().optional(),
});

// 개인정보 반출 게이트의 접근 기록 적재. 감사 로그라 멱등 키 없이 제출마다 한 줄이다(추가만 되고,
// 클라이언트는 재시도하지 않으며 게이트가 이중 제출을 막는다).
const postHandler = defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  // 기록은 그 메뉴를 읽은 일(내려받기, 마스킹 해제)이므로 그 메뉴의 view 면 된다. edit 를 요구하면 조회 권한자는 내려받지 못한다.
  permission: {
    key: (req) =>
      typeof req.body?.resourceKey === "string" ? req.body.resourceKey : "",
    level: "view",
  },
  unhandledMessage: "접근 기록을 남기지 못했습니다.",
  logLabel: "[admin/access-logs]",
  body: postBodySchema,
  handler: async (_req, res, ctx) => {
    const profileId = ctx.userId as string;
    const { data: authUser, error: authError } =
      await ctx.supabaseAdmin.auth.admin.getUserById(profileId);
    const email = authUser?.user?.email;
    if (authError || !email) throw new Error("auth user lookup failed");

    const { data, error } = await ctx.supabaseAdmin
      .from("admin_access_logs")
      .insert({
        profile_id: profileId,
        actor_email: email,
        action: ctx.body.action,
        resource_key: ctx.body.resourceKey,
        reason: ctx.body.reason,
        row_count: ctx.body.rowCount ?? null,
        target_id: ctx.body.targetId ?? null,
      })
      .select("id, created_at")
      .single();
    if (error || !data) throw new Error("access log insert failed");

    res.status(201).json({ id: data.id, createdAt: data.created_at });
  },
});

export default function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // POST 만 쓰기 핸들러로 보내고 나머지는 GET 핸들러가 405 로 거른다.
  return (req.method === "POST" ? postHandler : getHandler)(req, res);
}
