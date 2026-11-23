import { expect, test } from "@playwright/test";
import {
  ADMIN_ENV_MISSING_REASON,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  loginAsAdmin,
} from "./fixtures/admin";

test.describe("읽기 전용 대행", () => {
  test.skip(!E2E_ADMIN_EMAIL || !E2E_ADMIN_PASSWORD, ADMIN_ENV_MISSING_REASON);

  test("읽기 전용 대행 중 캠퍼스 정보 저장은 403 READ_ONLY_PROXY 로 막힌다", async ({
    page,
  }) => {
    let started = false;
    try {
      await loginAsAdmin(page);
      await page.goto("/admin/hqDashboard");

      // 기관 표 첫 행의 이름 버튼. 이름은 환경마다 달라 고정하지 않는다.
      await page
        .getByRole("button", { name: /읽기 전용으로 보기$/ })
        .first()
        .click();

      await expect(page).toHaveURL(/\/teacher\/proxy/);
      await expect(
        page.getByRole("radio", { name: "읽기 전용" }),
      ).toBeChecked();
      await page.getByRole("button", { name: "대행 시작" }).click();
      started = true;

      await expect(page.getByText("읽기 전용", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "캠퍼스 정보" }).click();
      await expect(page).toHaveURL(/\/teacher\/org-info/);

      const patch = page.waitForResponse(
        (res) =>
          res.url().includes("/api/console/org-info") &&
          res.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "저장", exact: true }).click();
      const res = await patch;

      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe("READ_ONLY_PROXY");
    } finally {
      if (started) {
        const end = page.waitForResponse((res) =>
          res.url().includes("/api/console/proxy/end"),
        );
        await page.getByRole("button", { name: "종료" }).click();
        expect((await end).status()).toBe(200);
      }
    }
  });
});
