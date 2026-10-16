import { expect, test } from "./fixtures/auth";
import {
  cleanupGrowthE2eData,
  createGrowthRoundForE2e,
} from "./fixtures/growth";

// 마지막 단계에서 /app/growth/generate 로 들어가면 서버가 1단계 모델 호출을 시작한다(1회 수준).
// 이용권 회차가 소모되는 회차이므로 반복 실행하면 이용권이 줄어든다.
test.describe("성장설계 활동 선택", () => {
  test.beforeAll(async () => {
    await cleanupGrowthE2eData();
  });
  test.afterAll(async () => {
    await cleanupGrowthE2eData();
  });

  test("트랙, 성적, 직접 입력 후 리포트 만들기로 생성 화면 진입", async ({
    browser,
    authStorageStatePath,
  }) => {
    const context = await browser.newContext({
      storageState: authStorageStatePath,
    });
    const page = await context.newPage();

    await createGrowthRoundForE2e(page);
    await context.close();
  });
});
