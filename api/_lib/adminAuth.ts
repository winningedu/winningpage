// 서버측 관리자 판정 — SQL `public.is_admin()`의 JS 미러.
//
// 왜 미러가 필요한가
//   api/ 라우트는 `createSupabaseAdmin()`(service_role)로 붙는데, service_role은
//   **RLS를 통째로 우회한다.** 즉 `is_admin()`을 술어로 쓰는 RLS 정책이
//   (예: sql/53_performance.sql의 winning_assessment_knowledge_items 정책)
//   서버 경로에서는 아무것도 막아주지 않는다. 그래서 "누가 무엇을 할 수
//   있는지"는 라우트가 직접 검사해야 한다(api/_lib/supabaseAdmin.js 상단 주석).
//
// 무엇을 미러하는가 — sql/00_base_schema.sql:1273-1286
//   create function public.is_admin() returns boolean
//     select exists (select 1 from public.profiles
//                     where id = auth.uid() and role = 'admin');
//   판정 축은 **uid 단일**, 허용 role은 **'admin' 단독**이다. 아래 구현은
//   `auth.uid()` 자리에 `supabaseAdmin.auth.getUser(token)`으로 검증한 uid를
//   넣은 것 외에는 같은 술어다.
//
// ⚠️ `is_winning_admin()`(:1338-1353)이 아니다. 그쪽은 uid 외에 JWT의 email
//   문자열로도 profiles 행을 찾고(`profiles.email`에 UNIQUE가 없어 동일 이메일
//   행이 둘 이상이면 다른 계정이 admin 행에 매칭될 수 있다) role 집합도 4개로
//   넓다(단 `profiles_role_check`가 값을 'user'/'admin' 둘로 제한하므로 확장분은
//   이 DB에서 사문이다). 지식베이스는 유료 상품의 원천 자산이라 판정 축을 넓힐
//   이유가 없어 좁은 쪽인 `is_admin()`으로 잠근다.
//   (근거: docs/수행평가-상세-명세.md §8.7, sql/53_performance.sql (1-a))
//
// ⚠️ 여기서 `is_active`는 보지 않는다. `is_admin()`이 보지 않기 때문이다.
//   DB 판정과 서버 판정이 어긋나면 "어드민 화면에서는 되는데 API는 막힌다"
//   (혹은 그 반대)가 되므로, 조건을 임의로 더하지 않는다. 비활성 관리자까지
//   막으려면 SQL 함수와 이 파일을 **같이** 고쳐야 한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isQaAccount,
  isReadMethod,
  QA_ACCOUNT_MESSAGE,
  QA_ACCOUNT_READ_ONLY_CODE,
} from "./qaAccount.js";
import { getBearerToken } from "./serviceAccess.js";

export { getBearerToken };

export type AdminResolution =
  | { ok: true; userId: string }
  | { ok: false; status: number; detail: string; code?: string };

// QA 본사 관리자는 읽기만 된다. 관리자임이 확인된 뒤에만 부르므로 여기서 QA 이면 곧 QA 관리자다.
async function rejectQaWrite(
  supabaseAdmin: SupabaseClient,
  userId: string,
  method: string | undefined,
): Promise<AdminResolution | null> {
  if (isReadMethod(method) || !(await isQaAccount(supabaseAdmin, userId))) {
    return null;
  }
  return {
    ok: false,
    status: 403,
    code: QA_ACCOUNT_READ_ONLY_CODE,
    detail: QA_ACCOUNT_MESSAGE,
  };
}

/**
 * Authorization: Bearer <supabase access token> → 관리자 판정.
 *
 * @param supabaseAdmin service_role 클라이언트
 * @returns 호출부는 실패 시 `status`/`detail`을 그대로 응답에 실으면 된다.
 */
