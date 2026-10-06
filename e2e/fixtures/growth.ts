import { expect, type Page } from "@playwright/test";

// 성장설계 E2E 공용 헬퍼. 셀렉터는 role 과 접근 가능한 이름을 쓴다.

/** 시작 화면의 학생 정보 폼이 떠 있으면(프로필 없음) 값을 채워 저장한다. */
export async function ensureProfileSaved(page: Page) {
  const formHeading = page.getByRole("heading", { name: "학교 정보 입력" });
  const infoHeading = page.getByRole("heading", { name: "학생 정보" });
  await expect(formHeading.or(infoHeading)).toBeVisible();
  if (await formHeading.isVisible()) {
    await page.getByLabel("학교 유형").selectOption("일반고");
    await page.getByLabel("고등학교 입학 연도").fill("2025");
    await page.getByLabel("현재 학년").selectOption("고2");
    await page.getByLabel("학기", { exact: true }).selectOption("1");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(infoHeading).toBeVisible();
  }
}

/** 학생 조사 문항 1에 답을 쓰고 자동 저장 표시까지 기다린다. */
export async function answerFirstQuestion(page: Page, answer: string) {
  const q1 = page.getByRole("textbox", { name: /^1\. / });
  await expect(q1).toBeVisible();
  await q1.fill(answer);
  await expect(page.getByText(/^자동 저장됨/)).toBeVisible({ timeout: 15_000 });
}

/** 학생 조사에서 "활동 선택으로"를 눌러 넘어간다(미답 확인 다이얼로그는 수락). */
export async function goToCollectFromSurvey(page: Page) {
  await page.getByRole("button", { name: "활동 선택으로" }).click();
  const proceed = page.getByRole("button", { name: "넘어가기" });
  await proceed.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
  if (await proceed.isVisible()) await proceed.click();
  await page.waitForURL("**/app/growth/collect");
}
