import { deleteOpenSessions, expect, gotoInfo, test } from "./fixtures/inquiry";

// 열린 세션이 없을 때 단계 화면 직접 진입은 본문 대신 미생성 단계 카드를 보인다(No.113, 114).
const GUARDED = [
  {
    path: "/app/inquiry/design",
    title: "아직 시작한 세션이 없어요",
    back: "정보 입력으로 돌아가기",
  },
  {
    path: "/app/inquiry/write",
    title: "아직 시작한 세션이 없어요",
    back: "정보 입력으로 돌아가기",
  },
  {
    path: "/app/inquiry/evaluate",
    title: "아직 시작한 세션이 없어요",
    back: "정보 입력으로 돌아가기",
  },
  {
    path: "/app/inquiry/finalize",
    title: "아직 시작한 세션이 없어요",
    back: "정보 입력으로 돌아가기",
  },
] as const;

test.describe("심화탐구 단계 가드", () => {
  test.beforeAll(async () => {
    await deleteOpenSessions();
  });

  for (const { path, title, back } of GUARDED) {
    test(`세션 없이 ${path} 에 가면 미생성 단계 카드와 돌아갈 버튼이 보인다`, async ({
      studentPage: page,
    }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      const backLink = page.getByRole("link", { name: back });
      await expect(backLink).toBeVisible();
      await backLink.click();
      await expect(
        page.getByRole("heading", { name: "무엇을 이어서 파고들까요" }),
      ).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/app/inquiry");
    });
  }

  test("주제 추천 화면도 세션이 없으면 정보 입력으로 돌려보낸다", async ({
    studentPage: page,
  }) => {
    await page.goto("/app/inquiry/topics");
    await expect(
      page.getByRole("heading", { name: "아직 세션이 없어요" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "정보 입력으로" }),
    ).toBeVisible();
  });

  test("사이드바에 진행단계 6개와 메뉴 2개(심화탐구, 보관함)가 있다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);
    const sidebar = page.getByRole("complementary", {
      name: "심화탐구 사이드바",
    });
    const menu = sidebar.getByRole("navigation");
    await expect(menu.getByRole("link", { name: "심화탐구" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "보관함" })).toBeVisible();

    const steps = sidebar
      .getByRole("region", { name: "진행단계" })
      .getByRole("listitem");
    await expect(steps).toHaveCount(6);
    for (const [i, name] of [
      "정보 입력",
      "주제 추천",
      "설계 리포트",
      "보고서 작성",
      "평가 리포트",
      "확정과 적립",
    ].entries()) {
      await expect(steps.nth(i)).toContainText(name);
    }
  });
});
