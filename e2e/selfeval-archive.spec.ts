import { discardOpenSession, expect, test } from "./fixtures/selfeval";

// 보관함: 상태 필터와 완료 세션 다시 보기. 로컬에 완료 세션이 2건 이상 있어야 한다.
test.describe("자기평가서 보관함", () => {
  test("완료로 거르면 완료 행만 남고 다시 보기가 저장 완료 화면을 연다", async ({
    studentPage: page,
    request,
    token,
  }) => {
    await discardOpenSession(request, token);
    await page.goto("/app/selfeval/archive");

    await expect(page.getByRole("heading", { name: "보관함" })).toBeVisible();
    const state = page.getByLabel("상태");
    await expect(state).toBeVisible();

    await state.selectOption({ label: "완료" });

    const rows = page.getByRole("listitem").filter({
      has: page.getByRole("button", { name: /다시 보기|이어서 작성하기|새로 시작하기/ }),
    });
    const count = await rows.count();
    expect(count, "로컬 완료 세션이 2건 이상이어야 한다").toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i += 1) {
      await expect(rows.nth(i)).toContainText("완료");
      await expect(
        rows.nth(i).getByRole("button", { name: "다시 보기" }),
      ).toBeVisible();
    }

    await rows.first().getByRole("button", { name: "다시 보기" }).click();
    await page.waitForURL(/\/app\/selfeval\/s\/[^/]+\/done/);
    await expect(
      page.getByRole("heading", { name: "최종본을 저장했습니다" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "전체 복사" })).toBeVisible();
  });
});
