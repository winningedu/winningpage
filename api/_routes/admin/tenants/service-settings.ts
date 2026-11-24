// GET /api/admin/tenants/service-settings?tenantId=
// PUT /api/admin/tenants/service-settings  { tenant_id, program_key, enabled, starts_on, ends_on, monthly_limit, term_limit }
//
// 기관 서비스 설정 탭(ServiceSettingsPanel, 사 #160, #164, #166, 결정 r5, r6). GET 은 기관의 서비스별 설정 행과, 켤 때 한도를 미리 채우는
// app_settings.b2b_usage_defaults 를 돌려준다. PUT 은 한 서비스 행을 upsert 한다(끄기도 enabled false 로 행을 둔다, DELETE 권한이 없다).
// 쓰기는 관리자 본인 토큰 클라이언트로 한다. 변경 이력 트리거(fn_log_settings_change)가 auth.uid() 를 변경자로 남기고 RLS 가 메뉴 권한이다.
// 권한: 관리자 + 메뉴 tenants(GET view, PUT edit). 판정과 QA 계정 쓰기 차단은 defineHandler 가 한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getBearerToken } from "../../../_lib/adminAuth.js";
import {
  defineHandler,
  type HandlerCtx,
  parseOrReject,
} from "../../../_lib/handler.js";
import { SERVICE_CREDIT_PROGRAMS } from "../../../_lib/service-credit/programs.js";
import { createSupabaseUserClient } from "../../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

const SETTING_COLUMNS =
  "program_key, enabled, starts_on, ends_on, monthly_limit, term_limit";
const MAX_LIMIT = 32767; // smallint 한도(DB 제약 > 0)

const getQuerySchema = z.object({ tenantId: z.guid() });

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const limit = z.number().int().min(1).max(MAX_LIMIT).nullable();

// updated_by 와 updated_at 은 서버가 채운다(보낸 값은 버려진다).
const putBodySchema = z
  .object({
    tenant_id: z.guid(),
    program_key: z
      .string()
      .refine((key) =>
        SERVICE_CREDIT_PROGRAMS.some((program) => program.programKey === key),
      ),
    enabled: z.boolean(),
    starts_on: date,
    ends_on: date,
    monthly_limit: limit,
    term_limit: limit,
  })
  .refine(
    (row) => !row.starts_on || !row.ends_on || row.starts_on <= row.ends_on,
  );

async function readSettings(
  req: VercelRequest,
  res: VercelResponse,
  ctx: HandlerCtx,
) {
  const parsed = parseOrReject(res, "problem", getQuerySchema, req.query);
  if (!parsed) return;
  const { tenantId } = parsed.value as z.output<typeof getQuerySchema>;

  const [settings, defaultRow] = await Promise.all([
    ctx.supabaseAdmin
      .from("tenant_service_settings")
      .select(SETTING_COLUMNS)
      .eq("tenant_id", tenantId),
    ctx.supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "b2b_usage_defaults")
      .maybeSingle(),
  ]);
  if (settings.error || defaultRow.error) {
    throw new Error("service settings read failed");
  }
  const value = (defaultRow.data as { value: unknown } | null)?.value;
  res.status(200).json({
    items: settings.data ?? [],
    defaults:
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : {},
  });
}

async function saveSetting(
  req: VercelRequest,
  res: VercelResponse,
  ctx: HandlerCtx,
) {
  const parsed = parseOrReject(res, "problem", putBodySchema, req.body);
  if (!parsed) return;
  const row = parsed.value as z.output<typeof putBodySchema>;

  const { data, error } = await createSupabaseUserClient(getBearerToken(req))
    .from("tenant_service_settings")
    .upsert(
      {
        ...row,
        updated_by: ctx.userId as string,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,program_key" },
    )
    .select(SETTING_COLUMNS)
    .single();
  if (error) throw new Error("service setting upsert failed");
  res.status(200).json(data);
}

export default defineHandler({
  methods: ["GET", "PUT"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "tenants" },
  unhandledMessage: "서비스 설정을 처리하지 못했습니다.",
  logLabel: "[admin/tenants/service-settings]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (req.method === "PUT") {
      await saveSetting(req, res, ctx);
      return;
    }
    await readSettings(req, res, ctx);
  },
});
