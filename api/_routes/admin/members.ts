// /api/admin/members 루트 경로. 관리자 앱(api/_routes/admin/app.ts)이 .route("/members", members) 로 붙인다.
// 하위 경로(/:id 와 그 아래)는 members-detail.ts 가 같은 /members 에 붙어 받는다.
//
// GET /api/admin/members
//
// 회원 목록(profiles 전체 열, 최신순)에 이용서비스(program_access 중 active 의 program_key 를 ", " 로 이은 값)와
// 소속 이름(tenants.name)을 얹어 돌려준다. 예전에는 브라우저가 세 표를 직접 읽었고 경계는 members 보기 권한이었다.
// 목록 화면이 회원 수만큼 쿼리하지 않도록 program_access 와 tenants 는 한 번씩만 읽는다.
// 응답 모양은 shared/members/contract.ts 를 따른다.

import type { MembersList } from "../../../shared/members/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { canViewTenantNames } from "../../_lib/members/member.js";

const guard = admin({
  permission: { key: "members" },
  unhandledMessage: "회원 목록을 불러오지 못했습니다.",
  logLabel: "[admin/members]",
});

export const members = adminFactory
  .createApp()
  .get("/", guard, async (c) => {
    const supabase = c.var.supabaseAdmin;
    // tenants 보기 권한이 없으면 소속 이름은 null 이고 tenants 를 읽지 않는다.
    const canViewTenants = await canViewTenantNames(
      supabase,
      c.var.userId as string,
      c.var.effectivePermissions,
    );
    const [profiles, access, tenants] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("program_access").select("id, program_key, access_status"),
      canViewTenants
        ? supabase.from("tenants").select("id, name")
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

    return c.json({
      items: (profiles.data ?? []).map((row) => ({
        ...row,
        service_labels: (servicesById.get(row.id) ?? []).join(", "),
        tenant_name: canViewTenants
          ? row.tenant_id
            ? (tenantNameById.get(row.tenant_id) ?? "")
            : ""
          : null,
      })),
    } satisfies MembersList);
  })
  .all("/", methodNotAllowed("GET"));
