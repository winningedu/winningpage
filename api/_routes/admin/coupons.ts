// /api/admin/coupons 아래 쿠폰 관리 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/coupons", coupons) 로 붙인다.
// 핸들러는 경로 바로 뒤에 인라인으로 쓰고, 요청 검증과 응답 모양은 shared/coupon/contract.ts 를 따른다.
// 경로마다 메서드 뒤에 .all(path, methodNotAllowed(...)) 를 단다. 글자 그대로인 /user-search 는 /:id 보다 먼저 등록한다.
// 권한: 메뉴 coupons. GET 은 view, 쓰기는 edit. user-search 는 발급 흐름에서만 불러 edit 다.
// 예전 화면도 쿠폰에 소속 범위를 두지 않았다(RLS 는 is_admin 뿐). 그래서 id 읽기와 수정은 소속으로 거르지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COUPON_HISTORY_LIMIT,
  COUPON_SCAN_LIMIT,
  COUPON_USER_SEARCH_LIMIT,
  type CouponList,
  couponIdParams,
  couponSaveBody,
  grantBody,
  reasonBody,
  rowIdParams,
  userSearchQuery,
} from "../../../shared/coupon/contract.js";
import {
  GRANT_ERRORS,
  REVOKE_ERRORS,
  throwRpcError,
  VOID_ERRORS,
} from "../../_lib/coupon/rpcError.js";
import { throwCouponSaveError } from "../../_lib/coupon/saveError.js";
import { attachUsers } from "../../_lib/coupon/users.js";
import { admin, userClient } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, notFound } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

/** 없는 쿠폰이면 404 NOT_FOUND 를 던진다. */
async function assertCouponExists(
  db: SupabaseClient,
  couponId: string,
): Promise<void> {
  const coupon = await db
    .from("coupons")
    .select("id")
    .eq("id", couponId)
    .maybeSingle();
  if (coupon.error) throw new Error("coupon read failed");
  if (!coupon.data) throw notFound("쿠폰");
}

const couponGuard = admin({
  permission: { key: "coupons" },
  unhandledMessage: "쿠폰을 처리하지 못했어요.",
  logLabel: "[admin/coupons]",
});
const userSearchGuard = admin({
  permission: { key: "coupons", level: "edit" },
  unhandledMessage: "사용자를 검색하지 못했어요.",
  logLabel: "[admin/coupons/user-search]",
});
const couponByIdGuard = admin({
  permission: { key: "coupons" },
  unhandledMessage: "쿠폰을 처리하지 못했어요.",
  logLabel: "[admin/coupons/id]",
});
const grantsGuard = admin({
  permission: { key: "coupons" },
  unhandledMessage: "쿠폰 발급을 처리하지 못했어요.",
  logLabel: "[admin/coupons/grants]",
});
const redemptionsGuard = admin({
  permission: { key: "coupons" },
  unhandledMessage: "쿠폰 사용 이력을 불러오지 못했어요.",
  logLabel: "[admin/coupons/redemptions]",
});
const revokeGuard = admin({
  permission: { key: "coupons" },
  // 기존 발급 행을 바꾸는 일이라 등록이 아니라 수정으로 남긴다.
  audit: { action: "update" },
  unhandledMessage: "쿠폰 발급을 회수하지 못했어요.",
  logLabel: "[admin/coupons/grants/[id]/revoke]",
});
const voidGuard = admin({
  permission: { key: "coupons" },
  // 기존 사용 이력을 바꾸는 일이라 등록이 아니라 수정으로 남긴다.
  audit: { action: "update" },
  unhandledMessage: "쿠폰 사용 이력을 취소하지 못했어요.",
  logLabel: "[admin/coupons/redemptions/[id]/void]",
});

