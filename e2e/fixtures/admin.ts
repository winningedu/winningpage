import type { Page } from "@playwright/test";

// 본사 관리자 계정은 학생 픽스처(auth.ts)와 같은 방식으로 환경변수로만 받는다.
// 값이 없으면 호출하는 스펙이 test.skip 으로 건너뛴다.
export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

export const ADMIN_ENV_MISSING_REASON =
  "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD 환경변수가 없다. 로컬 본사 관리자 계정으로 채워서 실행할 것.";

/** /login 으로 본사 관리자 로그인하고 /login 을 벗어날 때까지 기다린다. */
export async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator("#login-email").fill(E2E_ADMIN_EMAIL ?? "");
  await page.locator("#login-password").fill(E2E_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
