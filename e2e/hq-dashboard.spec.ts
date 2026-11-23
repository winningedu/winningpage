import { expect, test } from "@playwright/test";
import {
  ADMIN_ENV_MISSING_REASON,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  loginAsAdmin,
} from "./fixtures/admin";

test.describe("본사 대시보드", () => {
  test.skip(!E2E_ADMIN_EMAIL || !E2E_ADMIN_PASSWORD, ADMIN_ENV_MISSING_REASON);

  test("사이드바 통계 그룹에서 대시보드를 열고 포함 스위치가 주소에 반영된다", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");

    await page.getByRole("button", { name: "통계", exact: true }).click();
    await expect(page.getByRole("link", { name: "방문 분석" })).toBeVisible();
    await page.getByRole("link", { name: "대시보드" }).click();

    await expect(page).toHaveURL(/\/admin\/hqDashboard/);
    await expect(
      page.getByRole("heading", { name: "대시보드", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("table").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "로그인 이용" }),
    ).toBeVisible();

    // 체크 상태가 주소에서 오는 제어 입력이라 check() 의 즉시 검증 대신 click 후 주소로 확인한다.
    const includeInternal = page.getByLabel("QA, 관리자 계정 포함");
    await includeInternal.click();
    await expect(page).toHaveURL(/includeInternal=1/);
    await expect(includeInternal).toBeChecked();
  });
});