export const coupons = adminFactory
  .createApp()
  // GET /: 쿠폰 목록과 화면이 함께 쓰는 곁가지(사용 통계, 발급된 쿠폰 id, 소속 선택지)를 한 번에 돌려준다.
  //   곁가지는 각자 실패해도 목록은 살려야 해서 그 필드만 null 로 열화시킨다.
  //   소속은 관리자 토큰 클라이언트로 읽어 tenants RLS 가 보이는 범위를 정하게 둔다.
  .get("/", couponGuard, async (c) => {
    const db = c.var.supabaseAdmin;
    const [couponRows, redemptions, grants, tenants] = await Promise.all([
      db.from("coupons").select("*").order("slug", { ascending: true }),
      db
        .from("coupon_redemptions")
        .select("coupon_id, voided_at")
        .limit(COUPON_SCAN_LIMIT),
      db
        .from("coupon_grants")
        .select("coupon_id")
        .is("revoked_at", null)
        .limit(COUPON_SCAN_LIMIT),
      userClient(c).from("tenants").select("id, name").order("name"),
    ]);
    if (couponRows.error) throw new Error("coupons read failed");

    let redemptionStats: CouponList["redemptionStats"] = null;
    if (redemptions.error) {
      console.warn("쿠폰 사용 통계 조회 실패:", redemptions.error.message);
    } else {
      const byCoupon: Record<string, { active: number; total: number }> = {};
      for (const row of redemptions.data ?? []) {
        const stat = byCoupon[row.coupon_id] ?? { active: 0, total: 0 };
        stat.total += 1;
        if (row.voided_at === null) stat.active += 1;
        byCoupon[row.coupon_id] = stat;
      }
      redemptionStats = {
        byCoupon,
        truncated: (redemptions.data ?? []).length >= COUPON_SCAN_LIMIT,
      };
    }

    let grantedCouponIds: string[] | null = null;
    if (grants.error) {
      console.warn("쿠폰 발급 여부 조회 실패:", grants.error.message);
    } else {
      grantedCouponIds = [
        ...new Set((grants.data ?? []).map((row) => row.coupon_id)),
      ];
    }

    if (tenants.error) {
      console.warn("소속 목록 조회 실패:", tenants.error.message);
    }

    return c.json({
      items: couponRows.data ?? [],
      redemptionStats,
      grantedCouponIds,
      tenants: tenants.error ? null : (tenants.data ?? []),
    } satisfies CouponList);
  })
  // POST /: 쿠폰 등록. 제약 위반은 throwCouponSaveError 가 409, 422 로 바꾼다.
  .post("/", couponGuard, validate("json", couponSaveBody), async (c) => {
    const { data, error } = await c.var.supabaseAdmin
      .from("coupons")
      .insert(c.req.valid("json"))
      .select("*")
      .single();
    if (error) throwCouponSaveError(error);
    return c.json(data, 201);
  })
  .all("/", methodNotAllowed("GET", "POST"))
  // GET /user-search?q=<1..100자>: 쿠폰 발급 대상 검색. 학생만이 아니라 전체 프로필에서 이메일이나 이름으로 20건까지 찾는다.
  .get(
    "/user-search",
    userSearchGuard,
    validate("query", userSearchQuery),
    async (c) => {
      // PostgREST 의 or 필터는 콤마, 괄호로 절을 구분한다. 검색어에 그 문자가 있으면 필터 문법이 깨지므로 걷어낸다.
      const q = c.req
        .valid("query")
        .q.replace(/[,()*"\\]/g, "")
        .trim();
      if (!q) return c.json({ items: [] });

      // ilike 의 기본 이스케이프 문자는 백슬래시다. 위에서 백슬래시를 걷었으므로 %, _ 만 이스케이프하면 된다.
      const pattern = q.replace(/[%_]/g, "\\$&");

      const { data, error } = await c.var.supabaseAdmin
        .from("profiles")
        .select("id, name, email")
        .or(`email.ilike.%${pattern}%,name.ilike.%${pattern}%`)
        .limit(COUPON_USER_SEARCH_LIMIT);
      if (error) throw new Error("profiles search failed");

      return c.json({ items: data ?? [] });
    },
  )
  .all("/user-search", methodNotAllowed("GET"))
  // GET /:id: 쿠폰 한 건. PATCH /:id: 같은 본문으로 전체 수정. 없는 id 는 404 NOT_FOUND, uuid 가 아니면 400.
  .get(
    "/:id",
    couponByIdGuard,
    validate("param", couponIdParams),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("coupons")
        .select("*")
        .eq("id", c.req.valid("param").id)
        .maybeSingle();
      if (error) throw new Error("coupon read failed");
      if (!data) throw notFound("쿠폰");
      return c.json(data);
    },
  )
  .patch(
    "/:id",
    couponByIdGuard,
    validate("param", couponIdParams),
    validate("json", couponSaveBody),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("coupons")
        .update(c.req.valid("json"))
        .eq("id", c.req.valid("param").id)
        .select("*")
        .maybeSingle();
      if (error) throwCouponSaveError(error);
      if (!data) throw notFound("쿠폰");
      return c.json(data);
    },
  )
  .all("/:id", methodNotAllowed("GET", "PATCH"))
  // GET /:id/grants: 쿠폰의 발급 이력(최근 200건)에 사용자 이름과 이메일을 붙여 { items } 로 돌려준다.
  // POST /:id/grants { userId }: fn_grant_coupon 으로 발급한다. 이미 살아 있는 발급이 있으면 그 행을 그대로 돌려준다
  //   (부분 유니크 인덱스로 멱등). 함수가 auth.uid() 로 is_admin() 을 확인하므로 관리자 토큰 클라이언트로 부른다(service_role 은 uid 가 null).
  .get(
    "/:id/grants",
    grantsGuard,
    validate("param", couponIdParams),
    async (c) => {
      const couponId = c.req.valid("param").id;
      const db = c.var.supabaseAdmin;
      await assertCouponExists(db, couponId);

      const { data, error } = await db
        .from("coupon_grants")
        .select("*")
        .eq("coupon_id", couponId)
        .order("granted_at", { ascending: false })
        .limit(COUPON_HISTORY_LIMIT);
      if (error) throw new Error("coupon grants read failed");

      return c.json({ items: await attachUsers(db, data ?? []) });
    },
  )
  .post(
    "/:id/grants",
    grantsGuard,
    validate("param", couponIdParams),
    validate("json", grantBody),
    async (c) => {
      const couponId = c.req.valid("param").id;
      await assertCouponExists(c.var.supabaseAdmin, couponId);

      const { data, error } = await userClient(c).rpc("fn_grant_coupon", {
        p_coupon_id: couponId,
        p_user_id: c.req.valid("json").userId,
      });
      if (error) throwRpcError(error, GRANT_ERRORS);
      return c.json(data);
    },
  )
  .all("/:id/grants", methodNotAllowed("GET", "POST"))
  // GET /:id/redemptions: 쿠폰의 사용 이력(최근 200건)에 사용자 이름과 이메일을 붙여 { items } 로 돌려준다. 없는 쿠폰은 404.
  .get(
    "/:id/redemptions",
    redemptionsGuard,
    validate("param", couponIdParams),
    async (c) => {
      const couponId = c.req.valid("param").id;
      const db = c.var.supabaseAdmin;
      await assertCouponExists(db, couponId);

      const { data, error } = await db
        .from("coupon_redemptions")
        .select("*")
        .eq("coupon_id", couponId)
        .order("created_at", { ascending: false })
        .limit(COUPON_HISTORY_LIMIT);
      if (error) throw new Error("coupon redemptions read failed");

      return c.json({ items: await attachUsers(db, data ?? []) });
    },
  )
  .all("/:id/redemptions", methodNotAllowed("GET"))
  // POST /grants/:id/revoke { reason?: string }: 발급 한 건을 회수한다. 이미 회수된 발급은 409 GRANT_ALREADY_REVOKED, 없으면 404.
  //   fn_revoke_coupon_grant 가 auth.uid() 로 is_admin() 을 확인하므로 관리자 토큰 클라이언트로 부른다.
  //   회수는 revoked_at 이 비었을 때만 바뀌는 조건부 갱신이라 다시 불러도 두 번 회수되지 않는다.
  //   검증 순서는 본문, 경로 id 다(defineHandler 의 body, query 순서).
  .post(
    "/grants/:id/revoke",
    revokeGuard,
    validate("json", reasonBody),
    validate("param", rowIdParams),
    async (c) => {
      const grantId = c.req.valid("param").id;
      const target = await c.var.supabaseAdmin
        .from("coupon_grants")
        .select("id")
        .eq("id", grantId)
        .maybeSingle();
      if (target.error) throw new Error("coupon_grants read failed");
      if (!target.data) throw notFound("발급");

      // p_reason 은 선택 인자라 값이 없으면 키를 뺀다.
      const trimmed = c.req.valid("json").reason?.trim();
      const { data, error } = await userClient(c).rpc(
        "fn_revoke_coupon_grant",
        { p_grant_id: grantId, ...(trimmed ? { p_reason: trimmed } : {}) },
      );
      if (error) throwRpcError(error, REVOKE_ERRORS);
      return c.json(data);
    },
  )
  .all("/grants/:id/revoke", methodNotAllowed("POST"))
  // POST /redemptions/:id/void { reason?: string }: 사용 이력 한 건을 취소해 주문의 쿠폰 사용을 되돌린다.
  //   이미 취소된 이력은 409 REDEMPTION_ALREADY_VOIDED, 없으면 404. 함수와 조건부 갱신은 회수와 같다.
  .post(
    "/redemptions/:id/void",
    voidGuard,
    validate("json", reasonBody),
    validate("param", rowIdParams),
    async (c) => {
      const redemptionId = c.req.valid("param").id;
      const target = await c.var.supabaseAdmin
        .from("coupon_redemptions")
        .select("id")
        .eq("id", redemptionId)
        .maybeSingle();
      if (target.error) throw new Error("coupon_redemptions read failed");
      if (!target.data) throw notFound("사용 이력");

      // p_reason 은 선택 인자라 값이 없으면 키를 뺀다.
      const trimmed = c.req.valid("json").reason?.trim();
      const { data, error } = await userClient(c).rpc(
        "fn_void_coupon_redemption",
        {
          p_redemption_id: redemptionId,
          ...(trimmed ? { p_reason: trimmed } : {}),
        },
      );
      if (error) throwRpcError(error, VOID_ERRORS);
      return c.json(data);
    },
  )
  .all("/redemptions/:id/void", methodNotAllowed("POST"));
