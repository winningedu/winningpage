import { expect, test } from "./fixtures/auth";
import {
  answerFirstQuestion,
  ensureProfileSaved,
  goToCollectFromSurvey,
} from "./fixtures/growth";

test.describe("성장설계 학생 조사", () => {
  test("답 자동 저장, 새로고침 복원, 활동 선택으로 이동", async ({
    browser,
    authStorageStatePath,
  }) => {
    const context = await browser.newContext({
      storageState: authStorageStatePath,
    });
    const page = await context.newPage();

    await page.goto("/app/growth");
    await ensureProfileSaved(page);

    await page.goto("/app/growth/survey");
    await expect(
      page.getByRole("heading", { name: "학생 조사" }),
    ).toBeVisible();

    const answer = `E2E 조사 답 ${Date.now()}`;
    await answerFirstQuestion(page, answer);

    // No.144: 새로고침 뒤에도 저장된 답이 복원된다.
    await page.reload();
    await expect(page.getByRole("textbox", { name: /^1\. / })).toHaveValue(
      answer,
    );

    await goToCollectFromSurvey(page);
    await expect(
      page.getByRole("heading", { name: "활동 선택" }),
    ).toBeVisible();
    await context.close();
  });
});
