// GET /api/admin/members
//
// 회원 목록(profiles 전체 열, 최신순)에 이용서비스(program_access 중 active 의 program_key 를 ", " 로 이은 값)와
// 소속 이름(tenants.name)을 얹어 돌려준다. 예전에는 브라우저가 세 표를 직접 읽었고 경계는 members 보기 권한이었다.
// 목록 화면이 회원 수만큼 쿼리하지 않도록 program_access 와 tenants 는 한 번씩만 읽는다.

import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { canViewTenantNames } from "../../_lib/members/member.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "members" },
  unhandledMessage: "회원 목록을 불러오지 못했습니다.",
  logLabel: "[admin/members]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    // tenants 보기 권한이 없으면 소속 이름은 null 이고 tenants 를 읽지 않는다.
    const canViewTenants = await canViewTenantNames(admin, requireUserId(ctx));
    const [profiles, access, tenants] = await Promise.all([
      admin
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      admin.from("program_access").select("id, program_key, access_status"),
      canViewTenants
        ? admin.from("tenants").select("id, name")
        : Promise.resolve({
            data: [] as { id: string; name: string }[],
            error: null,
          }),
    ]);
    if (profiles.error) throw new Error("profiles read failed");
    if (access.error) throw new Error("program_access read failed");
    if (tenants.error) throw new Error("tenants read failed");

    // active 만 이용 중이다(inactive, expired, suspended 는 뺀다).
    const servicesById = new Map<string, string[]>();
    for (const row of access.data ?? []) {
      if (row.access_status !== "active") continue;
      servicesById.set(row.id, [
        ...(servicesById.get(row.id) ?? []),
        row.program_key,
      ]);
    }
    const tenantNameById = new Map(
      (tenants.data ?? []).map((t): [string, string] => [t.id, t.name]),
    );

    res.status(200).json({
      items: (profiles.data ?? []).map((row) => ({
        ...row,
        service_labels: (servicesById.get(row.id) ?? []).join(", "),
        tenant_name: canViewTenants
          ? row.tenant_id
            ? (tenantNameById.get(row.tenant_id) ?? "")
            : ""
          : null,
      })),
    });
  },
});
