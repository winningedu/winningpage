// GET /api/admin/tenants/student-usage?profileId=
// PUT /api/admin/tenants/student-usage  { rows: [{ profile_id, program_key, monthly_limit?, term_limit? }] }
//
// 본사가 서비스이용횟수조정 화면에서 학생 한 명의 6개 서비스 사용 상태를 본다(사 #166, 결정 r5, r6).
// 상태는 fn_tenant_usage_state(service_role 전용)가 정본이고, 기관 설정과 학생별 조정은 입력칸을 채우도록
// 원값 그대로 함께 돌려준다.
// PUT 은 학생별 조정(student_usage_overrides)을 upsert 한다. 변경 이력 트리거가 auth.uid() 를 변경자로 남기고 RLS 가 메뉴 권한이라
// 관리자 본인 토큰 클라이언트로 쓴다(service_role 이면 이력이 system 으로 남는다).
// 권한: 관리자 + 메뉴 serviceCreditAdjust(GET view, PUT edit, defineHandler)와 GET 은 tenants view 이상(기관 설정은 RLS 가 tenants view 로 제한한다).
// 스쿨멘토 전용(위닝은 404).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getBearerToken } from "../../../_lib/adminAuth.js";
import { assertSectionPermission } from "../../../_lib/adminPermission.js";
import {
  defineHandler,
  type HandlerCtx,
  parseOrReject,
} from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import { SERVICE_CREDIT_PROGRAMS } from "../../../_lib/service-credit/programs.js";
import { isSchoolmentorSite } from "../../../_lib/site.js";
import { createSupabaseUserClient } from "../../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

const MAX_ROWS = 5000;
const MAX_LIMIT = 32767; // smallint 한도(DB 제약 > 0)

const getQuerySchema = z.object({ profileId: z.guid() });

const limit = z.number().int().min(1).max(MAX_LIMIT).nullable().optional();

// 고친 칸(dirty)만 보낸다. 안 보낸 칸은 기존 조정을 덮지 않으므로 둘 다 없는 행은 의미가 없다.
const putBodySchema = z.object({
  rows: z
    .array(
      z
        .object({
          profile_id: z.guid(),
          program_key: z
            .string()
            .refine((key) =>
              SERVICE_CREDIT_PROGRAMS.some(
                (program) => program.programKey === key,
              ),
            ),
          monthly_limit: limit,
          term_limit: limit,
        })
        .refine(
          (row) =>
            row.monthly_limit !== undefined || row.term_limit !== undefined,
        ),
    )
    .min(1)
    .max(MAX_ROWS),
});

interface UsageStateRow {
  allowed: boolean;
  deny_reason: string | null;
  month_used: number;
  month_limit: number | null;
  month_remaining: number | null;
  term_used: number;
  term_limit: number | null;
  term_remaining: number | null;
  month_resets_on: string | null;
  term_resets_on: string | null;
}

interface LimitRow {
  program_key: string;
  enabled?: boolean;
  monthly_limit: number | null;
  term_limit: number | null;
}

// supabase-js upsert 는 첫 행의 열만 쓰므로, 같은 열 묶음의 행끼리 모아 한 번씩 보낸다.
function groupByColumns<T extends Record<string, unknown>>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const columns = Object.keys(row).sort().join(",");
    groups.set(columns, [...(groups.get(columns) ?? []), row]);
  }
  return [...groups.values()];
}

async function writeOverrides(
  req: VercelRequest,
  res: VercelResponse,
  ctx: HandlerCtx,
) {
  const parsed = parseOrReject(res, "problem", putBodySchema, req.body);
  if (!parsed) return;
  const { rows } = parsed.value as z.output<typeof putBodySchema>;

  const userClient = createSupabaseUserClient(getBearerToken(req));
  for (const group of groupByColumns(
    rows.map((row) => ({ ...row, updated_by: ctx.userId as string })),
  )) {
    const { error } = await userClient
      .from("student_usage_overrides")
      .upsert(group, { onConflict: "profile_id,program_key" });
    if (error) throw new Error("student usage override upsert failed");
  }
  res.status(200).json({ saved: rows.length });
}

