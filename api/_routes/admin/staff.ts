// /api/admin/staff 루트 경로. 관리자 앱(api/_routes/admin/app.ts)이 .route("/staff", staff) 로 붙인다.
// 하위 경로(/:profileId 와 그 아래)는 아직 라우터가 받는다.
//
// GET /api/admin/staff
//
// 관리자 목록 화면(adminMembers)이 한 번에 쓰는 목록, 권한 묶음 선택지, 메뉴 목록.
// 최고 관리자 전용 메뉴라 읽기도 최고 관리자만 된다(판정은 admin() 가드의 permission).
// 응답 모양은 shared/staff/contract.ts 를 따른다.

import type { StaffList } from "../../../shared/staff/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { readResources } from "../../_lib/staff/resources.js";

const guard = admin({
  permission: { key: "adminMembers" },
  unhandledMessage: "관리자 목록을 불러오지 못했습니다.",
  logLabel: "[admin/staff]",
});

export const staff = adminFactory
  .createApp()
  .get("/", guard, async (c) => {
    const supabase = c.var.supabaseAdmin;
    const [directory, roles, resources] = await Promise.all([
      supabase
        .from("admin_member_directory")
        .select("*")
        .order("invited_at", { ascending: false }),
      supabase.from("admin_roles").select("id, name, is_super").order("name"),
      readResources(supabase),
    ]);
    if (directory.error || roles.error || resources.error) {
      throw new Error("staff list read failed");
    }
    return c.json({
      items: directory.data ?? [],
      roles: roles.data ?? [],
      resources: resources.data ?? [],
    } satisfies StaffList);
  })
  .all("/", methodNotAllowed("GET"));
