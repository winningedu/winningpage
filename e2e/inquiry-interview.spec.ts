import { expect, gotoInfo, test } from "./fixtures/inquiry";

// 기억으로 되살리기(7문항). 빈틈 후보는 규칙 함수라 모델을 부르지 않고 세션도 만들지 않는다.
const Q1 = "동네 하천의 수질을 직접 측정해 비교한 활동";
const INTERNET_GAP = "원 출처를 확인하지 않고 인용함";

test.describe("심화탐구 기억으로 되살리기", () => {
  test("빈틈을 하나 골라 저장하면 선택 자산 목록에 들어간다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);

    // 접힌 상태로 시작하고 펼치면 7문항이 나온다.
    const toggle = page.getByRole("button", { name: /기억으로 되살리기/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.getByLabel(/^1\. /).fill(Q1);
    const internet = page.getByRole("button", {
      name: "인터넷 검색",
      exact: true,
    });
    await internet.click();
    await expect(internet).toHaveAttribute("aria-pressed", "true");

    // 인터넷 검색을 고르면 빈틈 후보가 생기고, 하나도 안 골랐으면 저장은 막힌다.
    const gap = page.getByRole("checkbox", { name: new RegExp(INTERNET_GAP) });
    await expect(gap).toBeVisible();
    await expect(gap).not.toBeChecked();
    const save = page.getByRole("button", { name: "빈틈 저장" });
    await expect(save).toBeDisabled();

    await gap.check();
    await expect(save).toBeEnabled();
    await save.click();

    // 저장하면 패널이 접히고 첫 항목(출발 활동)으로 들어가며, 한 줄 주제와 달리 신뢰도 C 문장이 없다.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const assets = page.getByRole("region", { name: "고른 활동" });
    await expect(assets.getByText("출발 활동")).toBeVisible();
    await expect(assets.getByText(Q1)).toBeVisible();
    await expect(assets.getByText(/한 줄만으로 만든 주제/)).toHaveCount(0);
  });

  test("1번 답이 비어 있으면 빈틈을 골라도 저장이 안내로 막힌다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);
    await page.getByRole("button", { name: /기억으로 되살리기/ }).click();
    await page
      .getByRole("button", { name: "인터넷 검색", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: new RegExp(INTERNET_GAP) })
      .check();
    await page.getByRole("button", { name: "빈틈 저장" }).click();
    await expect(
      page.getByText("활동의 주제를 한 줄 적어 주세요."),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "고른 활동" })).toHaveCount(
      0,
    );
  });
});
