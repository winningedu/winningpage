// Vercel 서버리스 함수: 학생 결제 요청(수강신청) 생성
//
// 학생은 여기서 결제를 하지 않는다. "요청"만 만들고, 학부모가 마이페이지에서
// fn_respond_enrollment 로 수락(+쿠폰 적용)해야 실제 결제로 이어진다
// (sql/68·69_payment_flow_hardening.sql, StudentEnrollmentRequest.jsx 상단 주석).
//
// 신뢰 경계 — body 의 parentProfileId·금액류 필드는 전부 무시한다. 학부모는
// parent_child_links(status='approved') 로 서버가 다시 조회하고, 금액은
// products 재조회로 재계산한다(아래 3)·4) — api/create-order.js 의 서버
// 재계산 패턴을 그대로 이식했다. 클라이언트가 무엇을 보내든 위조 이득이 없다.
//
// 필요 환경변수:
//   WINNING_SUPABASE_URL / SUPABASE_URL / VITE_SUPABASE_URL
//   WINNING_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY
//
// 수량 계약: body.items[] 는 { id, quantity? } 이고 quantity 는 정수(생략 시 1)다.
// 추가 이용권(products.addon_only)만 1~10 을 허용하고 일반 상품은 1 고정이다.
// 같은 상품 id 를 두 번 보내면 거부한다. 여기서의 검증은 UX 용 선제 거부이고
// 정본은 fn_request_enrollment 의 WC067(살아있는 부여 없음)과 WC068(수량 위반)이다.

import crypto from "node:crypto";
import { defineHandler } from "./_lib/handler.js";
import { getBearerToken } from "./_lib/serviceAccess.js";

// products 테이블에서 조회한 행 중 이 라우트가 실제로 읽는 필드만 담는다.
type ProductRow = {
  id: string;
  slug: string;
  service_key: string;
  name: string;
  list_price: number | null;
  price: number | null;
  is_active: boolean;
  is_orderable: boolean;
  addon_only: boolean;
  program_key: string | null;
};

const INVALID_QUANTITY_MESSAGE = "결제 수량이 올바르지 않습니다.";
const ADDON_MAX_QUANTITY = 10;

function clean(value: unknown) {
  return String(value || "").trim();
}

function buildOrderName(products: ProductRow[]) {
  if (products.length === 0) return "위닝에듀 서비스";
  const first = products[0]!.name || "위닝에듀 서비스";
  return products.length === 1 ? first : `${first} 외 ${products.length - 1}건`;
}

