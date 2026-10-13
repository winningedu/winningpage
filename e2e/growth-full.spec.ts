import { expect, test } from "./fixtures/auth";
import {
  cleanupGrowthE2eData,
  createGrowthRoundForE2e,
} from "./fixtures/growth";

// 8단계 모델 호출이 필요해 E2E_GROWTH_FULL=1 일 때만 돈다.
// 전제 회차는 스펙이 직접 만든다(프로필, 조사, 활동 선택을 거쳐 리포트 만들기). 이용권 회차 1회가 소모된다.
test.describe("성장설계 표준 성공 경로", () => {
  test.skip(!process.env.E2E_GROWTH_FULL, "E2E_GROWTH_FULL=1 일 때만 실행");
  test.setTimeout(8 * 60_000);
  // 깨끗한 상태에서 시작하고, 끝난 뒤 접두어 데이터를 정리한다.
  test.beforeAll(async () => {
    await cleanupGrowthE2eData();
  });
  test.afterAll(async () => {
    await cleanupGrowthE2eData();
  });

  test("생성 8단계 완료 후 리포트와 실행계획 체크", async ({
    browser,
    authStorageStatePath,
  }) => {
    const context = await browser.newContext({
      storageState: authStorageStatePath,
    });
    const page = await context.newPage();
    await createGrowthRoundForE2e(page);

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
    // 체크 상태는 쿼리 캐시 갱신 뒤 반영되므로 check() 대신 click 뒤 폴링으로 확인한다.
    // "미체크 첫 항목" 로케이터는 클릭 뒤 다음 항목으로 옮겨 가므로 index 로 고정한다.
    const boxes = page.getByRole("checkbox");
    await expect(boxes.first()).toBeVisible();
    const states = await boxes.evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).checked),
    );
    const target = boxes.nth(states.indexOf(false));
    await target.click();
    await expect(target).toBeChecked({ timeout: 10_000 });
    await context.close();
  });
});
