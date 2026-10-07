import { expect, test } from "@playwright/test";
import { apiBase } from "./fixtures/env";
import { getStudentToken } from "./fixtures/selfeval";

// 접근 차단: 토큰 없는 API 는 401, 비로그인 화면 진입은 /login. 깨진 JSON 응답은 기록만 한다.
test.describe("자기평가서 접근 차단", () => {
  test("토큰 없는 /api/selfeval/reports 는 401", async ({ request }) => {
    const res = await request.get(`${apiBase()}/selfeval/reports`);
    expect(res.status()).toBe(401);
  });

  test("비로그인 /app/selfeval 진입은 /login 으로 이동", async ({ page }) => {
    await page.goto("/app/selfeval");
    await page.waitForURL(/\/login/);
    await expect(page.locator("#login-email")).toBeVisible();
  });

  test("깨진 JSON 바디의 응답 상태를 기록한다", async ({
    request,
  }, testInfo) => {
    const token = await getStudentToken(request);
    const res = await request.fetch(`${apiBase()}/selfeval/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: "{ 깨진 json",
    });
    // 차단 조건이 아니다. 4xx 또는 500 이면 기록만 남긴다.
    testInfo.annotations.push({
      type: "broken-json-status",
      description: String(res.status()),
    });
    console.log(`깨진 JSON POST /session 응답: ${res.status()}`);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
