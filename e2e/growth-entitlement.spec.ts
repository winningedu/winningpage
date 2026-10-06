import { expect, test } from "@playwright/test";

// 이용권 0 학생 계정은 이번 범위 밖이라 API 와 가드 수준으로 대체한다.
test.describe("성장설계 접근 차단", () => {
  test("토큰 없는 /api/growth/survey 는 401", async ({ request }) => {
    const res = await request.get("/api/growth/survey");
    expect(res.status()).toBe(401);
  });

  test("비로그인 /app/growth 진입은 /login 으로 이동", async ({ page }) => {
    await page.goto("/app/growth");
    await page.waitForURL(/\/login/);
    await expect(page.locator("#login-email")).toBeVisible();
  });
});