export default defineHandler({
  methods: ["GET", "PUT"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "serviceCreditAdjust" },
  unhandledMessage: "학생 이용 현황을 처리하지 못했습니다.",
  logLabel: "[admin/tenants/student-usage]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      sendError(res, "problem", 404, "찾을 수 없어요.", "NOT_FOUND");
      return;
    }
    if (req.method === "PUT") {
      await writeOverrides(req, res, ctx);
      return;
    }
    // 기관 설정은 tenants 메뉴 권한으로 보호되므로 두 번째 키를 같은 helper 로 본다.
    await assertSectionPermission(
      ctx.supabaseAdmin,
      ctx.userId as string,
      "tenants",
      "view",
    );

    const parsed = parseOrReject(res, "problem", getQuerySchema, req.query);
    if (!parsed) return;
    const { profileId } = parsed.value as z.output<typeof getQuerySchema>;

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id, tenant_id")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw new Error("profile read failed");
    if (!profile) {
      sendError(res, "problem", 404, "학생을 찾을 수 없어요.", "NOT_FOUND");
      return;
    }
    const tenantId = (profile as { tenant_id: string | null }).tenant_id;

    const tenantRead = tenantId
      ? await ctx.supabaseAdmin
          .from("tenants")
          .select("id, name, is_catch_all")
          .eq("id", tenantId)
          .maybeSingle()
      : { data: null, error: null };
    if (tenantRead.error) throw new Error("tenant read failed");
    const tenant = tenantRead.data as {
      id: string;
      name: string;
      is_catch_all: boolean;
    } | null;

    const [settings, overrides, states] = await Promise.all([
      tenantId
        ? ctx.supabaseAdmin
            .from("tenant_service_settings")
            .select("program_key, enabled, monthly_limit, term_limit")
            .eq("tenant_id", tenantId)
        : { data: [], error: null },
      ctx.supabaseAdmin
        .from("student_usage_overrides")
        .select("program_key, monthly_limit, term_limit")
        .eq("profile_id", profileId),
      Promise.all(
        SERVICE_CREDIT_PROGRAMS.map((program) =>
          ctx.supabaseAdmin.rpc("fn_tenant_usage_state", {
            p_profile: profileId,
            p_program_key: program.programKey,
          }),
        ),
      ),
    ]);
    if (settings.error || overrides.error)
      throw new Error("limits read failed");
    if (states.some((state) => state.error))
      throw new Error("usage state read failed");

    const settingRows = (settings.data ?? []) as LimitRow[];
    const overrideRows = (overrides.data ?? []) as LimitRow[];

    res.status(200).json({
      tenant: tenant
        ? { id: tenant.id, name: tenant.name, isCatchAll: tenant.is_catch_all }
        : null,
      programs: SERVICE_CREDIT_PROGRAMS.map((program, index) => {
        const [state] = (states[index]?.data ?? []) as UsageStateRow[];
        const setting = settingRows.find(
          (row) => row.program_key === program.programKey,
        );
        const override = overrideRows.find(
          (row) => row.program_key === program.programKey,
        );
        return {
          programKey: program.programKey,
          allowed: state?.allowed ?? false,
          denyReason: state?.deny_reason ?? null,
          monthUsed: state?.month_used ?? 0,
          monthLimit: state?.month_limit ?? null,
          monthRemaining: state?.month_remaining ?? null,
          termUsed: state?.term_used ?? 0,
          termLimit: state?.term_limit ?? null,
          termRemaining: state?.term_remaining ?? null,
          monthResetsOn: state?.month_resets_on ?? null,
          termResetsOn: state?.term_resets_on ?? null,
          setting: setting
            ? {
                enabled: setting.enabled ?? false,
                monthlyLimit: setting.monthly_limit,
                termLimit: setting.term_limit,
              }
            : null,
          override: override
            ? {
                monthlyLimit: override.monthly_limit,
                termLimit: override.term_limit,
              }
            : null,
        };
      }),
    });
  },
});
