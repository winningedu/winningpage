import { expect, test } from "./fixtures/auth";
import {
  answerFirstQuestion,
  ensureProfileSaved,
  goToCollectFromSurvey,
} from "./fixtures/growth";

// 마지막 단계에서 /app/growth/generate 로 들어가면 서버가 1단계 모델 호출을 시작한다(1회 수준).
// 이용권 회차가 소모되는 회차이므로 반복 실행하면 이용권이 줄어든다.
test.describe("성장설계 활동 선택", () => {
  test("트랙, 성적, 직접 입력 후 리포트 만들기로 생성 화면 진입", async ({
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
    await answerFirstQuestion(page, `E2E 수집 ${Date.now()}`);
    await goToCollectFromSurvey(page);

    await expect(
      page.getByRole("heading", { name: "활동 선택" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "고2" }).click();
    await expect(page.getByRole("radio", { name: "고2" })).toBeChecked();

    const gradeInput = page.locator('input[id^="grade-"]').first();
    await expect(gradeInput).toBeVisible();
    await gradeInput.fill("3");

    await page.getByLabel("학년", { exact: true }).selectOption("고2");
    await page.getByLabel("학기", { exact: true }).selectOption("1");
    await page.getByLabel("과목 또는 영역").fill("통합사회");
    await page.getByLabel("주제", { exact: true }).fill("E2E 직접 입력 주제");
    await page.getByLabel("개념", { exact: true }).fill("E2E 개념");
    await page.getByLabel("방법", { exact: true }).fill("E2E 방법");
    await page.getByLabel("결과", { exact: true }).fill("E2E 결과");
    await page.getByLabel("한계", { exact: true }).fill("E2E 한계");
    await page.getByRole("button", { name: "활동 추가" }).click();

    const total = page
      .getByText("분석 대상 합계")
      .locator("xpath=following-sibling::span");
    await expect(total).toHaveText(/^[1-9]\d*건$/, { timeout: 15_000 });

    const make = page.getByRole("button", {
      name: "리포트 만들기",
      exact: true,
    });
    await expect(make).toBeEnabled();
    await make.click();

    await page.waitForURL("**/app/growth/generate");
    await expect(
      page.getByRole("heading", { name: "진행 상황" }),
    ).toBeVisible();
    await context.close();
  });
});
