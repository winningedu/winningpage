import {
  addOneline,
  deleteActivityRecords,
  deleteActivityRecordsByTopicPrefix,
  expect,
  fillBasicInfo,
  gotoInfo,
  insertManualRecords,
  SAMPLE_INFO,
  SAMPLE_ONELINE,
  test,
} from "./fixtures/inquiry";
import { e2eText } from "./fixtures/marker";

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

  test("제출 영역은 교과가 기본이고 자율을 고르면 과목명 대신 활동명이 보인다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);
    const area = page.getByRole("group", { name: "제출 영역" });
    for (const label of ["교과", "자율", "동아리", "진로"]) {
      await expect(
        area.getByRole("radio", { name: label, exact: true }),
      ).toBeAttached();
    }
    await expect(
      area.getByRole("radio", { name: "교과", exact: true }),
    ).toBeChecked();
    await expect(page.getByLabel(/^과목명/)).toBeVisible();
    await expect(page.getByLabel(/^활동명/)).toHaveCount(0);

    await area.getByText("자율", { exact: true }).click();
    await expect(
      area.getByRole("radio", { name: "자율", exact: true }),
    ).toBeChecked();
    await expect(page.getByLabel(/^활동명/)).toBeVisible();
    await expect(page.getByLabel(/^과목명/)).toHaveCount(0);

    // 동아리로 바꿔도 활동명 입력이 그대로 보이고, 교과로 돌아오면 과목명이 다시 보인다.
    await area.getByText("동아리", { exact: true }).click();
    await expect(page.getByLabel(/^활동명/)).toBeVisible();
    await area.getByText("교과", { exact: true }).click();
    await expect(page.getByLabel(/^과목명/)).toBeVisible();
    await expect(page.getByLabel(/^활동명/)).toHaveCount(0);
  });

  test("교과가 아니면 활동명은 선택이라 진로만 비워도 과목명 오류가 나지 않는다", async ({
    studentPage: page,
  }) => {
    await gotoInfo(page);
    await fillBasicInfo(page, {
      ...SAMPLE_INFO,
      area: "club",
      activityName: "",
    });
    await page.getByLabel(/^희망 진로/).fill("");
    await page.getByRole("button", { name: "주제 3개 추천받기" }).click();
    await expect(page.getByText("희망 진로를 적어 주세요.")).toBeVisible();
    // 활동명을 비워 둬도 막히지 않고, 교과가 아니라 과목명 검증은 돌지 않는다.
    await expect(page.getByText("과목명을 적어 주세요.")).toHaveCount(0);
    await expect(page.getByText("활동명을 적어 주세요.")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/app/inquiry");
  });

  test("불러올 기록이 학년별 묶음으로 고3, 고2, 고1, 학년 미지정 순서로 보인다", async ({
    studentPage: page,
  }) => {
    const prefix = e2eText("학년 묶음");
    const seeds = [
      { gradeLabel: "고1", topic: `${prefix} 고1 기록` },
      { gradeLabel: "고3", topic: `${prefix} 고3 기록` },
      { gradeLabel: null, topic: `${prefix} 미지정 기록` },
    ] as const;
    const expectedHeadings = ["고3", "고1", "학년 미지정"];
    // 이전 실행이 중간에 끊겨 남긴 시드가 있으면 먼저 지운다.
    await deleteActivityRecordsByTopicPrefix(prefix);
    const ids = await insertManualRecords(seeds.map((seed) => ({ ...seed })));
    try {
      await gotoInfo(page);
      await expect(
        page.getByRole("button", { name: "전체", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");

      // 다른 테스트가 남긴 고2 기록이 있어도 통과하도록 순서는 부분 순서로 본다.
      const order = ["고3", "고2", "고1", "학년 미지정"];
      const headings = page.getByRole("heading", { level: 3 });
      await expect(
        headings.filter({ hasText: "학년 미지정" }).first(),
      ).toBeVisible();
      const shown = (await headings.allInnerTexts())
        .map((text) => text.trim())
        .filter((text) => order.includes(text));
      const positions = shown.map((text) => order.indexOf(text));
      expect(positions, `제목 순서: ${shown.join(", ")}`).toEqual(
        [...positions].sort((a, b) => a - b),
      );
      expect(new Set(shown).size, "같은 제목이 두 번 나오면 안 된다").toBe(
        shown.length,
      );
      for (const heading of expectedHeadings) expect(shown).toContain(heading);

      // 시드한 기록은 해당 학년 묶음 안에 있고, 각 묶음에는 체크박스가 있다.
      const groupOf = (heading: string) =>
        page
          .locator("section")
          // 바깥 카드 section 은 안쪽 section 을 품으므로 빼고 학년 묶음 하나만 남긴다.
          .filter({ hasNot: page.locator("section") })
          .filter({
            has: page.getByRole("heading", {
              level: 3,
              name: heading,
              exact: true,
            }),
          });
      const headingOf: Record<string, string> = {
        [seeds[0].topic]: "고1",
        [seeds[1].topic]: "고3",
        [seeds[2].topic]: "학년 미지정",
      };
      for (const [topic, heading] of Object.entries(headingOf)) {
        const group = groupOf(heading);
        await expect(group.getByText(topic)).toBeVisible();
        await expect(group.getByRole("checkbox").first()).toBeVisible();
      }
    } finally {
      await deleteActivityRecords(ids);
    }
  });

  test("활동 둘을 고르면 안내문이 보이고 위로 올리면 출발 활동이 바뀐다", async ({
    studentPage: page,
  }) => {
    const first = "여름철 반려견 산책 판단에 온습도지수를 적용한 활동";
    const second = "버스 배차 간격을 직접 기록해 분포를 확인한 활동";
    await gotoInfo(page);
    await addOneline(page, first);
    await addOneline(page, second);

    const assets = page.getByRole("region", { name: "고른 활동" });
    await expect(
      assets.getByText(
        /선택한 활동을 모두 반영해요\. 맨 위 활동이 중심이 되고/,
      ),
    ).toBeVisible();
    const items = assets.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText(first);
    await expect(items.nth(0)).toContainText("출발 활동");
    await expect(items.nth(1)).toContainText(second);
    await expect(items.nth(1)).not.toContainText("출발 활동");
    await expect(assets.getByText("출발 활동")).toHaveCount(1);

    // 두 번째를 위로 올리면 순서가 바뀌고 출발 활동 표시가 따라간다.
    await assets
      .getByRole("button", { name: `${second} 위로`, exact: true })
      .click();
    await expect(items.nth(0)).toContainText(second);
    await expect(items.nth(0)).toContainText("출발 활동");
    await expect(items.nth(1)).toContainText(first);
    await expect(items.nth(1)).not.toContainText("출발 활동");
    await expect(assets.getByText("출발 활동")).toHaveCount(1);
  });
});
