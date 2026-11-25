// GET  /api/admin/tenants
// POST /api/admin/tenants  { name, region, org_type, tier }
//
// 기관 관리 목록과 신규 등록(TenantsAdmin). GET 은 { items, graceDays } 를 돌려준다. 계약 칼럼은 hqTenantAdmin 사이트만 읽고,
// graceDays(app_settings.contract_grace_days)는 유예 종료일이 빈 기관의 삭제 D-day 계산용이라 그 사이트에서만 읽는다.
// POST 는 fn_create_tenant 를 관리자 본인 토큰 클라이언트로 부른다. 그 함수가 auth.uid() 로 최고 관리자를 확인하고
// created_by 를 채우므로 service_role 로는 쓸 수 없다. 최고 관리자가 아니면 DB 가 WC067 을 낸다.
// 권한: 관리자 + 메뉴 tenants(GET view, POST edit). 판정과 QA 계정 쓰기 차단은 defineHandler 가 한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { SITES } from "../../../src/config/sites.js";
import { getBearerToken } from "../../_lib/adminAuth.js";
import {
  defineHandler,
  type HandlerCtx,
  parseOrReject,
} from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { getSiteKey } from "../../_lib/site.js";
import { createSupabaseUserClient } from "../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

const BASE_COLUMNS = "id, code, name, region, org_type, tier, created_at";
const HQ_COLUMNS = `${BASE_COLUMNS}, contract_start_date, contract_end_date, grace_ends_on, mou_status, is_catch_all, time_zone`;

const NOT_SUPER_ADMIN_CODE = "WC067";
const NOT_SUPER_ADMIN_MESSAGE = "최고 관리자만 소속을 등록할 수 있습니다.";

// 등록 화면이 만드는 네 칸만 받는다. 그 밖의 키는 400 이다.
const createSchema = z
  .object({
    name: z.string().trim().min(1),
    region: z.string(),
    org_type: z.string(),
    tier: z.string(),
  })
  .strict();

async function listTenants(res: VercelResponse, ctx: HandlerCtx) {
  const hq = SITES[getSiteKey()].features.hqTenantAdmin;
  const { data, error } = await ctx.supabaseAdmin
    .from("tenants")
    .select(hq ? HQ_COLUMNS : BASE_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error("tenants read failed");

  let graceDays: number | null = null;
  if (hq) {
    const { data: setting, error: settingError } = await ctx.supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "contract_grace_days")
      .maybeSingle();
    if (settingError) throw new Error("grace days read failed");
    const value = (setting as { value: unknown } | null)?.value;
    graceDays = typeof value === "number" ? value : null;
  }
  res.status(200).json({ items: data ?? [], graceDays });
}

async function createTenant(req: VercelRequest, res: VercelResponse) {
  const parsed = parseOrReject(res, "problem", createSchema, req.body);
  if (!parsed) return;
  const input = parsed.value as z.output<typeof createSchema>;

  const { data, error } = await createSupabaseUserClient(
    getBearerToken(req),
  ).rpc("fn_create_tenant", {
    p_name: input.name,
    p_region: input.region,
    p_org_type: input.org_type,
    p_tier: input.tier,
  });
  if (error?.code === NOT_SUPER_ADMIN_CODE) {
    sendError(res, "problem", 403, NOT_SUPER_ADMIN_MESSAGE, "NOT_SUPER_ADMIN");
    return;
  }
  if (error) throw new Error("fn_create_tenant failed");
  res.status(201).json(data);
}

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "tenants" },
  unhandledMessage: "기관을 처리하지 못했습니다.",
  logLabel: "[admin/tenants]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (req.method === "POST") {
      await createTenant(req, res);
      return;
    }
    await listTenants(res, ctx);
  },
});
