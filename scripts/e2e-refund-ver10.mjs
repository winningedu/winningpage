// 환불 Ver10 E2E — 부분환불 신청·전액 철회·학생 요청→학부모 승인 흐름
// (docs/refund-quote-ver10-design.md A13).
//
// 세션별 격리 원칙: 각 흐름마다 새 playwright 컨텍스트를 만들고 storageState 를
// 공유하지 않는다. 세션은 admin generate_link(magiclink) → verify 로 매번 새로
// 발급해 localStorage 에 주입한다(scripts/e2e-onboarding-smoke.mjs 관례).
//
// 절대 규칙:
//   - dev DB(gjowqdiopinhixfivnkx)만 대상으로 한다 — 다른 ref 면 즉시 abort.
//   - Ver10 함수(fn_refund_quote 4-인자)가 없는 DB 면 즉시 abort — 이
//     스크립트는 refund-ver10-core 머지·마이그레이션 적용 후에만 의미가 있다.
//   - 검증 서버는 5303 고정 포트의 vite 를 그대로 쓴다(재기동하지 않는다).
//     없으면: npm run dev -- --port 5303 --strictPort
//   - 어드민 완료(fn_complete_refund + 토스 취소)는 E2E 범위 밖 — DB 계층은
//     scripts/refund-quote-ver10.spec.sql(T15~T19)이 검증한다.
//
// 실행: node scripts/e2e-refund-ver10.mjs
// 생성한 QA 주문·신청·계정 데이터는 종료 시 정리한다(실패해도 finally 에서 시도).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const APP_ORIGIN = "http://localhost:5303";
const EXPECTED_REF = "gjowqdiopinhixfivnkx";
const RUN_TAG = `rv10-${Date.now().toString(36)}`;

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

const ref = SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\./)?.[1];
if (ref !== EXPECTED_REF) {
  console.error(`[ABORT] DB ref 불일치: 기대 ${EXPECTED_REF}, 실제 ${ref}.`);
  process.exit(1);
}
console.log(`[env] dev DB ref 확인: ${ref}`);

const admin = createClient(SUPABASE_URL, SECRET_KEY);

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`[PASS] ${name}`);
  } else {
    failures += 1;
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 0) Ver10 함수 존재 가드 — 4-인자 시그니처로 호출해 본다. 함수가 구버전이면
//    PostgREST 가 PGRST202(함수 없음)를 돌려준다.
// ---------------------------------------------------------------------------
{
  const { error } = await admin.rpc("fn_refund_quote", {
    p_order_id: "__rv10_probe__",
    p_order_item_ids: null,
    p_company_fault: false,
  });
  // 주문이 없으니 WC005 가 정답이다 — 함수 자체가 없으면 PGRST202.
  if (error?.code === "PGRST202") {
    console.error(
      "[ABORT] fn_refund_quote v10(4-인자)이 이 DB에 없다 — refund-ver10-core 마이그레이션 적용 후 실행할 것.",
    );
    process.exit(1);
  }
  console.log(
    `[guard] fn_refund_quote v10 존재 확인(probe code=${error?.code})`,
  );
}

// ---------------------------------------------------------------------------
// 1) QA 데이터 셋업 — 학부모·학생 쌍 + 2항목(goal-12m, suhaeng-2) paid 주문.
//    부여는 운영과 같은 경로(fn_grant_program_access_for_order)로 만든다.
// ---------------------------------------------------------------------------
/** @type {{ userIds: string[], orderIds: string[] }} */
const cleanup = { userIds: [], orderIds: [] };

