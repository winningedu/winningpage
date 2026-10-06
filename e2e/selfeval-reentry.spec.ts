import {
  addManualActivity,
  createSession,
  discardOpenSession,
  expect,
  test,
} from "./fixtures/selfeval";

// 재진입: 활동 선택 뒤(currentStep 2) 시작 화면의 이어서 작성하기가 분석 확인으로 보낸다.
test.describe("자기평가서 재진입", () => {
  test("이어서 작성하기는 분석 확인으로 가고 새로고침해도 유지된다", async ({
    studentPage: page,
    request,
    token,
  }) => {
    await discardOpenSession(request, token);
    const sessionId = await createSession(request, token);
    await addManualActivity(request, token, sessionId);

    await page.goto("/app/selfeval");
    await page.getByRole("button", { name: "이어서 작성하기" }).click();
    await page.waitForURL(`**/app/selfeval/s/${sessionId}/analysis`);
    await expect(
      page.getByText("직접 입력한 활동이라 분석 항목을 학생이 채워야 해요"),
    ).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(
      new RegExp(`/app/selfeval/s/${sessionId}/analysis$`),
    );
    await expect(
      page.getByText("직접 입력한 활동이라 분석 항목을 학생이 채워야 해요"),
    ).toBeVisible();

    await discardOpenSession(request, token);
  });
});