export default defineHandler({
  methods: ["POST"],
  // 이 라우트는 상품 미선택(400)을 토큰 검사보다 먼저 하고, 401도 문구가 두
  // 가지(로그인 필요/만료)로 갈린다 — defineHandler auth:"user"는 이 순서와
  // 문구를 보존할 수 없어(_lib/handler.ts는 auth를 항상 handler보다 먼저
  // 해석하고 401 문구도 하나로 고정한다) auth:"none" + 공유 getBearerToken을
  // 쓴다(api/docs/batch-3-issues.md 참고).
  auth: "none",
  errorShape: "error",
  unhandledMessage: "결제요청에 실패했습니다.",
  logLabel: "request-enrollment",
  handler: async (req, res, ctx) => {
    try {
      const body = req.body || {};
      const rawItems = Array.isArray(body.items) ? body.items : [];

      const requested = rawItems
        .map((it): { id: string; quantity: number } => ({
          id: clean(it?.id),
          quantity: it?.quantity ?? 1,
        }))
        .filter((it) => it.id);
      if (requested.length === 0) {
        return void res.status(400).json({ error: "선택된 상품이 없습니다." });
      }
      if (requested.some((it) => !Number.isInteger(it.quantity))) {
        return void res.status(400).json({ error: INVALID_QUANTITY_MESSAGE });
      }
      const productIds = [...new Set(requested.map((it) => it.id))];
      if (productIds.length !== requested.length) {
        return void res
          .status(400)
          .json({ error: "중복된 상품이 포함되어 있습니다." });
      }
      const quantityById = new Map<string, number>(
        requested.map((it) => [it.id, it.quantity]),
      );

      const supabaseAdmin = ctx.supabaseAdmin;

      // 1) 학생 확정 — 요청 토큰으로만 신원을 정한다(body 의 studentProfileId 는 없다).
      const token = getBearerToken(req);
      if (!token) {
        return void res.status(401).json({ error: "로그인이 필요합니다." });
      }
      const { data: userData, error: userError } =
        await supabaseAdmin.auth.getUser(token);
      const studentId = userData?.user?.id ?? null;
      const customerEmail = userData?.user?.email ?? null;
      if (userError || !studentId) {
        return void res
          .status(401)
          .json({ error: "로그인이 만료되었습니다. 다시 로그인해 주세요." });
      }

      // 2) 회원유형 확인 — api/lookup-child.js 의 회원유형 검사 패턴과 동일.
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("member_type")
        .eq("id", studentId)
        .maybeSingle();

      if (profileError) {
        console.error("profiles 조회 오류:", profileError);
        return void res.status(500).json({ error: "결제요청에 실패했습니다." });
      }
      if (profile?.member_type !== "student") {
        return void res
          .status(403)
          .json({ error: "학생 회원만 이용할 수 있습니다." });
      }

      // 3) 학부모 연결 재조회 — body 의 parentProfileId 는 신뢰하지 않고 무시한다.
      const { data: link, error: linkError } = await supabaseAdmin
        .from("parent_child_links")
        .select("parent_id")
        .eq("student_id", studentId)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();

      if (linkError) {
        console.error("parent_child_links 조회 오류:", linkError);
        return void res.status(500).json({ error: "결제요청에 실패했습니다." });
      }
      if (!link?.parent_id) {
        return void res.status(409).json({ error: "no_linked_parent" });
      }

      // 3-1) 연결된 학부모 이름 조회 (QA F2, 2026-08-27) — 완료 화면에 표시만 하는
      //      부가 정보라 조회가 실패해도 본 요청을 막지 않고 null로 내려보낸다.
      const { data: parentProfile } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("id", link.parent_id)
        .maybeSingle();
      const parentName = parentProfile?.name ?? null;

      // 4) 상품 조회 (서버 신뢰 가격) — api/create-order.js:73-88 패턴 이식. is_orderable
      //    은 셀프서브 결제 카탈로그(products.is_orderable, 20260825 도입) 전용 게이트다
      //    — is_active(판매 중)와 별개로 학생 수강신청 흐름에서 제외할 상품을 막는다.
      const { data: products, error: productError } = await supabaseAdmin
        .from("products")
        .select(
          "id, slug, service_key, name, list_price, price, is_active, is_orderable, addon_only, program_key",
        )
        .in("id", productIds)
        .eq("is_active", true)
        .eq("is_orderable", true);

      if (productError) {
        console.error("products 조회 오류:", productError);
        return void res
          .status(500)
          .json({ error: "상품 정보를 불러오지 못했습니다." });
      }
      if (!products || products.length !== productIds.length) {
        return void res
          .status(400)
          .json({ error: "판매 중이 아닌 상품이 포함되어 있습니다." });
      }

      const quantityOf = (p: ProductRow) => quantityById.get(p.id) ?? 1;
      const validQuantity = (p: ProductRow) =>
        p.addon_only
          ? quantityOf(p) >= 1 && quantityOf(p) <= ADDON_MAX_QUANTITY
          : quantityOf(p) === 1;
      if (!products.every(validQuantity)) {
        return void res.status(400).json({ error: INVALID_QUANTITY_MESSAGE });
      }

      const listTotal = products.reduce(
        (s, p) => s + Number(p.list_price || p.price || 0) * quantityOf(p),
        0,
      );
      const subtotal = products.reduce(
        (s, p) => s + Number(p.price || 0) * quantityOf(p),
        0,
      );

      const orderId = `order_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const orderName = buildOrderName(products);

      // 5) fn_request_enrollment 호출 — 쿠폰 인자는 없다(쿠폰은 학부모 수락 단계에서
      //    fn_respond_enrollment 가 적용한다, 사용자 확정). p_items 매핑은
      //    api/create-order.js:122-130 과 동일한 형태를 따른다.
      const { data: rows, error: rpcError } = await supabaseAdmin.rpc(
        "fn_request_enrollment",
        {
          p_order_id: orderId,
          p_student_profile_id: studentId,
          p_parent_profile_id: link.parent_id,
          p_customer_email: customerEmail,
          p_order_name: orderName,
          p_items: products.map((p) => ({
            product_id: p.id,
            product_slug: p.slug,
            service_key: p.service_key,
            name: p.name,
            list_price: Number(p.list_price || p.price || 0),
            price: Number(p.price || 0),
            quantity: quantityOf(p),
          })),
          p_list_amount: listTotal,
          p_subtotal: subtotal,
        },
      );

      if (rpcError) {
        // DB 에러 원문을 클라이언트에 흘리지 않는다 — errcode 로만 매핑한다.
        // WC042/WC043 은 sql/71 이 fn_request_enrollment 에 추가하는 신규 게이트
        // (advisory lock + fn_is_linked_pair 판정 + 중복 open 요청 검사)의 코드다.
        if (rpcError.code === "WC043") {
          return void res.status(409).json({ error: "duplicate_open_request" });
        }
        if (rpcError.code === "WC042") {
          return void res.status(409).json({ error: "no_linked_parent" });
        }
        if (rpcError.code === "WC001") {
          return void res
            .status(400)
            .json({ error: "결제 금액이 올바르지 않습니다." });
        }
        if (rpcError.code === "WC067") {
          return void res
            .status(409)
            .json({ error: "addon_requires_live_grant" });
        }
        if (rpcError.code === "WC068") {
          return void res.status(400).json({ error: INVALID_QUANTITY_MESSAGE });
        }
        // WC064~066 은 20260901050440 이 fn_request_enrollment 에 추가하는 org
        // 한정 상품(부산캠퍼스 특가 등) 검증 게이트다 — 정본은 DB 함수이고, UI 단에서
        // 이미 막혀 있어 개별 메시지 없이 범용 에러로만 표면화한다.
        if (
          rpcError.code === "WC064" ||
          rpcError.code === "WC065" ||
          rpcError.code === "WC066"
        ) {
          return void res
            .status(409)
            .json({ error: "결제요청에 실패했습니다." });
        }
        console.error("fn_request_enrollment 오류:", rpcError);
        return void res.status(500).json({ error: "결제요청에 실패했습니다." });
      }

      const row = rows?.[0] ?? {};
      const amount = Number(row.amount ?? 0);
      if (!amount) {
        console.error("fn_request_enrollment 응답에 amount 없음:", rows);
        return void res.status(500).json({ error: "결제요청에 실패했습니다." });
      }

      return void res.status(200).json({
        orderId: row.order_id ?? orderId,
        orderName,
        listAmount: listTotal,
        discountAmount: Number(row.discount_amount ?? 0),
        amount,
        parentName,
      });
    } catch (err) {
      console.error("request-enrollment error:", err);
      return void res.status(500).json({ error: "결제요청에 실패했습니다." });
    }
  },
});
