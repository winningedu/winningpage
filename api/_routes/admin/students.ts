// /api/admin/students 아래 학생 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/students", students) 로 붙인다.
// 요청 검증과 응답 모양은 shared/student/contract.ts 를 따른다.
// GET /search?q=<1..100자>&section=<메뉴 키>
//   이용권 부여, 이용횟수 조정 화면이 같이 쓰는 학생 검색. 학생과 관리자(테스트 계정)를 이메일이나 이름으로 20건까지 찾는다.
//   권한: section 에 적은 메뉴의 view. 모르는 section 은 권한 조회 전에 400 이다(RouteParamError).
//   응답 200 { items: [{ id, name, email, isAdmin }] }. role 은 돌려주지 않는다.

import {
  STUDENT_SEARCH_LIMIT,
  STUDENT_SEARCH_SECTIONS,
  type StudentSearchList,
  studentSearchQuery,
} from "../../../shared/student/contract.js";
import { RouteParamError } from "../../_lib/handler.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

const searchGuard = admin({
  permission: {
    key: (c) => {
      const section = String(c.req.query("section") ?? "");
      if (!(STUDENT_SEARCH_SECTIONS as readonly string[]).includes(section))
        throw new RouteParamError("section", "section 이 올바르지 않아요.");
      return section;
    },
  },
  unhandledMessage: "학생을 검색하지 못했어요.",
  logLabel: "[admin/students/search]",
});

export const students = adminFactory
  .createApp()
  .get(
    "/search",
    searchGuard,
    validate("query", studentSearchQuery),
    async (c) => {
      // PostgREST 의 or 필터는 콤마, 괄호로 절을 구분한다. 검색어에 그 문자가 있으면 필터 문법이 깨지므로 걷어낸다.
      const q = c.req
        .valid("query")
        .q.replace(/[,()*"\\]/g, "")
        .trim();
      if (!q) return c.json({ items: [] } satisfies StudentSearchList);

      // ilike 의 기본 이스케이프 문자는 백슬래시다. 위에서 백슬래시를 걷었으므로 %, _ 만 이스케이프하면 된다.
      const pattern = q.replace(/[%_]/g, "\\$&");

      const { data, error } = await c.var.supabaseAdmin
        .from("profiles")
        .select("id, name, email, role")
        .or("member_type.eq.student,role.eq.admin")
        .or(`email.ilike.%${pattern}%,name.ilike.%${pattern}%`)
        .limit(STUDENT_SEARCH_LIMIT);
      if (error) throw new Error("profiles search failed");

      return c.json({
        items: (data ?? []).map(
          (p: {
            id: string;
            name: string | null;
            email: string | null;
            role: string | null;
          }) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            isAdmin: p.role === "admin",
          }),
        ),
      } satisfies StudentSearchList);
    },
  )
  .all("/search", methodNotAllowed("GET"));
