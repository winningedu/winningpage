// 부산캠퍼스 9,900원 특별할인 번들 E2E — DB 레벨(시나리오 1~10, 16, 19 일부) +
// UI 레벨(시나리오 11~15, 17~19), busan-campus-bundle 브랜치 검증용
// (2026-09-01). 17·19는 마이페이지 "나의 서비스" grants 정본 재작성 검증.
//
// 절대 규칙(e2e-refund-ver10.mjs 관례 그대로):
//   - .env.local 이 가리키는 로컬 Supabase 스택(127.0.0.1:54321)만 대상으로
//     한다 — 다른 host 면 즉시 abort(원격 오조작 방지).
//   - 검증 서버는 5303 고정 포트의 vite 를 그대로 쓴다(재기동하지 않는다):
//     없으면 npm run dev -- --port 5303 --strictPort
//   - Playwright 세션별 격리 — 흐름마다 새 컨텍스트, storageState 공유 금지.
//     세션은 admin generate_link(magiclink) → verify 로 매번 새로 발급해
//     localStorage 에 주입한다. 로컬 스택 storageKey 는
//     `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
//     (@supabase/supabase-js SupabaseClient.ts:324 기준 — 원격 dev 스크립트의
//     `sb-<project-ref>-auth-token` 과 동일 공식, host 가 IP 라 첫 라벨이
//     "127"이 될 뿐이다).
//
// 실행: node scripts/e2e-busan-campus-bundle.mjs
// 생성한 QA 계정·주문·쿠폰·소속코드 변경은 종료 시 정리한다(실패해도 finally).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const APP_ORIGIN = "http://localhost:5303";
const RUN_TAG = `busan-${Date.now().toString(36)}`;

