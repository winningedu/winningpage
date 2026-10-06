import { expect, test } from "./fixtures/auth";

// 8단계 모델 호출이 필요해 E2E_GROWTH_FULL=1 일 때만 돈다.
// 전제: 이미 /app/growth/generate 로 들어간 회차가 있는 학생 계정.
test.describe("성장설계 표준 성공 경로", () => {
  test.skip(!process.env.E2E_GROWTH_FULL, "E2E_GROWTH_FULL=1 일 때만 실행");
  test.setTimeout(8 * 60_000);

  test("생성 8단계 완료 후 리포트와 실행계획 체크", async ({
    browser,
    authStorageStatePath,
  }) => {
    const context = await browser.newContext({
      storageState: authStorageStatePath,
    });
    const page = await context.newPage();
    await page.goto("/app/growth/generate");

    // 요청 단위 실패(시간 초과 등) 뒤에는 자동으로 잇지 않고 "다시 시도" 버튼을 보여 준다.
    // 완료 문구가 뜰 때까지 버튼이 보이면 눌러 이어간다.
    const done = page.getByText("8 / 8 단계 완료");
    const retry = page.getByRole("button", { name: "다시 시도" });
    const deadline = Date.now() + 6 * 60_000;
    while (!(await done.isVisible()) && Date.now() < deadline) {
      if (await retry.isVisible()) await retry.click();
      await page.waitForTimeout(2_000);
    }
    await expect(done).toBeVisible();
    await page.waitForURL("**/app/growth/reports/*", { timeout: 30_000 });
    await expect(page.getByRole("main")).toBeVisible();

    await page.goto("/app/growth/plan");
    const first = page.getByRole("checkbox").first();
    await expect(first).toBeVisible();
    await first.check();
    await expect(first).toBeChecked();
    await context.close();
  });
});
