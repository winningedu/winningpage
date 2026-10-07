import {
  addOneline,
  deleteOpenSessions,
  expect,
  fillBasicInfo,
  gotoInfo,
  INQUIRY_FULL,
  readOpenSessionAssets,
  readOpenSessionBasics,
  SAMPLE_INFO,
  SAMPLE_ONELINE,
  test,
} from "./fixtures/inquiry";

// 세션 생성과 재진입. 기본 실행은 주제 추천 API 를 막아 모델을 부르지 않고 세션 생성, 자산 저장,
// 주제 추천 화면 전환까지만 확인한다. E2E_INQUIRY_FULL=1 이면 추천 결과까지 기다린다.
const Q1 = "동네 하천의 수질을 직접 측정해 비교한 활동";
const GAP = "원 출처를 확인하지 않고 인용함";

test.describe("심화탐구 세션 생성과 재진입", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(INQUIRY_FULL ? 5 * 60_000 : 60_000);

  test.beforeAll(async () => {
    await deleteOpenSessions();
  });
  test.afterAll(async () => {
    // 다음 스펙이 열린 세션 없는 상태에서 시작하도록 되돌린다.
    await deleteOpenSessions();
  });

  test("한 줄과 기억 자산으로 추천을 누르면 세션이 만들어지고 주제 추천 화면으로 간다", async ({
    studentPage: page,
  }) => {
    if (!INQUIRY_FULL) {
      await page.route("**/api/inquiry/recommend-topics", (route) =>
        route.abort(),
      );
    }

    await gotoInfo(page);
    await fillBasicInfo(page, SAMPLE_INFO);

    await page.getByRole("button", { name: /기억으로 되살리기/ }).click();
    await page.getByLabel(/^1\. /).fill(Q1);
    await page
      .getByRole("button", { name: "인터넷 검색", exact: true })
      .click();
    await page.getByRole("checkbox", { name: new RegExp(GAP) }).check();
    await page.getByRole("button", { name: "빈틈 저장" }).click();
    await addOneline(page, SAMPLE_ONELINE);

    await page.getByRole("button", { name: "주제 3개 추천받기" }).click();
    await page.waitForURL("**/app/inquiry/topics");
    await expect(
      page.getByRole("heading", { name: "이어서 할 수 있는 세 가지" }),
    ).toBeVisible();

    if (INQUIRY_FULL) {
      await expect(
        page.getByRole("button", { name: "이 주제로 확정" }).first(),
      ).toBeVisible({ timeout: 4 * 60_000 });
    }

    // 세션 행에 폼 값이 복사되고 자산이 신뢰도와 함께 저장된다.
    expect(await readOpenSessionBasics()).toEqual({
      grade_label: "고2",
      semester: 2,
      career: "수의예과",
      subject: "생명과학I",
    });
    expect(await readOpenSessionAssets()).toEqual([
      { kind: "interview", reliability: "B" },
      { kind: "oneline", reliability: "C" },
    ]);
  });

  test("열린 세션이 있는 채로 /app/inquiry 에 다시 오면 저장된 정보와 자산이 복원된다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);

    await expect(page.getByRole("radio", { name: "고2" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "2학기" })).toBeChecked();
    await expect(page.getByLabel(/^희망 진로/)).toHaveValue("수의예과");
    await expect(page.getByLabel(/^과목명/)).toHaveValue("생명과학I");

    const assets = page.getByRole("region", { name: "고른 활동" });
    await expect(assets.getByText(Q1)).toBeVisible();
    await expect(assets.getByText(SAMPLE_ONELINE)).toBeVisible();
    // 순서가 보존돼 기억 자산이 출발 활동이다.
    await expect(assets.getByRole("listitem").first()).toContainText(
      "출발 활동",
    );
    await expect(assets.getByRole("listitem").first()).toContainText(Q1);

    // 보관함에는 작성 중 행이 이어서 하기로 보인다.
    await page.goto("/app/inquiry/reports");
    const open = page
      .getByRole("table", { name: "심화탐구 보관함 목록" })
      .getByRole("row")
      .filter({ hasText: "작성 중" });
    await expect(open.getByRole("link", { name: "이어서 하기" })).toBeVisible();
  });
});
