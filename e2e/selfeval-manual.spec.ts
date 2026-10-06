import { createSession, discardOpenSession, expect, test } from "./fixtures/selfeval";

// 직접 입력 활동으로 분석 확인 화면에 도달한다(모델 호출 없음, 분석 확인은 누르지 않는다).
test.describe("자기평가서 직접 입력 활동", () => {
  test("직접 입력 -> 분석 확인에 학생 입력 안내와 11항목이 보인다", async ({
    studentPage: page,
    request,
    token,
  }) => {
    await discardOpenSession(request, token);
    const sessionId = await createSession(request, token);

    await page.goto(`/app/selfeval/s/${sessionId}/activities`);

    // 후보가 없으면 폼이 이미 열려 있다. 닫혀 있으면 직접 입력 버튼으로 연다.
    const form = page.getByRole("region", { name: "직접 입력" });
    const open = page.getByRole("button", { name: "직접 입력", exact: true });
    await expect(form.or(open)).toBeVisible();
    if (!(await form.isVisible())) await open.click();
    await expect(form).toBeVisible();

    await form.getByLabel("활동명").fill("버스 배차 간격 탐구");
    await form.getByLabel("계기").fill("버스가 자주 늦어 분포가 궁금했다.");
    await form
      .getByLabel("결과와 근거")
      .fill("평균 8.4분, 표준편차 2.1분이었다.");
    await form.getByRole("button", { name: "이 활동으로 분석하기" }).click();

    await page.waitForURL(`**/app/selfeval/s/${sessionId}/analysis`);

    // 화면 전환 중에는 활동 선택 화면 DOM 이 남아 있다. 분석 화면에만 있는 안내를 먼저 기다린다.
    await expect(
      page.getByText("직접 입력한 활동이라 분석 항목을 학생이 채워야 해요"),
    ).toBeVisible();
    // 분석 확인 표는 활동명을 그리지 않는다. 입력한 항목 값이 표에 들어갔는지로 본다.
    await expect(
      page.getByRole("button", { name: "결과와 근거 고치기" }),
    ).toContainText("평균 8.4분, 표준편차 2.1분이었다.");
    await expect(page.getByRole("button", { name: "계기 고치기" })).toContainText(
      "버스가 자주 늦어 분포가 궁금했다.",
    );

    for (const label of [
      "계기",
      "교과 개념",
      "한 일",
      "방법",
      "결과와 근거",
      "역할",
      "협업",
      "배운 점",
      "진로 연결",
      "한계",
      "다음 단계",
    ]) {
      await expect(
        page.getByRole("button", { name: `${label} 고치기` }),
      ).toBeVisible();
    }

    // 모델을 부르는 버튼이라 누르지 않고 활성 여부만 본다.
    await expect(
      page.getByRole("button", { name: "이 내용으로 작성하기" }),
    ).toBeEnabled();

    await discardOpenSession(request, token);
  });
});
