import { expect, test } from "./fixtures/auth";

test.describe("성장설계 지난 리포트", () => {
  test("머리와 목록 또는 빈 상태가 보인다", async ({
    browser,
    authStorageStatePath,
  }) => {
    const context = await browser.newContext({
      storageState: authStorageStatePath,
    });
    const page = await context.newPage();
    await page.goto("/app/growth/reports");

    await expect(
      page.getByRole("heading", { name: "지난 리포트" }),
    ).toBeVisible();
    const empty = page.getByText("아직 완료한 리포트가 없어요");
    const list = page.getByRole("heading", { level: 3 }).first();
    await expect(empty.or(list)).toBeVisible();

    // 미완 회차가 있으면 이어서 하기 카드가 함께 보인다.
    const resume = page.getByRole("link", { name: "이어서 하기" });
    if (await resume.count()) {
      await expect(
        page.getByRole("region", { name: "미완 회차" }),
      ).toBeVisible();
    }
    await context.close();
  });
});