export async function resolveAdmin(
  supabaseAdmin: SupabaseClient,
  req: { headers: Record<string, string>; method?: string | undefined },
): Promise<AdminResolution> {
  const token = getBearerToken(req);

  if (!token) {
    return { ok: false, status: 401, detail: "로그인이 필요합니다." };
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);

  if (userError || !userData?.user?.id) {
    return { ok: false, status: 401, detail: "로그인이 필요합니다." };
  }

  const userId = userData.user.id;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  // 조회 자체가 실패한 것을 "권한 없음"으로 뭉개면 원인이 안 보인다.
  // 권한 거부(403)와 서버 오류(500)를 구분해서 돌려준다.
  if (profileError) {
    return {
      ok: false,
      status: 500,
      detail: "관리자 권한 확인에 실패했습니다.",
    };
  }

  if (!profile || String(profile.role || "") !== "admin") {
    return { ok: false, status: 403, detail: "관리자 권한이 필요합니다." };
  }

  return (
    (await rejectQaWrite(supabaseAdmin, userId, req.method)) ?? {
      ok: true,
      userId,
    }
  );
}

// 목표관리(goal) 도메인 어드민 판정 — SQL `public.is_winning_admin()`의 JS 미러.
//
// 왜 별도 함수인가
//   위 resolveAdmin()은 `is_admin()`(uid 단일, role='admin' 단독)을 미러한다.
//   그런데 goal_students의 기존 RLS 정책(`goal_students_admin_select`,
//   sql/55_goal_management.sql)은 `is_winning_admin()`을 쓴다 — uid 또는 JWT
//   email로 profiles 행을 찾고, role in ('admin', 'admin_basic', 'admin_manager',
//   'admin_master') 4종을 허용한다. 목표관리 도메인 라우트(예:
//   api/goal/admin/reset-student.js)가 이 판정 기준과 다르면 "어드민 화면에서는
//   되는데 API는 막힌다"가 생기므로, 여기서는 반드시 `is_winning_admin()`을
//   그대로 미러한다(resolveAdmin은 건드리지 않는다 — 다른 곳에서 이미 씀).
//
// 무엇을 미러하는가 — sql/00_base_schema.sql:1338-1353
//   create function public.is_winning_admin() returns boolean
//     select exists (select 1 from public.profiles
//                     where (profiles.id = auth.uid()
//                            or lower(profiles.email) = lower(auth.jwt() ->> 'email'))
//                       and profiles.role in ('admin', 'admin_basic', 'admin_manager', 'admin_master'));
//
/**
 * Authorization: Bearer <supabase access token> → 목표관리 어드민 판정.
 *
 * @param supabaseAdmin service_role 클라이언트
 * @returns 호출부는 실패 시 `status`/`detail`을 그대로 응답에 실으면 된다.
 */
export async function resolveWinningAdmin(
  supabaseAdmin: SupabaseClient,
  req: { headers: Record<string, string>; method?: string | undefined },
): Promise<AdminResolution> {
  const token = getBearerToken(req);

  if (!token) {
    return { ok: false, status: 401, detail: "로그인이 필요합니다." };
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);

  if (userError || !userData?.user?.id) {
    return { ok: false, status: 401, detail: "로그인이 필요합니다." };
  }

  const userId = userData.user.id;
  const jwtEmail = String(userData.user.email || "").toLowerCase();

  // is_winning_admin()과 같은 술어: id = uid OR lower(email) = lower(jwt email).
  // profiles.email에는 UNIQUE가 없어 매칭 행이 둘 이상일 수 있으므로, 그중
  // 하나라도 4개 role 집합에 속하면 통과시킨다(SQL exists()와 동일 의미).
  const orFilter = jwtEmail
    ? `id.eq.${userId},email.ilike.${jwtEmail}`
    : `id.eq.${userId}`;
  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, email")
    .or(orFilter);

  if (profileError) {
    return {
      ok: false,
      status: 500,
      detail: "관리자 권한 확인에 실패했습니다.",
    };
  }

  const ALLOWED_ROLES = new Set([
    "admin",
    "admin_basic",
    "admin_manager",
    "admin_master",
  ]);
  const isAdmin = (profiles || []).some((profile) => {
    const matchesId = profile.id === userId;
    const matchesEmail =
      jwtEmail && String(profile.email || "").toLowerCase() === jwtEmail;
    return (
      (matchesId || matchesEmail) &&
      ALLOWED_ROLES.has(String(profile.role || ""))
    );
  });

  if (!isAdmin) {
    return { ok: false, status: 403, detail: "관리자 권한이 필요합니다." };
  }

  return (
    (await rejectQaWrite(supabaseAdmin, userId, req.method)) ?? {
      ok: true,
      userId,
    }
  );
}
