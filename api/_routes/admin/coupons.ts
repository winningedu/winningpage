// GET, POST /api/admin/coupons
//
// GET: 쿠폰 목록과 화면이 함께 쓰는 곁가지(사용 통계, 발급된 쿠폰 id, 소속 선택지)를 한 번에 돌려준다.
//   곁가지는 각자 실패해도 목록은 살려야 해서 그 필드만 null 로 열화시킨다.
//   소속은 관리자 토큰 클라이언트로 읽어 tenants RLS 가 보이는 범위를 정하게 둔다.
// POST: 쿠폰 등록. 제약 위반은 sendCouponSaveError 가 409, 422 로 바꾼다.
// 권한: 메뉴 coupons(GET view, POST edit).

import { parseCouponPayload } from "../../_lib/coupon/payload.js";
import { sendCouponSaveError } from "../../_lib/coupon/saveError.js";
import { defineHandler } from "../../_lib/handler.js";
import { getBearerToken } from "../../_lib/serviceAccess.js";
import { createSupabaseUserClient } from "../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

// 한 화면이 이 이상은 읽지 않는다. 넘으면 사용 통계가 잘렸음을 알린다.
const SCAN_LIMIT = 10000;

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "coupons" },
  unhandledMessage: "쿠폰을 처리하지 못했어요.",
  logLabel: "[admin/coupons]",
  handler: async (req, res, ctx) => {
    if (req.method === "POST") {
      const payload = parseCouponPayload(res, req.body);
      if (!payload) return;
      const { data, error } = await ctx.supabaseAdmin
        .from("coupons")
        .insert(payload)
        .select("*")
        .single();
      if (error) {
        sendCouponSaveError(res, error);
        return;
      }
      res.status(201).json(data);
      return;
    }

    const [coupons, redemptions, grants, tenants] = await Promise.all([
      ctx.supabaseAdmin
        .from("coupons")
        .select("*")
        .order("slug", { ascending: true }),
      ctx.supabaseAdmin
        .from("coupon_redemptions")
        .select("coupon_id, voided_at")
        .limit(SCAN_LIMIT),
      ctx.supabaseAdmin
        .from("coupon_grants")
        .select("coupon_id")
        .is("revoked_at", null)
        .limit(SCAN_LIMIT),
      createSupabaseUserClient(getBearerToken(req))
        .from("tenants")
        .select("id, name")
        .order("name"),
    ]);
    if (coupons.error) throw new Error("coupons read failed");

    let redemptionStats = null;
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
        truncated: (redemptions.data ?? []).length >= SCAN_LIMIT,
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

    res.status(200).json({
      items: coupons.data ?? [],
      redemptionStats,
      grantedCouponIds,
      tenants: tenants.error ? null : (tenants.data ?? []),
    });
  },
});
