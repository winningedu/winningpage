import {
  addOneline,
  expect,
  fillBasicInfo,
  gotoInfo,
  SAMPLE_INFO,
  SAMPLE_ONELINE,
  test,
} from "./fixtures/inquiry";

// 정보 입력 화면. 세션을 만들지 않는 범위만 다룬다(추천 버튼은 필수값 누락과 확인 창에서 멈춘다).
test.describe("심화탐구 정보 입력", () => {
  test("제목과 기본 정보 카드가 보인다", async ({ studentPage: page }) => {
    await gotoInfo(page);
    await expect(
      page.getByRole("heading", { name: "기본 정보" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "그동안 한 활동" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "주제 3개 추천받기" }),
    ).toBeVisible();
  });

  test("기본 정보를 입력하고 주제 한 줄을 추가하면 선택 자산 목록에 보인다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);
    await fillBasicInfo(page, SAMPLE_INFO);
    await expect(page.getByLabel(/^희망 진로/)).toHaveValue(SAMPLE_INFO.career);
    await expect(page.getByLabel(/^과목명/)).toHaveValue(SAMPLE_INFO.subject);

    await addOneline(page, SAMPLE_ONELINE);
    const assets = page.getByRole("region", { name: "고른 활동" });
    await expect(assets.getByText("출발 활동")).toBeVisible();
    await expect(
      assets.getByRole("button", { name: `${SAMPLE_ONELINE} 제거` }),
    ).toBeVisible();

    await assets
      .getByRole("button", { name: `${SAMPLE_ONELINE} 제거` })
      .click();
    await expect(assets).toHaveCount(0);
  });

  test("위닝 기록에서 과목 버튼과 기록 목록이 보인다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);
    const all = page.getByRole("button", { name: "전체", exact: true });
    await expect(all).toHaveAttribute("aria-pressed", "true");

    // 전체 버튼 말고 과목 버튼이 하나 이상 있고, 누르면 그 과목이 눌린 상태가 된다.
    const subjectButtons = page
      .getByRole("button", { pressed: false })
      .filter({ hasText: /\s\d+$/ });
    await expect(subjectButtons.first()).toBeVisible();
    // 누른 뒤에는 pressed 필터에서 빠지므로 이름으로 고정한다.
    const label = (await subjectButtons.first().innerText()).trim();
    const first = page.getByRole("button", { name: label, exact: true });
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(all).toHaveAttribute("aria-pressed", "false");

    // 과목을 고르면 그 과목 기록 체크박스가 나오고 체크하면 고른 활동에 들어간다.
    const checkbox = page.getByRole("checkbox").first();
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await expect(page.getByRole("region", { name: "고른 활동" })).toBeVisible();
    await checkbox.uncheck();
    await expect(page.getByRole("region", { name: "고른 활동" })).toHaveCount(
      0,
    );
  });

  test("진로와 과목명을 비우고 추천을 누르면 안내 문구가 뜬다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);
    await page.getByLabel(/^희망 진로/).fill("");
    await page.getByLabel(/^과목명/).fill("");
    await page.getByRole("button", { name: "주제 3개 추천받기" }).click();
    await expect(page.getByText("희망 진로를 적어 주세요.")).toBeVisible();
    await expect(page.getByText("과목명을 적어 주세요.")).toBeVisible();
    // 필수값 누락에서는 확인 창도 세션 생성도 없다.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/app/inquiry");
  });

  test("활동이 0건이면 확인 창이 뜨고 활동 고르러 가기로 닫는다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);
    await fillBasicInfo(page, SAMPLE_INFO);
    await page.getByRole("button", { name: "주제 3개 추천받기" }).click();

    const dialog = page.getByRole("dialog", { name: "고른 활동이 없어요" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/관심을 바탕으로 한 예비 주제/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "예비 주제로 추천받기" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "활동 고르러 가기" }).click();
    await expect(dialog).toBeHidden();
    expect(new URL(page.url()).pathname).toBe("/app/inquiry");
  });
});
