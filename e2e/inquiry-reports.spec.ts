import { deleteOpenSessions, expect, test } from "./fixtures/inquiry";

// 보관함. 로컬 QA 학생에게 확정 세션 1건(생명과학I, 87.5점)이 시딩돼 있다는 전제다.
// 완주 스펙이 먼저 돌았으면 확정 행이 더 있을 수 있어 "1행 이상" 으로 확인한다.
const SEED_SUBJECT = "생명과학I";
const SEED_SCORE = "87.5";

test.describe("심화탐구 보관함", () => {
  test.beforeAll(() => {
    deleteOpenSessions();
  });

  test("확정 세션이 목록에 과목, 점수, 상태와 함께 보인다", async ({
    studentPage: page,
  }) => {
    await page.goto("/app/inquiry/reports");
    await expect(
      page.getByRole("heading", { name: "심화탐구 보관함" }),
    ).toBeVisible();
    const table = page.getByRole("table", { name: "심화탐구 보관함 목록" });
    const row = table
      .getByRole("row")
      .filter({ hasText: SEED_SUBJECT })
      .filter({ hasText: SEED_SCORE });
    await expect(row.first()).toBeVisible();
    await expect(row.first().getByRole("cell", { name: "확정" })).toBeVisible();
    await expect(row.first().getByRole("link", { name: "열기" })).toBeVisible();
  });

  test("과목 필터로 행을 좁힌다", async ({ studentPage: page }) => {
    await page.goto("/app/inquiry/reports");
    const table = page.getByRole("table", { name: "심화탐구 보관함 목록" });
    await expect(table).toBeVisible();

    await page.getByLabel("과목").selectOption(SEED_SUBJECT);
    const rows = table.getByRole("row");
    // 머리 행 하나를 빼고 남은 행이 모두 그 과목이다.
    const bodyRows = rows.filter({ has: page.getByRole("cell") });
    await expect(bodyRows.first()).toContainText(SEED_SUBJECT);
    for (const text of await bodyRows.allInnerTexts()) {
      expect(text).toContain(SEED_SUBJECT);
    }

    // 열린 세션을 비워 둔 상태라 "작성 중" 필터는 빈 안내를 보인다.
    await page.getByLabel("상태").selectOption("open");
    await expect(page.getByText("조건에 맞는 심화탐구가 없어요")).toBeVisible();
  });

  test("열기로 상세에 들어가면 설계, 평가 리포트와 확정 적립 내용 표가 보인다", async ({
    studentPage: page,
  }) => {
    await page.goto("/app/inquiry/reports");
    const table = page.getByRole("table", { name: "심화탐구 보관함 목록" });
    await table
      .getByRole("row")
      .filter({ hasText: SEED_SCORE })
      .first()
      .getByRole("link", { name: "열기" })
      .click();
    await page.waitForURL(/\/app\/inquiry\/reports\/[0-9a-f-]{36}$/);

    await expect(
      page.getByRole("heading", { name: "설계 리포트" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "평가 리포트" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "확정 적립 내용" }),
    ).toBeVisible();

    const fields = page.getByRole("table", { name: "확정 적립 내용" });
    for (const label of [
      "주제",
      "개념",
      "방법",
      "결과",
      "한계",
      "수치",
      "출처",
    ]) {
      await expect(
        fields.getByRole("rowheader", { name: label, exact: true }),
      ).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "보관함으로" })).toBeVisible();
  });
});
