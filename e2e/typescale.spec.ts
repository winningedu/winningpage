// 인앱 타입 스케일 토큰 전환(Group 2/4, [[app-shell-shadcn-unification]]) 스모크.
// 화면 핵심 제목의 실제 computed font-size/line-height 가 src/index.css 의 인앱
// 타입 토큰과 같은지 검사한다(루트 16px 기준 px 비교). 픽셀 비교는 baseline PNG를
// 저장소에 두지 않기로 해서 쓰지 않는다. 요소는 DB 내용이 아니라 heading role/level
// 같은 구조로 잡는다.
//
// 목표관리(goal) 인앱 화면은 아직 커버하지 않는다. 로컬 DB에 목표관리 학생 시드
// 행이 없어 로그인해도 온보딩으로 튕기거나 빈 상태만 보인다. 로컬 목표관리 시드가
// 생기면 이 파일에 `/app/goal/*` 스펙을 추가할 것.
//
// 수행평가 인앱 화면(/app/performance, /app/performance/reports)은 RequireEntitlement
// 가드를 통과해야 한다. QA 학생 계정에 suhaeng 이용권(program_access_grants)이
// 없으면 /pricing으로 리다이렉트되고 셸 제목이 없어 실패한다.
// ([[local-e2e-api-stack-setup]] 참고, QA 학생은 program_access_grants 행 필요)
//
// 서버는 이 config가 띄우지 않는다. 5303에 미리 떠 있는 로컬 dev 서버나
// `E2E_BASE_URL`을 대상으로 돈다(playwright.config.ts 상단 주석 참고).
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures/auth";

// font-size는 `text-app-*` 토큰 값(px), line-height는 토큰의 배수(1.4 등)로 받아 px로 비교한다.
async function expectTypeScale(
  locator: Locator,
  fontSizePx: number,
  lineHeightRatio: number,
) {
  await expect(locator).toBeVisible();
  const { fontSize, lineHeight } = await locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });
  expect(fontSize).toBeCloseTo(fontSizePx, 1);
  expect(lineHeight).toBeCloseTo(fontSizePx * lineHeightRatio, 1);
}

test.describe("서비스 랜딩 타입 스케일", () => {
  // 두 랜딩은 인앱 토큰이 아니라 히어로 h1에 같은 리터럴 규칙을 쓴다
  // (`md:text-[2rem] leading-[1.3]`, 뷰포트 1440px에서 md 적용). 규칙이 바뀌면 이 값도 함께 바꾼다.
  test("목표관리 랜딩 (/services/goal)", async ({ page }) => {
    await page.goto("/services/goal");
    await expectTypeScale(page.getByRole("heading", { level: 1 }), 32, 1.3);
  });

  test("수행평가 랜딩 (/services/performance)", async ({ page }) => {
    await page.goto("/services/performance");
    await expectTypeScale(page.getByRole("heading", { level: 1 }), 32, 1.3);
  });
});

test.describe("수행평가 인앱 셸 타입 스케일", () => {
  // 내장 `storageState` 픽스처를 우리 `authStorageStatePath`(워커 스코프, 최초 1회
  // 로그인)에 위임한다. 테스트마다 다시 로그인하지 않는다.
  test.use({
    storageState: async ({ authStorageStatePath }, use) => {
      await use(authStorageStatePath);
    },
  });

  // 셸 페이지 타이틀 h1은 `text-app-title`(28px / 1.4). 채팅 타임라인이 길어져
  // 접히면 `text-app-section`으로 내려가므로 빈/짧은 대화 상태를 전제한다.
  // h1은 SidebarInset(main) 안에 있다.
  test("채팅 셸 (/app/performance)", async ({ page }) => {
    await page.goto("/app/performance");
    await expectTypeScale(
      page.getByRole("main").getByRole("heading", { level: 1 }),
      28,
      1.4,
    );
  });

  test("저장 리포트 (/app/performance/reports)", async ({ page }) => {
    await page.goto("/app/performance/reports");
    await expectTypeScale(
      page.getByRole("main").getByRole("heading", { level: 1 }),
      28,
      1.4,
    );
  });
});
