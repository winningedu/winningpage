import { expect, test } from "./fixtures/auth";
import { ensureProfileSaved } from "./fixtures/growth";

test.describe("성장설계 시작 화면", () => {
  test("시작 화면 구성과 학생 정보 저장", async ({
    browser,
    authStorageStatePath,
  }) => {
    const context = await browser.newContext({
      storageState: authStorageStatePath,
    });
    const page = await context.newPage();
    await page.goto("/app/growth");

    await expect(
      page.getByRole("heading", { name: "위닝 성장설계" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "시작 전 확인" }),
    ).toBeVisible();

    await ensureProfileSaved(page);

    await expect(
      page.getByRole("button", { name: /^(학생 조사 시작하기|이어서 하기)$/ }),
    ).toBeVisible();
    await context.close();
  });
});
