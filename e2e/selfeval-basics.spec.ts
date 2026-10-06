import { discardOpenSession, expect, test } from "./fixtures/selfeval";

// 기본 입력 가드: 과목명, 문항 오류와 이동 없음, 목표 글자 수 비움 안내, 정상 제출 이동.
test.describe("자기평가서 기본 입력", () => {
  test("필수 입력 가드와 정상 제출", async ({
    studentPage: page,
    request,
    token,
  }) => {
    await discardOpenSession(request, token);
    await page.goto("/app/selfeval");
    await page.getByRole("button", { name: "새 자기평가서 만들기" }).click();
    await page.waitForURL("**/app/selfeval/new");

    const submit = page.getByRole("button", { name: "이 조건으로 활동 찾기" });
    const subject = page.getByLabel("과목명");
    const prompt = page.getByLabel("학교 문항 전문");
    const target = page.getByLabel("목표 글자 수");

    // 학년과 학기는 프로필이 없으면 비어 있다. 비어 있을 때만 채운다.
    const grade = page.getByLabel("학년", { exact: true });
    if ((await grade.inputValue()) === "") await grade.selectOption("고2");
    const semester = page.getByLabel("학기", { exact: true });
    if ((await semester.inputValue()) === "") await semester.selectOption("2");

    // 과목명 비움 -> 과목명 오류, 이동 없음
    await subject.fill("");
    await prompt.fill("교과 학습에서 스스로 탐구한 내용을 서술하시오.");
    await submit.click();
    await expect(page.getByText("과목명을 입력해 주세요.")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/selfeval\/new$/);

    // 과목명 입력 + 문항 비움 -> 문항 오류
    await subject.fill("확률과 통계");
    await prompt.fill("");
    await submit.click();
    await expect(
      page.getByText("학교에서 받은 문항을 입력해 주세요."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/app\/selfeval\/new$/);

    // 목표 글자 수 비움 -> 분량 판정 안내
    await target.fill("");
    await expect(
      page.getByText("비워 두면 분량 판정만 꺼져요"),
    ).toBeVisible();

    // 전부 채우고 제출 -> 활동 선택으로 이동
    await prompt.fill("교과 학습에서 스스로 탐구한 내용을 서술하시오.");
    await target.fill("500");
    await submit.click();
    await page.waitForURL(/\/app\/selfeval\/s\/[^/]+\/activities/);

    await discardOpenSession(request, token);
  });
});
