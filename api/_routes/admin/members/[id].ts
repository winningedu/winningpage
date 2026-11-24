// GET, PATCH /api/admin/members/:id
//
// 회원 한 명(profiles 전체 열 + 소속 이름)을 읽고, 회원 구분과 보호자 연락처만 고친다.
// 예전에는 브라우저가 profiles 를 직접 읽고 고쳤고(profiles_admin_update_all), 화면이 쓰는 열은 이 둘뿐이었다.
// 서비스 롤은 RLS 를 우회하므로 쓰는 열을 여기서 둘로 못 박고, 다른 키는 400 으로 막는다(role 등 권한 열 보호).
// 소속(tenant_id)은 fn_admin_set_profile_tenant 전용이라 members/:id/tenant 로 간다.

import { z } from "zod";
import { defineHandler, parseOrReject } from "../../../_lib/handler.js";
import {
  sendMemberNotFound,
  withTenantName,
} from "../../../_lib/members/member.js";

export const config = { runtime: "nodejs" };

const querySchema = z.object({ id: z.guid() });

const text = z.string().nullable().optional();

const patchSchema = z
  .strictObject({ member_category: text, guardian_phone: text })
  .refine(
    (body) =>
      body.member_category !== undefined || body.guardian_phone !== undefined,
  );

// 다듬은 뒤 빈 문자열은 null 이다(화면이 비운 칸을 지운다는 뜻).
const cleaned = (value: string | null): string | null =>
  value?.trim() ? value.trim() : null;

export default defineHandler({
  methods: ["GET", "PATCH"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "members" },
  unhandledMessage: "회원 정보를 처리하지 못했습니다.",
  logLabel: "[admin/members/id]",
  headers: { "Cache-Control": "no-store" },
  query: querySchema,
  handler: async (req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { id } = ctx.query;

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("profile read failed");
      if (!data) return sendMemberNotFound(res);
      res.status(200).json(await withTenantName(admin, data));
      return;
    }

    const parsed = parseOrReject(res, "problem", patchSchema, req.body);
    if (!parsed) return;
    const body = parsed.value as z.output<typeof patchSchema>;
    const values: Record<string, string | null> = {};
    if (body.member_category !== undefined) {
      values.member_category = cleaned(body.member_category);
    }
    if (body.guardian_phone !== undefined) {
      values.guardian_phone = cleaned(body.guardian_phone);
    }

    const { data, error } = await admin
      .from("profiles")
      .update(values)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error("profile update failed");
    if (!data) return sendMemberNotFound(res);
    res.status(200).json(await withTenantName(admin, data));
  },
});