async function mkUser(label, memberType) {
  const email = `${RUN_TAG}-${label}@winning.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `Rv10!${RUN_TAG}`,
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
  });
  if (pErr) throw new Error(`profiles upsert(${label}) 실패: ${pErr.message}`);
  return { id, email };
}

async function mkPaidOrder(orderId, parent, student, slugs) {
  const { data: products, error: prodErr } = await admin
    .from("products")
    .select("id, slug, service_key, name, list_price, price")
    .in("slug", slugs);
  if (prodErr || products.length !== slugs.length) {
    throw new Error(
      `상품 조회 실패(${slugs.join(",")}): ${prodErr?.message || "일부 slug 없음"}`,
    );
  }
  const listAmount = products.reduce((s, p) => s + p.list_price, 0);
  const amount = products.reduce((s, p) => s + p.price, 0);
  const now = new Date().toISOString();

  // 위 prodErr||length 체크를 통과했고 slugs는 항상 비어있지 않은
  // 배열로 호출되므로 products[0]은 항상 존재한다.
  const firstProduct = products[0];
  if (firstProduct === undefined) {
    throw new Error(`상품 조회 결과가 비어있음(${slugs.join(",")})`);
  }

  const { error: oErr } = await admin.from("orders").insert({
    id: orderId,
    user_id: parent.id,
    status: "paid",
    order_name: `${firstProduct.name}${products.length > 1 ? ` 외 ${products.length - 1}건` : ""}`,
    list_amount: listAmount,
    discount_amount: listAmount - amount,
    amount,
    customer_email: parent.email,
    paid_at: now,
    student_profile_id: student.id,
    parent_profile_id: parent.id,
    approval_status: "approved",
    requested_at: now,
    responded_at: now,
  });
  if (oErr) throw new Error(`orders insert(${orderId}) 실패: ${oErr.message}`);
  cleanup.orderIds.push(orderId);

  const { error: iErr } = await admin.from("order_items").insert(
    products.map((p) => ({
      order_id: orderId,
      product_slug: p.slug,
      service_key: p.service_key,
      name: p.name,
      list_price: p.list_price,
      price: p.price,
      quantity: 1,
      product_id: p.id,
    })),
  );
  if (iErr)
    throw new Error(`order_items insert(${orderId}) 실패: ${iErr.message}`);

  const { error: gErr } = await admin.rpc("fn_grant_program_access_for_order", {
    p_order_id: orderId,
    p_user_id: parent.id,
    p_paid_at: now,
  });
  if (gErr) throw new Error(`부여 실패(${orderId}): ${gErr.message}`);
  return { amount, products };
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
  if (!glRes.ok) throw new Error(`generate_link 실패: ${glRes.status}`);
  const tokenHash = glBody.hashed_token || glBody.properties?.hashed_token;

  const vfRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await vfRes.json();
  if (!vfRes.ok || !session.access_token)
    throw new Error(`verify 실패: ${vfRes.status}`);

  return {
    storageKey: `sb-${ref}-auth-token`,
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

// 사용자 자격으로 rpc 호출 — fn_refund_quote 는 auth.uid() 소유권 검사를 하므로
// service role(무 auth 컨텍스트)로 부르면 WC005 가 난다. 기대값 산정은 화면과
// 같은 자격(당사자 세션)으로 불러야 한다.
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
  const { storageKey, storageVal } = await mintSession(email);
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

async function openRefundModalFromHistory(page, orderId) {
  // 결제 탭은 쿼리스트링으로 직접 진입한다 — MyPageTabs 는 role="tab" 없는
  // Link 라 getByRole('tab') 로는 잡히지 않는다(useMyPageTab 의 ?tab= 지원).
  await page.goto(`${APP_ORIGIN}/mypage?tab=payments`, {
    waitUntil: "domcontentloaded",
  });
  // 지난 결제내역에서 해당 주문 행 → 상세 모달 → 환불 신청.
  await page
    .getByText(orderId.replace(/^order_/, ""), { exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: /환불 신청/ }).click();
}

const browser = await chromium.launch();
try {
  // 서버 확인 — 5303 vite 가 떠 있어야 한다.
  try {
    const res = await fetch(APP_ORIGIN, { redirect: "manual" });
    if (!res.ok && res.status >= 500) throw new Error(String(res.status));
  } catch {
    console.error(
      `[ABORT] ${APP_ORIGIN} 응답 없음 — 검증 서버(포트 5303)를 먼저 띄울 것: npm run dev -- --port 5303 --strictPort`,
    );
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // F1) 학부모 부분환불 신청 — 구성서비스 체크박스에서 suhaeng-2 만 남긴다.
  // -------------------------------------------------------------------------
  {
    const parent = await mkUser("f1-parent", "parent");
    const student = await mkUser("f1-student", "student");
    const orderId = `order_${RUN_TAG}_f1`;
    await mkPaidOrder(orderId, parent, student, ["goal-12m", "suhaeng-2"]);

    // 서버 산정 기대값(화면과 같은 함수) — suhaeng-2 항목만.
    const { data: itemRows } = await admin
      .from("order_items")
      .select("id, product_slug")
      .eq("order_id", orderId);
    if (itemRows === null) {
      throw new Error(`order_items 조회 결과가 없음(${orderId})`);
    }
    const suhaengItem = itemRows.find((r) => r.product_slug === "suhaeng-2");
    if (suhaengItem === undefined) {
      throw new Error(`suhaeng-2 항목을 못 찾음(${orderId})`);
    }
    const { data: quoteRows, error: qErr } = await rpcAsUser(
      parent.email,
      "fn_refund_quote",
      {
        p_order_id: orderId,
        p_order_item_ids: [suhaengItem.id],
      },
    );
    if (qErr) throw new Error(`기대 산정 실패: ${qErr.message}`);
    const expected = Array.isArray(quoteRows) ? quoteRows[0] : quoteRows;

    const { context, page } = await freshPage(browser, parent.email);
    await openRefundModalFromHistory(page, orderId);

    // 항목 2개짜리 주문 — 체크박스 목록이 떠야 한다(전체 선택 기본).
    // 목록은 fn_refund_quote 응답 후에 렌더되므로 먼저 나타나기를 기다린다.
    await page
      .locator('input[type="checkbox"]')
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    const goalBox = page
      .getByRole("checkbox", { name: /목표관리|goal/i })
      .first();
    const suhaengBox = page
      .getByRole("checkbox", { name: /수행평가|suhaeng/i })
      .first();
    check(
      "F1 구성서비스 체크박스 노출",
      (await goalBox.count()) + (await suhaengBox.count()) > 0,
    );

    // goal 해제 → suhaeng 만 남김 → 재산정 반영 대기.
    await goalBox.uncheck().catch(async () => {
      // 접근성 이름이 상품명과 다르면 라벨 텍스트로 폴백.
      await page.getByText("목표관리", { exact: false }).first().click();
    });
    await page
      .getByText(
        new RegExp(
          String(expected.refund_amount).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
        ),
      )
      .first()
      .waitFor({ timeout: 10_000 });
    check("F1 부분 산정 금액 표시", true);

    await page.getByText("단순 변심").click();
    await page.getByRole("button", { name: /^환불 하기$/ }).click();
    await page.waitForTimeout(1500);

    const { data: rr } = await admin
      .from("refund_requests")
      .select("amount, order_item_ids, terms_version, approval_status")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    check("F1 신청 행 생성", Boolean(rr), "refund_requests 행 없음");
    if (rr) {
      check(
        "F1 amount = 서버 산정",
        rr.amount === expected.refund_amount,
        `${rr.amount} vs ${expected.refund_amount}`,
      );
      check(
        "F1 order_item_ids = [suhaeng-2]",
        Array.isArray(rr.order_item_ids) &&
          rr.order_item_ids.length === 1 &&
          Number(rr.order_item_ids[0]) === suhaengItem.id,
        JSON.stringify(rr.order_item_ids),
      );
      check("F1 terms_version v10", rr.terms_version === "v10");
      check("F1 학부모 즉시 approved", rr.approval_status === "approved");
    }
    await context.close();
  }

  // -------------------------------------------------------------------------
  // F2) 학부모 전액 철회 — 전체 선택 기본 그대로 신청, scope=주문 전체(NULL).
  // -------------------------------------------------------------------------
  {
    const parent = await mkUser("f2-parent", "parent");
    const student = await mkUser("f2-student", "student");
    const orderId = `order_${RUN_TAG}_f2`;
    const { amount } = await mkPaidOrder(orderId, parent, student, [
      "goal-12m",
      "suhaeng-2",
    ]);

    const { context, page } = await freshPage(browser, parent.email);
    await openRefundModalFromHistory(page, orderId);
    await page.getByText("단순 변심").click();
    await page.getByRole("button", { name: /^환불 하기$/ }).click();
    await page.waitForTimeout(1500);

    const { data: rr } = await admin
      .from("refund_requests")
      .select("amount, order_item_ids, within_withdrawal")
      .eq("order_id", orderId)
      .single();
    check("F2 신청 행 생성", Boolean(rr));
    if (rr) {
      check(
        "F2 전액(미개시)",
        rr.amount === amount,
        `${rr.amount} vs ${amount}`,
      );
      check(
        "F2 주문 전체(order_item_ids NULL)",
        rr.order_item_ids === null,
        JSON.stringify(rr.order_item_ids),
      );
      check("F2 청약철회기간 내", rr.within_withdrawal === true);
    }
    await context.close();
  }

  // -------------------------------------------------------------------------
  // F3) 학생 요청 → 학부모 승인 — 승인 모달에 항목별 내역이 떠야 한다.
  // -------------------------------------------------------------------------
  {
    const parent = await mkUser("f3-parent", "parent");
    const student = await mkUser("f3-student", "student");
    const orderId = `order_${RUN_TAG}_f3`;
    await mkPaidOrder(orderId, parent, student, ["goal-12m", "suhaeng-2"]);

    // 학생이 전체 환불 요청(학생 세션 — 별도 격리 컨텍스트).
    {
      const { context, page } = await freshPage(browser, student.email);
      await openRefundModalFromHistory(page, orderId);
      await page.getByText("단순 변심").click();
      await page.getByRole("button", { name: /환불 요청 하기/ }).click();
      await page.waitForTimeout(1500);
      await context.close();
    }
    const { data: rr1 } = await admin
      .from("refund_requests")
      .select("id, approval_status")
      .eq("order_id", orderId)
      .single();
    check("F3 학생 신청 requested", rr1?.approval_status === "requested");

    // 학부모가 승인(학부모 세션 — 새 격리 컨텍스트).
    {
      const { context, page } = await freshPage(browser, parent.email);
      // 결제 탭 직접 진입(openRefundModalFromHistory 와 같은 사유 — role="tab" 없음).
      await page.goto(`${APP_ORIGIN}/mypage?tab=payments`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByText(orderId.replace(/^order_/, ""), { exact: false })
        .first()
        .click();
      // 항목별 내역 — 두 상품명이 승인 모달 안에 보여야 한다.
      check(
        "F3 승인 모달 항목별 내역(2행)",
        (await page.getByText(/목표관리|goal/i).count()) > 0 &&
          (await page.getByText(/수행평가|suhaeng/i).count()) > 0,
      );
      await page.getByRole("button", { name: /환불 승인/ }).click();
      await page.waitForTimeout(1500);
      await context.close();
    }
    const { data: rr2 } = await admin
      .from("refund_requests")
      .select("approval_status")
      .eq("order_id", orderId)
      .single();
    check("F3 승인 후 approved", rr2?.approval_status === "approved");
  }
} finally {
  await browser.close();

  // ---------------------------------------------------------------------------
  // 정리 — 이 실행이 만든 QA 데이터만 지운다(RUN_TAG 스코프).
  // ---------------------------------------------------------------------------
  try {
    if (cleanup.orderIds.length > 0) {
      await admin
        .from("refund_requests")
        .delete()
        .in("order_id", cleanup.orderIds);
      await admin
        .from("program_access_grants")
        .delete()
        .in("order_id", cleanup.orderIds);
      await admin.from("order_items").delete().in("order_id", cleanup.orderIds);
      await admin.from("orders").delete().in("order_id", cleanup.orderIds);
    }
    for (const uid of cleanup.userIds) {
      await admin.from("program_access").delete().eq("id", uid);
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
    console.log(
      `[cleanup] 완료 — orders=${cleanup.orderIds.length}, users=${cleanup.userIds.length}`,
    );
  } catch (e) {
    console.error(`[cleanup] 실패 — 수동 확인 필요(${RUN_TAG}):`, e.message);
  }
}

if (failures > 0) {
  console.error(`\n[E2E] 실패 ${failures}건`);
  process.exit(1);
}
console.log("\n[E2E] refund-ver10 전체 통과");
