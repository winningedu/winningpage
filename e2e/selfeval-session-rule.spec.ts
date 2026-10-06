import {
  api,
  createSession,
  discardOpenSession,
  expect,
  test,
} from "./fixtures/selfeval";

// 학생당 열린 세션 1개 규칙: 이어서 작성하기와 새로 만들기가 함께 보이고, 파기 확인 뒤 열린 세션이 사라진다.
test.describe("자기평가서 열린 세션 규칙", () => {
  test("열린 세션이 있으면 이어서와 새로 만들기가 보이고 파기하면 비워진다", async ({
    studentPage: page,
    request,
    token,
  }) => {
    await discardOpenSession(request, token);
    await createSession(request, token);

    await page.goto("/app/selfeval");
    await expect(
      page.getByRole("button", { name: "이어서 작성하기" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "새로 만들기" }),
    ).toBeVisible();

    // 통계 "작성 중인 자기평가서" 칸이 1건
    const openStat = page
      .locator("div")
      .filter({ hasText: /^작성 중인 자기평가서/ })
      .last();
    await expect(openStat).toContainText("1");

    await page.getByRole("button", { name: "새로 만들기" }).click();
    await expect(
      page.getByText("작성 중인 자기평가서를 파기할까요?"),
    ).toBeVisible();
    await page.getByRole("button", { name: "파기하고 새로 만들기" }).click();

    await page.waitForURL("**/app/selfeval/new");

    const entry = await api(request, token, "GET", "/reports");
    expect(entry.status).toBe(200);
    expect(entry.json.entry.openSession).toBeNull();
  });
});
