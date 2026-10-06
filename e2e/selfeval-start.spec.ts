import { discardOpenSession, expect, test } from "./fixtures/selfeval";

// 시작 화면: 머리, 통계 3칸, 하단 고지, 사이드바 메뉴와 진행단계, 새 자기평가서 버튼.
test.describe("자기평가서 시작 화면", () => {
  test("진입 정보와 고지, 사이드바가 보인다", async ({
    studentPage: page,
    request,
    token,
  }) => {
    await discardOpenSession(request, token);
    await page.goto("/app/selfeval");

    await expect(
      page.getByRole("heading", { name: "위닝 자기평가서" }),
    ).toBeVisible();

    // 통계 3칸
    await expect(page.getByText("이용 가능 횟수", { exact: true })).toBeVisible();
    await expect(page.getByText("저장된 활동", { exact: true })).toBeVisible();
    await expect(
      page.getByText("작성 중인 자기평가서", { exact: true }),
    ).toBeVisible();

    // 하단 고지 4줄
    await expect(page.getByText("꼭 알아 두세요")).toBeVisible();
    await expect(
      page.getByText("세부능력 및 특기사항은 선생님이 기재해요"),
    ).toBeVisible();
    await expect(page.getByText("생활기록부 원문은 받지 않아요")).toBeVisible();

    // 사이드바 메뉴 2개
    const menu = page.getByRole("navigation", { name: "메뉴" });
    await expect(
      menu.getByRole("link", { name: "자기평가서 작성" }),
    ).toBeVisible();
    await expect(menu.getByRole("link", { name: "보관함" })).toBeVisible();

    // 진행단계 6개
    const steps = page.getByRole("region", { name: "진행단계" });
    for (const label of [
      "시작",
      "기본 입력",
      "활동 선택",
      "분석 확인",
      "생성 결과",
      "검증과 저장",
    ]) {
      await expect(steps.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(steps.getByRole("listitem")).toHaveCount(6);
  });

  test("열린 세션이 없으면 새 자기평가서 만들기 버튼이 보인다", async ({
    studentPage: page,
    request,
    token,
  }) => {
    await discardOpenSession(request, token);
    await page.goto("/app/selfeval");
    await expect(
      page.getByRole("button", { name: "새 자기평가서 만들기" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "이어서 작성하기" }),
    ).toHaveCount(0);
  });
});