function loadEnv() {
  const raw = readFileSync(`${REPO_ROOT}.env.local`, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SECRET_KEY = env.SUPABASE_SECRET_KEY;
const PUBLISHABLE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const host = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "";
if (!(host === "127.0.0.1" || host === "localhost")) {
  console.error(
    `[ABORT] 로컬 스택이 아니다 — 기대 127.0.0.1/localhost, 실제 ${host}. 원격 오조작 방지를 위해 중단합니다.`,
  );
  process.exit(1);
}
const storageKey = `sb-${host.split(".")[0]}-auth-token`;
console.log(
  `[env] 로컬 스택 확인 완료: ${SUPABASE_URL} (storageKey=${storageKey})`,
);

const admin = createClient(SUPABASE_URL, SECRET_KEY);

let failures = 0;
const results = [];
function check(name, cond, detail = "") {
  if (cond) {
    results.push(["PASS", name]);
    console.log(`[PASS] ${name}`);
  } else {
    failures += 1;
    results.push(["FAIL", name, detail]);
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 정리 대상 레지스트리
// ---------------------------------------------------------------------------
/**
 * @typedef {{
 *   userIds: string[],
 *   orderIds: string[],
 *   couponIds: string[],
 *   linkIds: string[],
 *   productPatches: Array<{
 *     table: string,
 *     match: Record<string, unknown>,
 *     restore: Record<string, unknown>,
 *   }>,
 * }} CleanupRegistry
 */
/** @type {CleanupRegistry} */
const cleanup = {
  userIds: [],
  orderIds: [],
  couponIds: [],
  linkIds: [],
  productPatches: [], // { table, match, restore }
};

async function mkUser(label, memberType, orgCode) {
  const email = `${RUN_TAG}-${label}@winning.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `Busan9900!${RUN_TAG}`,
  });
  if (error) throw new Error(`createUser(${label}) 실패: ${error.message}`);
  const id = data.user.id;
  cleanup.userIds.push(id);
  const { error: pErr } = await admin.from("profiles").upsert({
    id,
    email,
    name: `QA ${label}`,
    role: "user",
    member_type: memberType,
    org_code: orgCode ?? null,
  });
  if (pErr) throw new Error(`profiles upsert(${label}) 실패: ${pErr.message}`);
  return { id, email };
}

async function linkPair(parent, student) {
  const { data, error } = await admin
    .from("parent_child_links")
    .insert({
      parent_id: parent.id,
      student_id: student.id,
      status: "approved",
      responded_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error)
    throw new Error(`parent_child_links insert 실패: ${error.message}`);
  cleanup.linkIds.push(data.id);
}

async function mintSession(email) {
  const glRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SECRET_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const glBody = await glRes.json();
  if (!glRes.ok)
    throw new Error(
      `generate_link 실패: ${glRes.status} ${JSON.stringify(glBody)}`,
    );
  const tokenHash = glBody.hashed_token || glBody.properties?.hashed_token;

  const vfRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await vfRes.json();
  if (!vfRes.ok || !session.access_token)
    throw new Error(`verify 실패: ${vfRes.status} ${JSON.stringify(session)}`);

  return {
    storageVal: JSON.stringify({
      access_token: session.access_token,
      token_type: session.token_type || "bearer",
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      refresh_token: session.refresh_token,
      user: session.user,
    }),
    accessToken: session.access_token,
  };
}

async function rpcAsUser(email, fn, args) {
  const { accessToken } = await mintSession(email);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok)
    return {
      data: null,
      error: {
        message: body?.message || `HTTP ${res.status}`,
        code: body?.code,
      },
    };
  return { data: body, error: null };
}

// 흐름마다 완전히 새 컨텍스트 — storageState 공유 금지(세션별 격리 원칙).
async function freshPage(browser, email) {
  const { storageVal } = await mintSession(email);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, storageVal],
  );
  const page = await context.newPage();
  return { context, page };
}

// ---------------------------------------------------------------------------
// DB helper — 상품 조회
// ---------------------------------------------------------------------------
async function getProduct(slug) {
  const { data, error } = await admin
    .from("products")
    .select(
      "id, slug, service_key, name, list_price, price, org_code, sale_ends_at",
    )
    .eq("slug", slug)
    .single();
  if (error) throw new Error(`products(${slug}) 조회 실패: ${error.message}`);
  return data;
}

async function requestEnrollment(orderId, student, parent, product) {
  return admin.rpc("fn_request_enrollment", {
    p_order_id: orderId,
    p_student_profile_id: student.id,
    p_parent_profile_id: parent.id,
    p_customer_email: parent.email,
    p_order_name: product.name,
    p_items: [
      {
        product_id: product.id,
        product_slug: product.slug,
        service_key: product.service_key,
        name: product.name,
        list_price: product.list_price,
        price: product.price,
        quantity: 1,
      },
    ],
    p_list_amount: product.list_price,
    p_subtotal: product.price,
  });
}

async function approveAndPay(orderId, parent) {
  const { error: respErr } = await rpcAsUser(
    parent.email,
    "fn_respond_enrollment",
    {
      p_order_id: orderId,
      p_approve: true,
      p_reject_reason: null,
      p_coupon_ids: null,
    },
  );
  if (respErr)
    throw new Error(`fn_respond_enrollment 실패: ${respErr.message}`);
  const now = new Date().toISOString();
  const { error: payErr } = await admin
    .from("orders")
    .update({ status: "paid", paid_at: now })
    .eq("id", orderId);
  if (payErr) throw new Error(`주문 paid 전환 실패: ${payErr.message}`);
  return now;
}

const browser = await chromium.launch();
try {
  // -------------------------------------------------------------------------
  // 서버 확인 — 5303 vite 가 떠 있어야 UI 시나리오 진행 가능.
  // -------------------------------------------------------------------------
  let serverUp = false;
  try {
    const res = await fetch(APP_ORIGIN, { redirect: "manual" });
    serverUp = res.status < 500;
  } catch {
    serverUp = false;
  }
  if (!serverUp) {
    console.error(
      `[ABORT] ${APP_ORIGIN} 응답 없음 — 검증 서버(포트 5303)를 먼저 띄울 것: npm run dev -- --port 5303 --strictPort`,
    );
    process.exit(1);
  }

  const busan = await getProduct("busan-9900");
  const suhaeng1 = await getProduct("suhaeng-1");
  const suhaeng6 = await getProduct("suhaeng-6");
  const goal3m = await getProduct("goal-3m");

  // ===========================================================================
  // 시나리오 3~5, 10 — busan-9900 번들 부여/멱등/전체환불 + 단품 회귀
  // ===========================================================================
  const parent1 = await mkUser("s3-parent", "parent");
  const student1 = await mkUser("s3-student", "student", "위닝부산캠퍼스");
  await linkPair(parent1, student1);
  const order1 = `order_${RUN_TAG}_busan`;

  {
    const { error } = await requestEnrollment(order1, student1, parent1, busan);
    check("S3 fn_request_enrollment(번들) 성공", !error, error?.message);
    cleanup.orderIds.push(order1);
  }

  const paidAt1 = await approveAndPay(order1, parent1);

  {
    const { data: grantRes, error } = await admin.rpc(
      "fn_grant_program_access_for_order",
      {
        p_order_id: order1,
        p_user_id: parent1.id,
        p_paid_at: paidAt1,
      },
    );
    check("S3 fn_grant_program_access_for_order 성공", !error, error?.message);
    check(
      "S3 granted 3개 program_key",
      grantRes?.granted?.length === 3,
      JSON.stringify(grantRes?.granted),
    );
  }

  {
    const { data: grants, error } = await admin
      .from("program_access_grants")
      .select("program_key, paid_amount, expires_at, revoked_at")
      .eq("order_id", order1)
      .is("revoked_at", null);
    check(
      "S3 grant 3행(diagnose/target/suhaeng)",
      !error && grants?.length === 3,
      JSON.stringify(grants),
    );
    const keys = (grants || []).map((g) => g.program_key).sort();
    check(
      "S3 program_key 구성 정확",
      JSON.stringify(keys) ===
        JSON.stringify(["diagnose", "suhaeng", "target"]),
      JSON.stringify(keys),
    );
    const sum = (grants || []).reduce((s, g) => s + g.paid_amount, 0);
    check("S3 paid_amount 합계 = 9,900", sum === 9900, `sum=${sum}`);
    check(
      "S3 만료 파생 정상(전부 expires_at 존재)",
      (grants || []).every((g) => g.expires_at),
      JSON.stringify(grants?.map((g) => g.expires_at)),
    );
  }

  // 시나리오 4 — 멱등: 같은 주문 재부여 시 grant 중복 0.
  {
    const { data: grantRes2, error } = await admin.rpc(
      "fn_grant_program_access_for_order",
      {
        p_order_id: order1,
        p_user_id: parent1.id,
        p_paid_at: paidAt1,
      },
    );
    check("S4 재부여 성공(에러 없음)", !error, error?.message);
    check(
      "S4 ledger_inserted = 0",
      grantRes2?.ledger_inserted === 0,
      JSON.stringify(grantRes2),
    );
    const { data: grants2 } = await admin
      .from("program_access_grants")
      .select("id")
      .eq("order_id", order1)
      .is("revoked_at", null);
    check(
      "S4 grant 행수 여전히 3(중복 없음)",
      grants2?.length === 3,
      `count=${grants2?.length}`,
    );
  }

  // 시나리오 5 — 기존 단품 회귀: suhaeng-1 주문 부여 시 grant 1행.
  const parent5 = await mkUser("s5-parent", "parent");
  const student5 = await mkUser("s5-student", "student");
  await linkPair(parent5, student5);
  const order5 = `order_${RUN_TAG}_single`;
  {
    const { error } = await requestEnrollment(
      order5,
      student5,
      parent5,
      suhaeng1,
    );
    check("S5 단품 fn_request_enrollment 성공", !error, error?.message);
    cleanup.orderIds.push(order5);
    const paidAt5 = await approveAndPay(order5, parent5);
    const { data: grantRes, error: gErr } = await admin.rpc(
      "fn_grant_program_access_for_order",
      {
        p_order_id: order5,
        p_user_id: parent5.id,
        p_paid_at: paidAt5,
      },
    );
    check("S5 단품 grant 성공", !gErr, gErr?.message);
    const { data: grants5 } = await admin
      .from("program_access_grants")
      .select("program_key")
      .eq("order_id", order5)
      .is("revoked_at", null);
    check("S5 단품 grant 1행", grants5?.length === 1, JSON.stringify(grants5));
  }

  // 시나리오 10 — 전체환불: 3행 일괄 revoke.
  {
    const { data: revokeRes, error } = await admin.rpc(
      "fn_revoke_program_access_for_order",
      {
        p_order_id: order1,
        p_user_id: parent1.id,
        p_payment_status: "refunded",
        p_reason: "qa_full_refund",
        p_order_item_ids: null,
      },
    );
    check(
      "S10 fn_revoke_program_access_for_order 성공",
      !error,
      error?.message,
    );
    check(
      "S10 revoked 3개 program_key",
      revokeRes?.revoked?.length === 3,
      JSON.stringify(revokeRes?.revoked),
    );
    const { data: revoked } = await admin
      .from("program_access_grants")
      .select("id, revoked_at")
      .eq("order_id", order1);
    check(
      "S10 3행 전부 revoked_at 세팅됨",
      revoked?.length === 3 && revoked.every((r) => r.revoked_at),
      JSON.stringify(revoked),
    );
  }

  // ===========================================================================
  // 시나리오 6 — 1회 제한(WC066): 같은 학생 두 번째 busan-9900 주문.
  // ===========================================================================
  {
    const order6 = `order_${RUN_TAG}_dup`;
    const { error } = await requestEnrollment(order6, student1, parent1, busan);
    check(
      "S6 두 번째 busan-9900 신청 WC066 거부",
      error?.code === "WC066",
      JSON.stringify(error),
    );
  }

  // ===========================================================================
  // 시나리오 7 — org 불일치(WC064): org_code 없는 학생.
  // ===========================================================================
  const parent7 = await mkUser("s7-parent", "parent");
  const student7 = await mkUser("s7-student", "student"); // org_code 없음
  await linkPair(parent7, student7);
  {
    const order7 = `order_${RUN_TAG}_orgmismatch`;
    const { error } = await requestEnrollment(order7, student7, parent7, busan);
    check(
      "S7 org 불일치 WC064 거부",
      error?.code === "WC064",
      JSON.stringify(error),
    );
  }

  // ===========================================================================
  // 시나리오 8 — 기한(WC065): sale_ends_at 과거로 UPDATE 후 신청, 검증 후 원복.
  // ===========================================================================
  const parent8 = await mkUser("s8-parent", "parent");
  const student8 = await mkUser("s8-student", "student", "위닝부산캠퍼스");
  await linkPair(parent8, student8);
  {
    const { error: updErr } = await admin
      .from("products")
      .update({ sale_ends_at: "2020-01-01T00:00:00Z" })
      .eq("id", busan.id);
    if (updErr) throw new Error(`sale_ends_at UPDATE 실패: ${updErr.message}`);

    const order8 = `order_${RUN_TAG}_expired`;
    const { error } = await requestEnrollment(order8, student8, parent8, busan);
    check(
      "S8 판매 마감 WC065 거부",
      error?.code === "WC065",
      JSON.stringify(error),
    );

    const { error: restoreErr } = await admin
      .from("products")
      .update({ sale_ends_at: busan.sale_ends_at })
      .eq("id", busan.id);
    check("S8 sale_ends_at 원복 성공", !restoreErr, restoreErr?.message);
  }

  // ===========================================================================
  // 시나리오 9 — 쿠폰 차단: org 상품 포함 주문에서 쿠폰 배제.
  // ===========================================================================
  const parent9 = await mkUser("s9-parent", "parent");
  const student9 = await mkUser("s9-student", "student", "위닝부산캠퍼스");
  await linkPair(parent9, student9);
  const order9 = `order_${RUN_TAG}_coupon`;
  {
    const { error } = await requestEnrollment(order9, student9, parent9, busan);
    check("S9 신청 성공", !error, error?.message);
    cleanup.orderIds.push(order9);
  }

  const couponCode = `${RUN_TAG}coupon`.toLowerCase();
  {
    const { data: coupon, error } = await admin
      .from("coupons")
      .insert({
        code: couponCode,
        slug: couponCode,
        title: "QA 테스트 쿠폰",
        discount_amount: 1000,
        min_amount: 0,
        is_active: true,
        stackable: true,
        grant_type: "auto",
      })
      .select("id")
      .single();
    if (error) throw new Error(`coupons insert 실패: ${error.message}`);
    cleanup.couponIds.push(coupon.id);

    const { data: usable, error: uErr } = await rpcAsUser(
      student9.email,
      "fn_usable_coupons",
      {
        p_subtotal: busan.price,
        p_student_profile_id: null,
        p_order_id: order9,
      },
    );
    check("S9 fn_usable_coupons RPC 성공", !uErr, JSON.stringify(uErr));
    const row = Array.isArray(usable)
      ? usable.find((r) => r.id === coupon.id)
      : null;
    check(
      "S9 fn_usable_coupons eligible=false, reason=org_product_excluded",
      row?.eligible === false && row?.reason === "org_product_excluded",
      JSON.stringify(row),
    );

    const { data: byCode, error: cErr } = await rpcAsUser(
      student9.email,
      "fn_coupon_by_code",
      {
        p_code: couponCode,
        p_subtotal: busan.price,
        p_student_profile_id: null,
        p_order_id: order9,
      },
    );
    check("S9 fn_coupon_by_code RPC 성공", !cErr, JSON.stringify(cErr));
    const codeRow = Array.isArray(byCode) ? byCode[0] : byCode;
    check(
      "S9 fn_coupon_by_code eligible=false, reason=org_product_excluded",
      codeRow?.eligible === false && codeRow?.reason === "org_product_excluded",
      JSON.stringify(codeRow),
    );
  }

  // ===========================================================================
  // UI 시나리오 11 — 게스트 /pricing: 특가 카드 미노출.
  // ===========================================================================
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(`${APP_ORIGIN}/pricing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const badgeVisible =
      (await page.getByText("부산캠퍼스 특별할인").count()) > 0;
    check("S11 게스트 /pricing 특가 카드 미노출", !badgeVisible);
    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 12 — org 없는 학생: 결제요청 화면 특가 미노출 → 소속코드 저장
  // → 특가 노출.
  // ===========================================================================
  const parent12 = await mkUser("s12-parent", "parent");
  const student12 = await mkUser("s12-student", "student"); // org_code 없음
  await linkPair(parent12, student12);
  {
    const { context, page } = await freshPage(browser, student12.email);
    await page.goto(`${APP_ORIGIN}/checkout`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const before = (await page.getByText("부산캠퍼스 특별할인").count()) > 0;
    check("S12 org 없는 학생 결제요청 화면 특가 미노출", !before);

    // 마이페이지 → 소속코드 입력·저장.
    await page.goto(`${APP_ORIGIN}/mypage?tab=profile`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1000);
    // ProfileTab.tsx — 소속코드 필드의 액션 버튼 라벨은 org_code 미입력 시
    // "입력"(입력 후엔 "변경"). 이 탭에서 "입력"은 소속코드 필드 하나뿐.
    const orgTrigger = page.getByRole("button", { name: "입력" });
    await orgTrigger.click({ timeout: 10000 });
    const orgModalTitle =
      (await page.getByText("소속코드를 입력해주세요").count()) > 0;
    check("S12 소속코드 모달 제목(확정 카피)", orgModalTitle);
    const orgInput = page.locator(
      'input[placeholder="소속코드가 없으면 입력하지 마세요"]',
    );
    await orgInput.waitFor({ state: "visible", timeout: 10000 });
    await orgInput.fill("위닝부산캠퍼스");
    await page.getByRole("button", { name: "저장" }).click();
    await page.waitForTimeout(1500);

    const { data: profileRow } = await admin
      .from("profiles")
      .select("org_code")
      .eq("id", student12.id)
      .single();
    check(
      "S12 소속코드 DB 저장 확인",
      profileRow?.org_code === "위닝부산캠퍼스",
      JSON.stringify(profileRow),
    );

    // 결제요청 화면 재진입 — 특가 섹션 노출.
    await page.goto(`${APP_ORIGIN}/checkout`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const afterBadge =
      (await page.getByText("부산캠퍼스 특별할인").count()) > 0;
    check("S12 소속코드 저장 후 특가 섹션 노출", afterBadge);
    const noCouponNotice =
      (await page.getByText("쿠폰 적용 대상이 아닙니다").count()) > 0;
    check("S12 구성·쿠폰 불가 고지 확인", noCouponNotice);
    // ServiceCatalog.tsx — org 한정 상품 카드는 "구성: {라벨 N회권} + ..."
    // 문구를 bundle_items 조회로 만든다(bc038ba6, service_desc 재사용 폐기).
    const compositionLine =
      (await page
        .getByText(
          "구성: 학습진단서비스 1회 + 목표관리서비스 1개월 + 수행평가서비스 2회권",
          { exact: false },
        )
        .count()) > 0;
    check("S12 카탈로그 카드 구성 라인(확정 카피)", compositionLine);
    // 시드(20260901050445 bc038ba6)가 list_price=price=9900·badge=null 로
    // 바뀌어 할인이 아닌 패키지 단일가다 — 정가 취소선(ServiceCatalog.tsx:507
    // line-through, 구 list_price 40,000원)과 구 배지("75% 할인")가 이
    // 카드에는 없어야 한다. 다른 서비스 카드의 정상 할인 배지와 안 겹치게
    // 이 상품의 구 값으로만 특정해서 검사한다.
    const strikethroughListPrice =
      (await page.getByText("40,000원", { exact: false }).count()) > 0;
    const discountBadge =
      (await page.getByText("75% 할인", { exact: false }).count()) > 0;
    check("S12 할인 표기(취소선) 미노출", !strikethroughListPrice);
    check("S12 할인 표기(배지) 미노출", !discountBadge);
    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 13 — 학부모 결제 화면: 특가 담긴 주문에서 쿠폰 섹션이
  // 안내문으로 대체.
  // ===========================================================================
  const parent13 = await mkUser("s13-parent", "parent");
  const student13 = await mkUser("s13-student", "student", "위닝부산캠퍼스");
  await linkPair(parent13, student13);
  const order13 = `order_${RUN_TAG}_ui13`;
  {
    const { error } = await requestEnrollment(
      order13,
      student13,
      parent13,
      busan,
    );
    check("S13 사전 신청 성공(DB)", !error, error?.message);
    cleanup.orderIds.push(order13);

    const { context, page } = await freshPage(browser, parent13.email);
    await page.goto(`${APP_ORIGIN}/checkout?order=${order13}`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);
    const notice =
      (await page.getByText("쿠폰 적용 대상이 아닙니다.").count()) > 0;
    check("S13 학부모 결제 화면 쿠폰 섹션 안내문 대체", notice);
    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 14 — 학부모 마이페이지 결제 내역: 단일 표, 3종 kind 각각
  // 클릭 시 각 모달 오픈.
  // ===========================================================================
  const parent14 = await mkUser("s14-parent", "parent");
  const student14 = await mkUser("s14-student", "student", "위닝부산캠퍼스");
  await linkPair(parent14, student14);

  // history 행 — busan-9900 paid 주문(구성 3줄 표기 검증도 이 주문 재사용, S15).
  const order14History = `order_${RUN_TAG}_hist`;
  {
    const { error } = await requestEnrollment(
      order14History,
      student14,
      parent14,
      busan,
    );
    check("S14 history용 신청 성공", !error, error?.message);
    cleanup.orderIds.push(order14History);
    const paidAt = await approveAndPay(order14History, parent14);
    const { error: gErr } = await admin.rpc(
      "fn_grant_program_access_for_order",
      {
        p_order_id: order14History,
        p_user_id: parent14.id,
        p_paid_at: paidAt,
      },
    );
    check("S14 history용 grant 성공", !gErr, gErr?.message);
  }

  // pending 행 — suhaeng-1 신청만(승인 대기).
  const order14Pending = `order_${RUN_TAG}_pend`;
  {
    const { error } = await requestEnrollment(
      order14Pending,
      student14,
      parent14,
      suhaeng1,
    );
    check("S14 pending용 신청 성공", !error, error?.message);
    cleanup.orderIds.push(order14Pending);
  }

  // refund 행 — history 주문에 대해 학생이 전액 환불 요청(requested).
  {
    const { data: refundRow, error } = await rpcAsUser(
      student14.email,
      "fn_request_refund",
      {
        p_order_id: order14History,
        p_reason: "단순 변심",
        p_refund_bank: null,
        p_refund_account: null,
        p_refund_holder: null,
        p_order_item_ids: null,
      },
    );
    check("S14 refund용 학생 신청 성공", !error, JSON.stringify(error));
    check(
      "S14 refund 행 approval_status=requested",
      refundRow?.approval_status === "requested",
      JSON.stringify(refundRow),
    );
  }

  {
    const { context, page } = await freshPage(browser, parent14.email);
    await page.goto(`${APP_ORIGIN}/mypage?tab=payments`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);

    const singleTableHeading = await page
      .getByRole("heading", { name: "지난 결제내역" })
      .count();
    check(
      "S14 '지난 결제내역' 단일 표 제목 1개",
      singleTableHeading === 1,
      `count=${singleTableHeading}`,
    );
    const threeSectionHeadings =
      (await page.getByText("환불요청").count()) +
      (await page.getByText("결제 신청하기").count());
    check(
      "S14 3섹션(구) 제목 없음",
      threeSectionHeadings === 0,
      `count=${threeSectionHeadings}`,
    );

    // refund 행 클릭 → 승인 모달.
    await page
      .getByText(order14History.replace(/^order_/, ""), { exact: false })
      .first()
      .click();
    await page.waitForTimeout(800);
    const approvalModalOpen =
      (await page.getByRole("button", { name: /환불 승인/ }).count()) > 0;
    check("S14 refund 행 클릭 → 승인 모달 오픈", approvalModalOpen);

    // order14History는 busan 번들 전체환불 신청(위 fn_request_refund, order_item_ids
    // null)이라 fn_refund_quote_dedupe_bundle_lines로 lines가 1개 — 학부모 승인
    // 모달에도 구성 이용권 내역이 부속 라인으로 붙어야 한다(RefundApprovalModal,
    // 2026-09-01 세부 표시 추가).
    await page.waitForTimeout(500);
    const approvalCompositionVisible =
      (await page.getByText("학습진단서비스 1회", { exact: false }).count()) >
        0 &&
      (await page.getByText("목표관리서비스 1개월", { exact: false }).count()) >
        0 &&
      (await page.getByText("수행평가서비스 2회권", { exact: false }).count()) >
        0;
    check(
      "S14 환불 승인 모달 구성 이용권 내역 부속 라인 노출",
      approvalCompositionVisible,
    );

    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);

    // pending 행 클릭 → 결제 요청 확인 모달.
    await page
      .getByText(order14Pending.replace(/^order_/, ""), { exact: false })
      .first()
      .click();
    await page.waitForTimeout(800);
    const enrollmentModalOpen =
      (await page.getByText(/결제 진행하기|결제요청|승인/).count()) > 0;
    check("S14 pending 행 클릭 → 결제 요청 모달 오픈", enrollmentModalOpen);
    await page.keyboard.press("Escape").catch(() => {});

    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 15 — 영수증·결제상세: 번들 주문 구성 3줄 표기.
  //
  // 전용 주문을 새로 쓴다 — order14History 는 S14 에서 환불 신청까지
  // 걸어(kind=refund) rows 배열에 같은 주문번호로 두 행(refund·history)이
  // 뜬다. 텍스트 매칭 .first() 가 refund 행(승인 모달)을 먼저 잡아 결제
  // 상세(PaymentDetailModal)를 못 연다 — 모호성 없는 별도 주문으로 분리한다.
  // ===========================================================================
  const parent15 = await mkUser("s15-parent", "parent");
  const student15 = await mkUser("s15-student", "student", "위닝부산캠퍼스");
  await linkPair(parent15, student15);
  const order15 = `order_${RUN_TAG}_receipt`;
  {
    const { error } = await requestEnrollment(
      order15,
      student15,
      parent15,
      busan,
    );
    check("S15 사전 신청 성공(DB)", !error, error?.message);
    cleanup.orderIds.push(order15);
    const paidAt15 = await approveAndPay(order15, parent15);
    const { error: gErr } = await admin.rpc(
      "fn_grant_program_access_for_order",
      {
        p_order_id: order15,
        p_user_id: parent15.id,
        p_paid_at: paidAt15,
      },
    );
    check("S15 grant 성공", !gErr, gErr?.message);
  }

  {
    const { context, page } = await freshPage(browser, parent15.email);
    await page.goto(`${APP_ORIGIN}/mypage?tab=payments`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);

    await page
      .getByText(order15.replace(/^order_/, ""), { exact: false })
      .first()
      .click();
    await page.waitForTimeout(800);

    const diagnoseLine =
      (await page.getByText("학습진단서비스 1회", { exact: false }).count()) >
      0;
    const targetLine =
      (await page.getByText("목표관리서비스 1개월", { exact: false }).count()) >
      0;
    const suhaengLine =
      (await page.getByText("수행평가서비스 2회권", { exact: false }).count()) >
      0;
    check("S15 결제상세 구성 3줄(학습진단서비스 1회)", diagnoseLine);
    check("S15 결제상세 구성 3줄(목표관리서비스 1개월)", targetLine);
    check("S15 결제상세 구성 3줄(수행평가서비스 2회권)", suhaengLine);

    await context.close();
  }

  // ===========================================================================
  // 시나리오 16 — fn_refund_quote DB 레벨: 번들 주문은 lines 1개, 환불액이
  // 구성 3개 합산(before_start)으로 3배 뻥튀기되지 않고 정확히 클램프됨
  // (fn_refund_quote_dedupe_bundle_lines, order_item_id 합산 검증).
  // ===========================================================================
  const parent16 = await mkUser("s16-parent", "parent");
  const student16 = await mkUser("s16-student", "student", "위닝부산캠퍼스");
  await linkPair(parent16, student16);
  const order16 = `order_${RUN_TAG}_quote`;
  {
    const { error } = await requestEnrollment(
      order16,
      student16,
      parent16,
      busan,
    );
    check("S16 사전 신청 성공(DB)", !error, error?.message);
    cleanup.orderIds.push(order16);
    const paidAt16 = await approveAndPay(order16, parent16);
    const { error: gErr } = await admin.rpc(
      "fn_grant_program_access_for_order",
      {
        p_order_id: order16,
        p_user_id: parent16.id,
        p_paid_at: paidAt16,
      },
    );
    check("S16 grant 성공", !gErr, gErr?.message);

    const { data: quoteRows, error: qErr } = await rpcAsUser(
      parent16.email,
      "fn_refund_quote",
      { p_order_id: order16 },
    );
    check("S16 fn_refund_quote 성공", !qErr, JSON.stringify(qErr));
    const quote = Array.isArray(quoteRows) ? quoteRows[0] : quoteRows;
    check(
      "S16 lines 1개(구성 3개가 중복 노출되지 않음)",
      Array.isArray(quote?.lines) && quote.lines.length === 1,
      JSON.stringify(quote?.lines),
    );
    check(
      "S16 refund_amount = gross_amount(9,900, 3배 뻥튀기 없음)",
      quote?.refund_amount === 9900 && quote?.gross_amount === 9900,
      `refund_amount=${quote?.refund_amount} gross_amount=${quote?.gross_amount}`,
    );
    check(
      "S16 scope = order",
      quote?.scope === "order",
      `scope=${quote?.scope}`,
    );
  }

  // ===========================================================================
  // UI 시나리오 17 — 나의 서비스(grants 정본 재작성, 2026-09-01): 번들 주문의
  // 살아있는 grant 3행이 각각 카드로 뜨고(문자열 합성 전부 폐기), 미사용
  // 상태라 셋 다 "이용 중"이다 — 학습진단도 이제 파싱 시절처럼 무조건 완료로
  // 뭉개지지 않고 "검사하기" 액션의 이용중 카드로 뜬다. order15(S15, busan
  // 결제+부여 완료, 아직 미사용)를 재사용한다.
  // ===========================================================================
  {
    const { context, page } = await freshPage(browser, student15.email);
    await page.goto(`${APP_ORIGIN}/mypage?tab=services`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);

    const serviceHeadingCount = await page
      .getByRole("heading", {
        name: /^위닝 학습진단$|^위닝 목표관리$|^위닝 수행평가$/,
      })
      .count();
    check(
      "S17 grant 3행이 서비스 카드 3장으로 뜸",
      serviceHeadingCount === 3,
      `count=${serviceHeadingCount}`,
    );

    const singleBundleCardCount = await page
      .getByRole("heading", { name: /부산캠퍼스 특별할인/ })
      .count();
    check(
      "S17 번들 단일 카드(구 버그) 미노출",
      singleBundleCardCount === 0,
      `count=${singleBundleCardCount}`,
    );

    // 셋 다 미사용이라 "이용 중인 서비스" 섹션에 전부 있어야 한다(완료 0).
    const ongoingSection = page.locator("section", {
      hasText: "이용 중인 서비스",
    });
    const completedSection = page.locator("section", {
      hasText: "이용 완료된 서비스",
    });
    const ongoingCount = await ongoingSection
      .getByRole("heading", {
        name: /^위닝 학습진단$|^위닝 목표관리$|^위닝 수행평가$/,
      })
      .count();
    check(
      "S17 미사용 grant 3장 전부 이용 중 섹션",
      ongoingCount === 3,
      `count=${ongoingCount}`,
    );
    check(
      "S17 완료 섹션 자체가 없음(미사용 3장뿐)",
      (await completedSection.count()) === 0,
    );

    function cardFor(serviceName) {
      return page
        .getByRole("heading", { name: serviceName, exact: true })
        .locator(
          "xpath=ancestor::div[contains(@class,'rounded-perf-modal')][1]",
        );
    }

    // 목표관리 — 이용중, 프로그램 가기 → /app/goal.
    const goalHref = await cardFor("위닝 목표관리")
      .getByRole("link", { name: /프로그램 가기/ })
      .getAttribute("href")
      .catch(() => null);
    check("S17 목표관리 카드 링크 = /app/goal", goalHref === "/app/goal");

    // 수행평가 — 이용중, 프로그램 가기 → /app/performance, 잔여 2회(미사용).
    const suhaengCard = cardFor("위닝 수행평가");
    const suhaengHref = await suhaengCard
      .getByRole("link", { name: /프로그램 가기/ })
      .getAttribute("href")
      .catch(() => null);
    check(
      "S17 수행평가 카드 링크 = /app/performance",
      suhaengHref === "/app/performance",
    );
    const suhaengRemaining2 =
      (await suhaengCard.getByText("잔여 2회", { exact: false }).count()) > 0;
    check("S17 수행평가 잔여 2회(미사용) 표시", suhaengRemaining2);

    // 학습진단 — 파싱 시절엔 항상 완료였지만, 미사용 유료 1회권은 이제
    // "이용중 + 검사하기"(QA 이슈 교정, 이번 재작성의 핵심).
    const diagnoseCard = cardFor("위닝 학습진단");
    const diagnoseTestLinkVisible =
      (await diagnoseCard.getByRole("link", { name: "검사하기" }).count()) > 0;
    check(
      "S17 미사용 학습진단 1회권 = 이용중 + 검사하기",
      diagnoseTestLinkVisible,
    );
    const diagnoseOldCompletedActionsAbsent =
      (await diagnoseCard.getByText("결과 리포트 보기").count()) === 0;
    check(
      "S17 미사용 학습진단에 완료 카드 액션(결과 리포트 보기) 없음",
      diagnoseOldCompletedActionsAbsent,
    );

    await context.close();
  }

  // ===========================================================================
  // 시나리오 19 — 나의 서비스 소비 반영: 학습진단 소진 → 완료 카드 전환,
  // 수행평가 회차 차감 → 잔여 표시 갱신(grants+ledger 재작성의 핵심 개선점 —
  // 파싱 시절엔 실제 소비를 반영할 컬럼 자체가 없었다).
  // ===========================================================================
  const parent19 = await mkUser("s19-parent", "parent");
  const student19 = await mkUser("s19-student", "student", "위닝부산캠퍼스");
  await linkPair(parent19, student19);
  const order19 = `order_${RUN_TAG}_consume`;
  {
    const { error } = await requestEnrollment(
      order19,
      student19,
      parent19,
      busan,
    );
    check("S19 사전 신청 성공(DB)", !error, error?.message);
    cleanup.orderIds.push(order19);
    const paidAt19 = await approveAndPay(order19, parent19);
    const { error: gErr } = await admin.rpc(
      "fn_grant_program_access_for_order",
      {
        p_order_id: order19,
        p_user_id: parent19.id,
        p_paid_at: paidAt19,
      },
    );
    check("S19 grant 성공", !gErr, gErr?.message);

    const { data: grants19, error: grantsErr } = await admin
      .from("program_access_grants")
      .select("id, program_key")
      .eq("order_id", order19)
      .is("revoked_at", null);
    check("S19 grant 3행 조회 성공", !grantsErr && grants19?.length === 3);
    const diagnoseGrant = (grants19 || []).find(
      (g) => g.program_key === "diagnose",
    );
    const suhaengGrant = (grants19 || []).find(
      (g) => g.program_key === "suhaeng",
    );

    // 학습진단 1회권 소진 — consume_diagnosis_attempt RPC와 동일한 원장
    // 기록(source_kind='diagnosis_attempt')을 직접 남긴다. 실제 RPC는 먼저
    // 무료 1회를 우선 소비하므로(diagnosis_attempts kind='free' 게이트),
    // 신규 QA 학생으로 그 RPC를 그대로 부르면 유료 grant가 아니라 무료분만
    // 소비된다 — 이 카드가 검증하려는 대상(유료 1회권 소진 표시)과 어긋나서
    // 원장에 직접 기록한다(같은 테이블·같은 컬럼, RPC가 쓰는 것과 동일 형태).
    const { error: diagLedgerErr } = await admin
      .from("performance_credit_ledger")
      .insert({
        profile_id: student19.id,
        grant_id: diagnoseGrant?.id,
        delta: -1,
        reason: "e2e-test-consume",
        source_kind: "diagnosis_attempt",
      });
    check(
      "S19 학습진단 소비 원장 기록 성공",
      !diagLedgerErr,
      diagLedgerErr?.message,
    );

    // 수행평가 1회 소비 — consume_performance_credit이 요구하는 실제 형태
    // (source_kind='performance_session' + session_id FK)를 그대로 맞추려면
    // performance_sessions 행이 필요하다. 최소 유효 행 하나를 만든다.
    const { data: sessionRow, error: sessionErr } = await admin
      .from("performance_sessions")
      .insert({ profile_id: student19.id, status: "draft" })
      .select("id")
      .single();
    check("S19 수행평가 세션 생성 성공", !sessionErr, sessionErr?.message);
    const { error: suhaengLedgerErr } = await admin
      .from("performance_credit_ledger")
      .insert({
        profile_id: student19.id,
        grant_id: suhaengGrant?.id,
        session_id: sessionRow?.id,
        delta: -1,
        reason: "e2e-test-consume",
        source_kind: "performance_session",
      });
    check(
      "S19 수행평가 소비 원장 기록 성공",
      !suhaengLedgerErr,
      suhaengLedgerErr?.message,
    );

    const { context, page } = await freshPage(browser, student19.email);
    await page.goto(`${APP_ORIGIN}/mypage?tab=services`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);

    const completedSection = page.locator("section", {
      hasText: "이용 완료된 서비스",
    });
    const diagnoseCompletedCount = await completedSection
      .getByRole("heading", { name: "위닝 학습진단", exact: true })
      .count();
    check(
      "S19 학습진단 1회권 소진 → 완료 섹션으로 이동",
      diagnoseCompletedCount === 1,
      `count=${diagnoseCompletedCount}`,
    );
    const diagnoseReportLinkVisible =
      (await completedSection.getByText("결과 리포트 보기").count()) > 0;
    check(
      "S19 소진된 학습진단 = 결과 리포트 보기 액션",
      diagnoseReportLinkVisible,
    );

    const suhaengHeading = page.getByRole("heading", {
      name: "위닝 수행평가",
      exact: true,
    });
    const suhaengCard = suhaengHeading.locator(
      "xpath=ancestor::div[contains(@class,'rounded-perf-modal')][1]",
    );
    const suhaengRemaining1 =
      (await suhaengCard.getByText("잔여 1회", { exact: false }).count()) > 0;
    check("S19 수행평가 1회 소비 후 잔여 1회로 갱신", suhaengRemaining1);

    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 18 — 환불요청 모달: 번들 주문은 "구성서비스 선택" 체크박스가
  // 뜨지 않고(부분환불 없음, 패키지 단일 항목), 최종 환불액이 정상 표기됨
  // (마이페이지 QA 이슈 3).
  // ===========================================================================
  const parent18 = await mkUser("s18-parent", "parent");
  const student18 = await mkUser("s18-student", "student", "위닝부산캠퍼스");
  await linkPair(parent18, student18);
  const order18 = `order_${RUN_TAG}_refundui`;
  {
    const { error } = await requestEnrollment(
      order18,
      student18,
      parent18,
      busan,
    );
    check("S18 사전 신청 성공(DB)", !error, error?.message);
    cleanup.orderIds.push(order18);
    const paidAt18 = await approveAndPay(order18, parent18);
    const { error: gErr } = await admin.rpc(
      "fn_grant_program_access_for_order",
      {
        p_order_id: order18,
        p_user_id: parent18.id,
        p_paid_at: paidAt18,
      },
    );
    check("S18 grant 성공", !gErr, gErr?.message);

    const { context, page } = await freshPage(browser, parent18.email);
    await page.goto(`${APP_ORIGIN}/mypage?tab=payments`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);

    await page
      .getByText(order18.replace(/^order_/, ""), { exact: false })
      .first()
      .click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "환불 신청" }).click();
    await page.waitForTimeout(1500);

    const compositionCheckboxCount = await page
      .getByText("구성서비스 선택")
      .count();
    check(
      "S18 '구성서비스 선택' 체크박스 미노출(부분환불 없음)",
      compositionCheckboxCount === 0,
      `count=${compositionCheckboxCount}`,
    );

    // 체크박스는 없어도 구성 이용권 내역(금액 없는 부속 라인)은 제목 아래
    // 그대로 붙어야 한다(RefundRequestModal, 2026-09-01 세부 표시 추가).
    const requestCompositionVisible =
      (await page.getByText("학습진단서비스 1회", { exact: false }).count()) >
        0 &&
      (await page.getByText("목표관리서비스 1개월", { exact: false }).count()) >
        0 &&
      (await page.getByText("수행평가서비스 2회권", { exact: false }).count()) >
        0;
    check(
      "S18 환불요청 모달 구성 이용권 내역 부속 라인 노출",
      requestCompositionVisible,
    );

    const finalAmountVisible =
      (await page
        .getByText("최종 환불액")
        .locator("xpath=..")
        .getByText("9,900원", { exact: false })
        .count()) > 0;
    check("S18 최종 환불액 9,900원(3배 뻥튀기 없음)", finalAmountVisible);

    await page.keyboard.press("Escape").catch(() => {});
    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 20 — 학생 "신청 내역"을 학부모 "결제 내역" 형식으로 통일
  // (B안, 2026-09-01): 표 4열(주문번호/일시/상품/상태, 금액 열 제거)·학부모
  // 배지 어휘 재사용·PaymentDetailModal asStudent 공유(금액 비표시, 신청자·
  // 결제담당 유지, 번들 구성 부속 라인 표시). 학부모 5열 표는 회귀 없이
  // 그대로인지 S14가 이미 검증한다(별도 확인 불필요).
  // ===========================================================================
  const parent20 = await mkUser("s20-parent", "parent");
  const student20 = await mkUser("s20-student", "student", "위닝부산캠퍼스");
  await linkPair(parent20, student20);
  const order20paid = `order_${RUN_TAG}_stdpaid`;
  const order20pending = `order_${RUN_TAG}_stdpending`;
  {
    const { error } = await requestEnrollment(
      order20paid,
      student20,
      parent20,
      busan,
    );
    check("S20 결제완료용 신청 성공(DB)", !error, error?.message);
    cleanup.orderIds.push(order20paid);
    await approveAndPay(order20paid, parent20);

    // 응답 대기 요청 — 승인/결제로 진행하지 않는다(approval_status='requested'
    // 그대로 남겨 "승인 필요" 배지를 재현).
    const { error: pendErr } = await requestEnrollment(
      order20pending,
      student20,
      parent20,
      suhaeng1,
    );
    check("S20 응답대기용 신청 성공(DB)", !pendErr, pendErr?.message);
    cleanup.orderIds.push(order20pending);

    const { context, page } = await freshPage(browser, student20.email);
    await page.goto(`${APP_ORIGIN}/mypage?tab=payments`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);

    const headerRow = page.locator("table thead tr").first();
    const headerText = (await headerRow.textContent()) || "";
    check(
      "S20 표 헤더 = 주문번호/일시/상품/상태(학부모와 동일 라벨)",
      headerText.includes("주문번호") &&
        headerText.includes("일시") &&
        headerText.includes("상품") &&
        headerText.includes("상태"),
      headerText,
    );
    check(
      "S20 옛 학생 전용 헤더(신청번호·이용금액) 미노출",
      !headerText.includes("신청번호") && !headerText.includes("이용금액"),
      headerText,
    );

    // 금액 열 자체가 없는지 확인한다 — 상품명("9,900원 부산캠퍼스…")은 정가가
    // 마케팅 문구에 박힌 상품명이라 "원"이 들어가는 게 정상이다(정책이 막는
    // 건 계산된 결제 금액 행이지 상품명 문자열이 아니다). 그래서 블랭킷 정규식
    // 대신 실제 금액 열 헤더("금액"/"결제 금액") 부재로 판정한다.
    check(
      "S20 표에 금액 열 헤더 없음 — 금액 비표시 정책 유지",
      !headerText.includes("금액"),
      headerText,
    );

    check(
      "S20 결제완료 주문 배지 = '결제 완료'(학부모 어휘, 옛 '이용 중' 아님)",
      (await page.getByText("결제 완료", { exact: true }).count()) > 0 &&
        (await page.getByText("이용 중", { exact: true }).count()) === 0,
    );
    check(
      "S20 응답대기 주문 배지 = '승인 필요'(학부모 pending 어휘 재사용)",
      (await page.getByText("승인 필요", { exact: true }).count()) > 0,
    );

    // 결제완료 주문 행 클릭 → asStudent 상세 모달.
    await page
      .getByText(order20paid.replace(/^order_/, ""), { exact: false })
      .first()
      .click();
    await page.waitForTimeout(800);

    check(
      "S20 상세 모달 제목 = '신청 상세 내역'(학생 고유 프레이밍 유지)",
      (await page.getByText("신청 상세 내역").count()) > 0,
    );
    check(
      "S20 상세 모달에 신청자·결제담당 행 유지",
      (await page.getByText("신청자").count()) > 0 &&
        (await page.getByText("결제담당").count()) > 0,
    );
    check(
      "S20 상세 모달에 결제 수단·영수증 보기 없음(금액 비표시)",
      (await page.getByText("결제 수단").count()) === 0 &&
        (await page.getByRole("button", { name: "영수증 보기" }).count()) === 0,
    );
    check(
      "S20 상세 모달에 번들 구성 부속 라인 노출(금액 없는 정보)",
      (await page.getByText("목표관리서비스 1개월", { exact: false }).count()) >
        0,
    );
    // 상품명 자체에 정가가 박혀 있어("9,900원 부산캠퍼스…") 모달 전체에서
    // "원" 유무로는 판정할 수 없다 — OrderAmountBreakdown이 쓰는 실제 금액
    // 라벨("결제 금액"/"합계"/"할인액 총합")이 없는지로 정책 위반 여부를 본다.
    const dialogText =
      (await page
        .getByRole("dialog")
        .textContent()
        .catch(() => "")) || "";
    check(
      "S20 상세 모달에 OrderAmountBreakdown 금액 라벨 없음",
      !dialogText.includes("결제 금액") &&
        !dialogText.includes("합계") &&
        !dialogText.includes("할인액 총합"),
      dialogText,
    );

    const refundButtonVisible =
      (await page.getByRole("button", { name: "환불 신청" }).count()) > 0;
    check("S20 결제완료 건에 환불 신청 버튼 노출", refundButtonVisible);
    await page.getByRole("button", { name: "환불 신청" }).click();
    await page.waitForTimeout(1000);
    check(
      "S20 환불 신청 버튼 → asStudent RefundRequestModal 오픈",
      (await page.getByText("환불을 요청할게요").count()) > 0,
    );

    await page.keyboard.press("Escape").catch(() => {});
    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 21 — 나의 서비스 서비스(program_key) 단위 합산(2026-09-01,
  // 사용자 QA 후속): 같은 서비스로 grant가 여러 개(번들 1개월 2회 + 별도
  // 수행평가 3개월 6회, 번들 목표관리 1개월 + 별도 goal-3m 3개월 체이닝)여도
  // 카드는 서비스당 1장이어야 한다 — grant 1행=카드 1장이던 옛 규칙(6be5af13
  // 다음 리팩터)이 되돌아오면 이 시나리오가 실패한다. 시연 데이터(demo-student)
  // 와 동일한 조합을 별도 QA 계정으로 재현한다.
  // ===========================================================================
  const parent21 = await mkUser("s21-parent", "parent");
  const student21 = await mkUser("s21-student", "student", "위닝부산캠퍼스");
  await linkPair(parent21, student21);
  const order21bundle = `order_${RUN_TAG}_agg_bundle`;
  const order21suhaeng6 = `order_${RUN_TAG}_agg_suhaeng6`;
  const order21goal3m = `order_${RUN_TAG}_agg_goal3m`;
  {
    const { error: e1 } = await requestEnrollment(
      order21bundle,
      student21,
      parent21,
      busan,
    );
    check("S21 번들 신청 성공(DB)", !e1, e1?.message);
    cleanup.orderIds.push(order21bundle);
    const paidAt1 = await approveAndPay(order21bundle, parent21);
    const { error: g1 } = await admin.rpc("fn_grant_program_access_for_order", {
      p_order_id: order21bundle,
      p_user_id: parent21.id,
      p_paid_at: paidAt1,
    });
    check("S21 번들 grant 성공", !g1, g1?.message);

    const { error: e2 } = await requestEnrollment(
      order21suhaeng6,
      student21,
      parent21,
      suhaeng6,
    );
    check("S21 수행평가 6회권 신청 성공(DB)", !e2, e2?.message);
    cleanup.orderIds.push(order21suhaeng6);
    const paidAt2 = await approveAndPay(order21suhaeng6, parent21);
    const { error: g2 } = await admin.rpc("fn_grant_program_access_for_order", {
      p_order_id: order21suhaeng6,
      p_user_id: parent21.id,
      p_paid_at: paidAt2,
    });
    check("S21 수행평가 6회권 grant 성공", !g2, g2?.message);

    const { error: e3 } = await requestEnrollment(
      order21goal3m,
      student21,
      parent21,
      goal3m,
    );
    check("S21 목표관리 3개월 신청 성공(DB)", !e3, e3?.message);
    cleanup.orderIds.push(order21goal3m);
    const paidAt3 = await approveAndPay(order21goal3m, parent21);
    const { error: g3 } = await admin.rpc("fn_grant_program_access_for_order", {
      p_order_id: order21goal3m,
      p_user_id: parent21.id,
      p_paid_at: paidAt3,
    });
    check("S21 목표관리 3개월 grant 성공(체이닝)", !g3, g3?.message);

    const { context, page } = await freshPage(browser, student21.email);
    await page.goto(`${APP_ORIGIN}/mypage?tab=services`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);

    const suhaengHeadingCount = await page
      .getByRole("heading", { name: "위닝 수행평가", exact: true })
      .count();
    check(
      "S21 수행평가 grant 2개(번들+6회권)가 카드 1장으로 합산됨",
      suhaengHeadingCount === 1,
      `count=${suhaengHeadingCount}`,
    );
    const goalHeadingCount = await page
      .getByRole("heading", { name: "위닝 목표관리", exact: true })
      .count();
    check(
      "S21 목표관리 grant 2개(번들+3개월, 체이닝)가 카드 1장으로 합산됨",
      goalHeadingCount === 1,
      `count=${goalHeadingCount}`,
    );

    function cardFor21(serviceName) {
      return page
        .getByRole("heading", { name: serviceName, exact: true })
        .locator(
          "xpath=ancestor::div[contains(@class,'rounded-perf-modal')][1]",
        );
    }

    // 수행평가 잔여 = 번들 2회(미사용) + 6회권 6회(미사용) = 8회.
    const suhaengCard21 = cardFor21("위닝 수행평가");
    const suhaengRemaining8 =
      (await suhaengCard21.getByText("잔여 8회", { exact: false }).count()) > 0;
    check("S21 수행평가 합산 잔여 = 8회(2+6)", suhaengRemaining8);

    // 목표관리 체이닝 — 두 번째 grant(3개월)가 번들 grant(1개월) 만료 시점부터
    // 시작하므로(fn_grant_program_access_for_order의 같은 program_key 체이닝
    // 규칙) 합산 만료일까지 남은 일수가 단일 1개월 grant보다 훨씬 길어야
    // 한다 — 날짜 계산 대신 넉넉한 하한(60일)으로 체이닝 반영 여부만 본다
    // (정확한 일수는 실행 시각에 따라 달라져 단언하지 않는다).
    const goalCard21 = cardFor21("위닝 목표관리");
    const goalMetaText = (await goalCard21.textContent().catch(() => "")) || "";
    const goalDaysMatch = goalMetaText.match(/(\d+)일 남음/);
    const goalRemainingDays = goalDaysMatch ? Number(goalDaysMatch[1]) : null;
    check(
      "S21 목표관리 합산 만료가 체이닝 반영(잔여일수 > 60일, 단일 1개월보다 훨씬 김)",
      goalRemainingDays !== null && goalRemainingDays > 60,
      `text=${goalMetaText}`,
    );

    // ─────────────────────────────────────────────────────────────────────
    // 유효기간 분해 다이얼로그(2026-09-01 카드 세부 확정) — 메타 행 문구
    // "유효기간 최대 N일" 확인 + 클릭 시 grant별 표.
    // ─────────────────────────────────────────────────────────────────────
    const suhaengMetaText =
      (await suhaengCard21.textContent().catch(() => "")) || "";
    check(
      "S21 수행평가 메타 문구 = '유효기간 최대 N일'",
      /유효기간 최대 \d+일/.test(suhaengMetaText),
      suhaengMetaText,
    );

    await suhaengCard21.getByRole("button").first().click();
    await page.waitForTimeout(500);
    check(
      "S21 수행평가 다이얼로그 제목 노출",
      (await page.getByText("이용권 유효기간").count()) > 0,
    );
    const suhaengDialogText =
      (await page
        .getByRole("dialog")
        .textContent()
        .catch(() => "")) || "";
    check(
      "S21 수행평가 다이얼로그 grant별 행(2회·6회, 만료 임박순) 노출",
      /2회[\s\S]*유효기간[\s\S]*까지\)/.test(suhaengDialogText) &&
        /6회[\s\S]*유효기간[\s\S]*까지\)/.test(suhaengDialogText),
      suhaengDialogText,
    );
    check(
      "S21 수행평가 다이얼로그 자동 사용 안내 노출",
      suhaengDialogText.includes("먼저 만료되는 회차부터 자동 사용됩니다"),
      suhaengDialogText,
    );
    await page.getByRole("button", { name: "확인" }).click();
    await page.waitForTimeout(300);

    await goalCard21.getByRole("button").first().click();
    await page.waitForTimeout(500);
    const goalDialogText =
      (await page
        .getByRole("dialog")
        .textContent()
        .catch(() => "")) || "";
    check(
      "S21 목표관리 다이얼로그 grant별 행(1개월·3개월, 시작순) 노출",
      /1개월[\s\S]*~/.test(goalDialogText) &&
        /3개월[\s\S]*~/.test(goalDialogText),
      goalDialogText,
    );
    check(
      "S21 목표관리 다이얼로그엔 자동 사용 안내 없음(기간제는 체이닝뿐)",
      !goalDialogText.includes("먼저 만료되는 회차부터 자동 사용됩니다"),
      goalDialogText,
    );
    await page.getByRole("button", { name: "확인" }).click();

    await context.close();
  }
} finally {
  await browser.close();

  // ---------------------------------------------------------------------------
  // 정리 — 이 실행이 만든 QA 데이터만 지운다(RUN_TAG 스코프).
  // ---------------------------------------------------------------------------
  try {
    // S19이 남긴 소비 원장(performance_credit_ledger)·세션(performance_sessions)
    // 부터 지운다 — grant_id FK가 ON DELETE RESTRICT라 program_access_grants를
    // 먼저 지우면 이 행들이 참조를 막아 조용히 실패한다(delete()는 에러를
    // 세우지 않고 그냥 남는다 — orders 정리 버그와 같은 함정).
    if (cleanup.userIds.length > 0) {
      await admin
        .from("performance_credit_ledger")
        .delete()
        .in("profile_id", cleanup.userIds);
      await admin
        .from("performance_sessions")
        .delete()
        .in("profile_id", cleanup.userIds);
    }
    if (cleanup.orderIds.length > 0) {
      await admin
        .from("refund_requests")
        .delete()
        .in("order_id", cleanup.orderIds);
      await admin
        .from("program_access_grants")
        .delete()
        .in("order_id", cleanup.orderIds);
      await admin
        .from("coupon_redemptions")
        .delete()
        .in("order_id", cleanup.orderIds);
      await admin.from("order_items").delete().in("order_id", cleanup.orderIds);
      // orders 의 PK 는 order_id 가 아니라 id 다(order_items/refund_requests
      // 등 자식 테이블만 order_id 를 FK 로 쓴다) — 처음 이 조건을 order_id 로
      // 잘못 써서 orders 행이 전혀 안 지워지는 채로 조용히 성공 처리되던
      // 버그가 있었다(delete() 에러를 체크하지 않아 무증상).
      await admin.from("orders").delete().in("id", cleanup.orderIds);
    }
    if (cleanup.couponIds.length > 0) {
      await admin.from("coupons").delete().in("id", cleanup.couponIds);
    }
    if (cleanup.linkIds.length > 0) {
      await admin.from("parent_child_links").delete().in("id", cleanup.linkIds);
    }
    for (const uid of cleanup.userIds) {
      await admin.from("program_access").delete().eq("id", uid);
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
    console.log(
      `[cleanup] 완료 — orders=${cleanup.orderIds.length}, coupons=${cleanup.couponIds.length}, links=${cleanup.linkIds.length}, users=${cleanup.userIds.length}`,
    );
  } catch (e) {
    console.error(`[cleanup] 실패 — 수동 확인 필요(${RUN_TAG}):`, e.message);
  }
}

console.log(`\n=== 결과 요약 (${results.length}건) ===`);
for (const [status, name] of results) console.log(`[${status}] ${name}`);

if (failures > 0) {
  console.error(`\n[E2E] 실패 ${failures}건`);
  process.exit(1);
}
console.log("\n[E2E] busan-campus-bundle 전체 통과");
