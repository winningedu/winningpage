import { expect, test } from "@playwright/test";
import { ensureAuthUser, loginWith, psql } from "./fixtures/inquiry";

// 명세 No.143 의 "이용권 0 차단" 을 다룬다.
// 검증 실패 재요청(No.143 6)은 단위 테스트가 덮으므로 심화탐구 E2E 에서 뺀다.
const NOENT_EMAIL = "inquiry-noent@winning.test";
const NOENT_PASSWORD = "InquiryNoEnt2026!";

test.describe("심화탐구 접근 차단", () => {
  test.beforeAll(async () => {
    await ensureAuthUser(NOENT_EMAIL, NOENT_PASSWORD);
    // 가입 트리거가 만든 profiles 행을 학생 계정(약관 동의 완료)으로 맞춘다. 이용권은 주지 않는다.
    psql(
      `update profiles set member_type = 'student', name = '무이용권학생', terms_service_agreed = true, privacy_required_agreed = true where email = '${NOENT_EMAIL}'`,
    );
    const count = psql(
      `select count(*) from profiles where email = '${NOENT_EMAIL}' and member_type = 'student'`,
    );
    expect(count, "가입 트리거가 profiles 행을 만들어야 한다").toBe("1");
  });

  test("이용권 없는 학생은 /app/inquiry 에서 이용권 안내로 간다", async ({
    page,
  }) => {
    await loginWith(page, NOENT_EMAIL, NOENT_PASSWORD);
    await page.goto("/app/inquiry");
    await page.waitForURL(/\/pricing\?service=inquiry/);
    expect(new URL(page.url()).searchParams.get("service")).toBe("inquiry");
  });

  test("비로그인 /app/inquiry 진입은 /login 으로 이동", async ({ page }) => {
    await page.goto("/app/inquiry");
    await page.waitForURL(/\/login/);
    await expect(page.locator("#login-email")).toBeVisible();
  });

  test("토큰 없는 /api/inquiry/session 은 401", async ({ request }) => {
    const res = await request.post("/api/inquiry/session", {
      data: { action: "resume" },
    });
    expect(res.status()).toBe(401);
  });
});
