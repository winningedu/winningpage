// GET   /api/admin/tenants/:id
// PATCH /api/admin/tenants/:id  { updatedAt, values }
//
// 기관 상세(TenantDetail). id 는 경로에서 오고(디스패처가 req.query.id 에 넣는다) 본문에는 없다. GET 은 기관 한 곳의 행을 돌려준다. PATCH 는 화면이 불러온 updated_at 이 그대로일 때만 고친다(낙관적 잠금).
// 고칠 칸은 values 의 목록뿐이라 소속 코드(code)와 기타 기관 표시(is_catch_all)는 쓸 수 없다. 날짜 순서는 DB 제약
// (tenants_contract_order, tenants_grace_after_end, tenants_trial_order)이 막고 위반하면 400 으로 알린다.
// 수정은 관리자 본인 토큰 클라이언트로 한다. 계약 칼럼 변경 이력 트리거가 auth.uid() 를 변경자로 남기고, RLS 가 메뉴 권한이다.
// 권한: 관리자 + 메뉴 tenants(GET view, PATCH edit). 판정과 QA 계정 쓰기 차단은 defineHandler 가 한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getBearerToken } from "../../../_lib/adminAuth.js";
import {
  defineHandler,
  type HandlerCtx,
  parseOrReject,
} from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import { createSupabaseUserClient } from "../../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

const TENANT_COLUMNS =
  "id, code, name, region, org_type, tier, contract_start_date, contract_end_date, term_months, mou_status, grace_ends_on, trial_start_date, trial_end_date, contact_name, contact_phone, contact_mobile, contact_email, address, main_phone, homepage, is_catch_all, updated_at";

// 화면(src/pages/admin/tenants/form.ts)과 같은 문구다.
const CONFLICT_MESSAGE =
  "다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 저장해 주세요.";
const FORBIDDEN_MESSAGE = "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.";
const CHECK_VIOLATIONS = [
  {
    constraint: "tenants_contract_order",
    code: "CONTRACT_ORDER",
    message: "계약 시작일은 종료일보다 늦을 수 없어요.",
  },
  {
    constraint: "tenants_grace_after_end",
    code: "GRACE_ORDER",
    message: "유예 종료일은 계약 종료일과 같거나 그 뒤여야 해요.",
  },
  {
    constraint: "tenants_trial_order",
    code: "TRIAL_ORDER",
    message: "시범 시작일은 종료일보다 늦을 수 없어요.",
  },
];

// 경로 id 검증. 본문에 id 가 있어도 스키마가 버려서 경로 값만 쓴다.
const idSchema = z.object({ id: z.guid() });

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const text = z.string().nullable();

// 형식 규칙은 form.ts 와 같다. 칸은 tenantPayload 가 돌려주는 것 그대로이고 비운 선택 항목은 null 이다.
const patchBodySchema = z.object({
  updatedAt: z.string().min(1),
  // 목록 밖 칸(code, is_catch_all 등)은 쓰기 허용 목록을 넘으므로 .strict() 로 400 이다.
  values: z
    .object({
      name: z.string().trim().min(1),
      region: z.string(),
      org_type: z.string(),
      tier: z.string(),
      contract_start_date: date,
      contract_end_date: date,
      term_months: z.union([z.literal(3), z.literal(6)]).nullable(),
      mou_status: text,
      grace_ends_on: date,
      trial_start_date: date,
      trial_end_date: date,
      contact_name: text,
      contact_phone: z
        .string()
        .regex(/^[0-9-]+$/)
        .nullable(),
      contact_mobile: z
        .string()
        .regex(/^[0-9-]+$/)
        .nullable(),
      contact_email: z
        .string()
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
        .nullable(),
      address: text,
      main_phone: z
        .string()
        .regex(/^[0-9-]+$/)
        .nullable(),
      homepage: z
        .string()
        .regex(/^https?:\/\/\S+$/)
        .nullable(),
    })
    .strict(),
});

async function readTenant(
  req: VercelRequest,
  res: VercelResponse,
  ctx: HandlerCtx,
) {
  const parsed = parseOrReject(res, "problem", idSchema, req.query);
  if (!parsed) return;
  const { id } = parsed.value as z.output<typeof idSchema>;

  const { data, error } = await ctx.supabaseAdmin
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("tenant read failed");
  if (!data) {
    sendError(res, "problem", 404, "기관을 찾을 수 없어요.", "NOT_FOUND");
    return;
  }
  res.status(200).json(data);
}

async function updateTenant(
  req: VercelRequest,
  res: VercelResponse,
  ctx: HandlerCtx,
) {
  // 본문보다 경로 id 를 먼저 검증해 잘못된 주소면 쓰기 전에 막는다.
  const idParsed = parseOrReject(res, "problem", idSchema, req.query);
  if (!idParsed) return;
  const { id } = idParsed.value as z.output<typeof idSchema>;
  const parsed = parseOrReject(res, "problem", patchBodySchema, req.body);
  if (!parsed) return;
  const { updatedAt, values } = parsed.value as z.output<
    typeof patchBodySchema
  >;

  const { data, error } = await createSupabaseUserClient(getBearerToken(req))
    .from("tenants")
    .update(values)
    .eq("id", id)
    .eq("updated_at", updatedAt)
    .select("id, updated_at");
  if (error) {
    const violation =
      error.code === "23514"
        ? CHECK_VIOLATIONS.find((item) =>
            error.message.includes(item.constraint),
          )
        : undefined;
    if (violation) {
      sendError(res, "problem", 400, violation.message, violation.code);
      return;
    }
    throw new Error("tenant update failed");
  }

  const [saved] = data ?? [];
  if (saved) {
    res.status(200).json(saved);
    return;
  }

  // 0행은 기관이 없거나, 그 사이 다른 관리자가 먼저 저장했거나, 수정 권한이 없는 경우다. 다시 읽어 구분한다.
  const { data: current, error: readError } = await ctx.supabaseAdmin
    .from("tenants")
    .select("updated_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error("tenant reread failed");
  if (!current) {
    sendError(res, "problem", 404, "기관을 찾을 수 없어요.", "NOT_FOUND");
    return;
  }
  if ((current as { updated_at: string }).updated_at !== updatedAt) {
    sendError(res, "problem", 409, CONFLICT_MESSAGE, "CONFLICT");
    return;
  }
  sendError(res, "problem", 403, FORBIDDEN_MESSAGE, "FORBIDDEN");
}

export default defineHandler({
  methods: ["GET", "PATCH"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "tenants" },
  unhandledMessage: "기관 정보를 처리하지 못했습니다.",
  logLabel: "[admin/tenants/id]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (req.method === "PATCH") {
      await updateTenant(req, res, ctx);
      return;
    }
    await readTenant(req, res, ctx);
  },
});
