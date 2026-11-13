// GET, PATCH /api/console/org-info
//
// 내정보관리(W17, 교 #230, #231). 기관 정보를 읽고, 최종확인 전까지 학교 관리자가 입력 항목을 고친다.
// 소속코드는 읽기 전용이라 PATCH 에서 받지 않는다(알 수 없는 항목은 400).
// 최종확인(org-info/confirm) 뒤에는 조회만 되고(본사 대행도 같다) 변경은 본사 화면에서 한다. 확정 여부는 UPDATE 조건
// (info_confirmed_at is null)으로 판정해, 확정과 동시에 들어온 저장이 확정 뒤에 덮어쓰지 못한다.
// 권한: 조회와 저장 모두 학교 관리자와 본사 대행(담임은 handler 가 막는다). 기관은 항상 세션의 actor 에서 온다.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { RpcError } from "../../_lib/console/teacherAccounts.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const ORG_INFO_RESOURCE_KEY = "console.org-info";

const MAX_LENGTH = 200;
const PHONE = /^[0-9-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOMEPAGE = /^https?:\/\/\S+$/;

// 요청 필드, 컬럼, 형식 검사. 비어 있어도 되는 항목은 빈 문자열을 null 로 저장한다.
const FIELDS = {
  name: { column: "name", required: true, pattern: null },
  address: { column: "address", required: false, pattern: null },
  mainPhone: { column: "main_phone", required: false, pattern: PHONE },
  contactPhone: { column: "contact_phone", required: false, pattern: PHONE },
  contactMobile: { column: "contact_mobile", required: false, pattern: PHONE },
  homepage: { column: "homepage", required: false, pattern: HOMEPAGE },
  contactEmail: { column: "contact_email", required: false, pattern: EMAIL },
} as const;

type FieldKey = keyof typeof FIELDS;

function parseBody(body: unknown): Record<string, string | null> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return null;
  const values: Record<string, string | null> = {};
  for (const [key, raw] of entries) {
    if (!(key in FIELDS)) return null;
    const field = FIELDS[key as FieldKey];
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    if (value.length > MAX_LENGTH) return null;
    if (value === "") {
      if (field.required) return null;
      values[field.column] = null;
      continue;
    }
    if (field.pattern && !field.pattern.test(value)) return null;
    values[field.column] = value;
  }
  return values;
}

export default defineHandler({
  methods: ["GET", "PATCH"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "기관 정보를 처리하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/org-info]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("tenants")
        .select(
          "code, name, address, main_phone, contact_phone, contact_mobile, homepage, contact_email, info_confirmed_at",
        )
        .eq("id", actor.tenantId)
        .maybeSingle();
      if (error || !data) throw new RpcError("tenant read", error?.code);
      res.status(200).json({
        code: data.code,
        name: data.name,
        address: data.address,
        mainPhone: data.main_phone,
        contactPhone: data.contact_phone,
        contactMobile: data.contact_mobile,
        homepage: data.homepage,
        contactEmail: data.contact_email,
        infoConfirmedAt: data.info_confirmed_at,
      });
      return;
    }

    const values = parseBody(req.body);
    if (!values) {
      sendError(res, "coded", 400, "입력 항목을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data, error } = await admin
      .from("tenants")
      .update(values)
      .eq("id", actor.tenantId)
      .is("info_confirmed_at", null)
      .select("id");
    if (error) throw new RpcError("tenants org info update", error.code);
    if (!data || data.length === 0) {
      sendError(
        res,
        "coded",
        409,
        "최종확인이 끝난 기관 정보는 고칠 수 없습니다.",
        "ALREADY_CONFIRMED",
      );
      return;
    }

    await writeConsoleAuditLog(
      {
        supabaseAdmin: admin,
        userId: ctx.userId,
        user: ctx.user,
        console: actor,
      },
      {
        action: "settings_change",
        resourceKey: ORG_INFO_RESOURCE_KEY,
        targetId: actor.tenantId,
        meta: { step: "save", fields: Object.keys(values) },
      },
    );
    res.status(200).json({ ok: true });
  },
});
