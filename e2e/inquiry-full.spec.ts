import {
  addOneline,
  archiveOpenSessions,
  countCompletedSessions,
  countDeepDeposits,
  deleteOpenSessions,
  deletePlanItemsByTitle,
  expect,
  fillBasicInfo,
  gotoInfo,
  INQUIRY_FULL,
  insertPendingPlanItem,
  latestCompletedGrowthReportId,
  openSessionId,
  type Page,
  readDeepRecordBySession,
  readPlanItemByTitle,
  SAMPLE_INFO,
  SAMPLE_ONELINE,
  submitTargetText,
  test,
  waitWithRetry,
} from "./fixtures/inquiry";
import { e2eText } from "./fixtures/marker";

// 모델을 부르는 완주 스펙. E2E_INQUIRY_FULL=1 일 때만 돈다(호출당 비용과 시간이 든다).
// 검증 실패 재요청(No.143 6)은 단위 테스트가 덮으므로 E2E 에서 뺀다.
// 같은 계정이라 --workers=1 로 돌리고, 스펙끼리 serial 로 이어진다.
const PLAN_TITLE = "온습도지수 비판 탐구";
const MODEL_WAIT = 5 * 60_000;

// 샘플 8절 본문(Ⅰ~Ⅶ 합계 300자 이상, Ⅷ 은 2줄).
const SECTIONS: Record<string, string> = {
  I: "앞선 활동에서 여름철 산책 판단 기준으로 온습도지수(THI)를 그대로 가져다 썼다. 당시에는 그 지수가 원래 어떤 동물을 위해 만들어졌는지까지 다루지 못했다. 반려견의 체온 조절은 사람과 달라 같은 수치가 같은 위험을 뜻하지 않을 수 있어 이번에는 기준 자체를 다시 검토하려 한다. 수의예과를 희망하는 입장에서 지표가 무엇을 측정하지 못하는지 아는 일이 진료 판단의 출발점이라고 생각했다.",
  II: "기존 온습도지수 기준은 반려견 산책의 안전성을 판단하는 데 충분히 적절한가? 가설 1: 온습도지수가 높을수록 산책 후 반려견의 헐떡임 지속 시간이 길어질 것이다. 가설 2: 가설 1이 지지되지 않는다면 헐떡임을 가르는 것은 지수가 아니라 노면 온도일 것이다.",
  III: "자료는 기상청 기상자료개방포털의 시간별 기온과 습도, 동네 산책로 노면 온도 직접 측정값(적외선 온도계), 반려견 3마리의 산책 후 헐떡임 지속 시간 기록을 썼다. 온습도지수는 공식에 따라 계산했고, 측정 단위는 섭씨와 초로 통일했다. 분석은 스프레드시트로 지수 구간별 평균 지속 시간을 비교하고 상관계수를 구했다.",
  IV: "총 24회 산책에서 지수 72 미만 구간의 평균 헐떡임 지속 시간은 95초, 72 이상 78 미만은 140초, 78 이상은 210초였다. 지수와 지속 시간의 상관계수는 0.61이었다. 노면 온도와 지속 시간의 상관계수는 0.74였다. 같은 지수에서도 아스팔트 구간은 흙길 구간보다 평균 40초 길었다.",
  V: "가설 1은 지지되었다. 지수가 높을수록 지속 시간이 길었다. 다만 노면 온도의 상관이 더 높아 지수만으로 판단하면 아스팔트 산책의 위험을 놓칠 수 있다. 한 문장으로 정리하면 온습도지수는 참고가 되지만 반려견에게는 노면 온도를 함께 봐야 한다. 처음 질문으로 돌아가면 기존 기준은 충분하지 않고 보완이 필요하다. 수의사의 진료에서도 지표 하나로 판단하지 않고 환경 변수를 함께 묻는 직무의 성격과 닿아 있다.",
  VI: "표본이 반려견 3마리와 24회로 적어 대표성이 낮다. 상관이 있다는 것까지만 말할 수 있고 노면 온도가 원인이라고 단정할 수 없다. 노면 온도 측정 위치가 매번 같지 않아 자료 신뢰도에 한계가 있다.",
  VII: "남은 질문은 품종과 체중에 따라 같은 지수에서 반응이 어떻게 달라지는가다. 다음에는 측정 위치를 고정하고 품종별로 나눠 기록할 것이다. 생명과학 수행평가에서 체온 조절 단원과 이어 확인하려 한다.",
  VIII: "기상청 기상자료개방포털 시간별 기온 습도 자료, 2026년 7월 기준\n농촌진흥청 가축사육기상정보시스템 온습도지수 산출식 안내, 2025년 기준",
};

type FlowHooks = {
  /** 추천 화면에 들어온 직후. 세션이 만들어진 뒤라 id 를 잡아 두는 데 쓴다(확정하면 열린 세션이 사라진다). */
  onTopics?: () => Promise<void>;
  /** 작성 화면에 들어온 직후, 8절을 채우기 전. */
  onWrite?: () => Promise<void>;
};

/**
 * 작성 화면의 설계 리포트 서랍 폭. 80rem(1280px) 이상은 오른쪽 고정 패널 28rem(448px),
 * 그 미만은 Sheet 48rem(768px). 끝나면 viewport 를 원래대로 돌린다.
 */
async function expectDesignDrawerWidths(page: Page) {
  const original = page.viewportSize();
  const cases = [
    { width: 1280, height: 900, expected: 448 },
    { width: 1920, height: 1080, expected: 448 },
    { width: 1024, height: 900, expected: 768 },
  ];
  // 상단과 하단에 같은 이름의 버튼이 있어 첫 번째(상단)를 쓴다.
  const trigger = page
    .getByRole("button", { name: "설계 리포트 보기" })
    .first();
  const panel = page.getByRole("dialog", { name: "설계 리포트" });
  try {
    for (const { width, height, expected } of cases) {
      await page.setViewportSize({ width, height });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.click();
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      expect(box, `${width}px 에서 패널 위치`).not.toBeNull();
      expect(
        Math.abs((box?.width ?? 0) - expected),
        `${width}px 패널 폭 ${box?.width}`,
      ).toBeLessThanOrEqual(2);
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}

/** 정보 입력이 끝난 화면에서 추천받기부터 확정 저장 결과 카드까지 간다. */
async function recommendToFinalize(page: Page, hooks: FlowHooks = {}) {
  await page.getByRole("button", { name: "주제 3개 추천받기" }).click();
  await page.waitForURL("**/app/inquiry/topics");
  await hooks.onTopics?.();

  // 추천 결과, 첫 카드를 확정한다.
  const firstConfirm = page
    .getByRole("button", { name: "이 주제로 확정" })
    .first();
  await waitWithRetry(page, firstConfirm, MODEL_WAIT);
  await firstConfirm.click();
  await expect(page.getByRole("button", { name: "선택됨" })).toBeVisible();
  await page
    .getByRole("button", { name: "선택한 주제로 설계 리포트 만들기" })
    .click();

  // 설계 화면: 8절 카드.
  const toWrite = page.getByRole("link", { name: "작성 화면으로" });
  await waitWithRetry(page, toWrite, MODEL_WAIT);
  expect(new URL(page.url()).pathname).toBe("/app/inquiry/design");
  await expect(page.getByRole("article")).toHaveCount(8);
  await toWrite.click();

  // 작성 화면: 8절을 채우고 제출한다.
  await page.waitForURL("**/app/inquiry/write");
  await hooks.onWrite?.();
  for (const [id, text] of Object.entries(SECTIONS)) {
    await page.locator(`#inquiry-section-${id}`).fill(text);
  }
  await page.getByRole("button", { name: "제출하고 평가받기" }).click();

  // 평가 화면: 총점.
  const total = page.getByRole("region", { name: "총점" });
  await waitWithRetry(page, total, MODEL_WAIT);
  expect(new URL(page.url()).pathname).toBe("/app/inquiry/evaluate");
  await expect(total).toContainText("/ 100");
  await page.getByRole("link", { name: "확정하고 저장하기" }).click();

  // 확정 화면: 7항목 폼. 비어 있는 필수 항목(주제, 개념, 방법, 결과, 한계)은 채운다.
  await page.waitForURL("**/app/inquiry/finalize");
  await expect(
    page.getByRole("heading", { name: "추출 내용 확인과 수정" }),
  ).toBeVisible();
  for (const label of [
    "주제",
    "사용 개념",
    "방법",
    "결과",
    "한계",
    "수치",
    "자료명",
  ]) {
    await expect(
      page.getByRole("textbox", { name: label, exact: true }),
    ).toBeVisible();
  }
  for (const label of ["주제", "사용 개념", "방법", "결과", "한계"]) {
    const field = page.getByRole("textbox", { name: label, exact: true });
    if ((await field.inputValue()).trim() === "") {
      await field.fill("직접 보완한 내용");
    }
  }
  await page.getByRole("button", { name: "확정하고 활동 기록에 저장" }).click();
  const result = page.getByRole("region", { name: "저장 결과" });
  await expect(
    result.getByRole("heading", { name: "저장을 마쳤어요" }),
  ).toBeVisible({
    timeout: 30_000,
  });
  return result;
}

test.describe("심화탐구 모델 완주", () => {
  test.skip(!INQUIRY_FULL, "E2E_INQUIRY_FULL=1 일 때만 실행");
  test.describe.configure({ mode: "serial" });
  // 모델 대기 3번(추천, 설계, 평가)이 각각 MODEL_WAIT 까지 걸릴 수 있다(dev 프리뷰는 로컬보다 느리다). 화면 조작 여유 3분을 더한다.
  test.setTimeout(3 * MODEL_WAIT + 3 * 60_000);

  test.beforeAll(async () => {
    await deleteOpenSessions();
    await deletePlanItemsByTitle(PLAN_TITLE);
  });
  test.afterAll(async () => {
    await deleteOpenSessions();
  });

  test("단독 완주: 한 줄 자산에서 확정 저장까지", async ({
    studentPage: page,
  }) => {
    const completedBefore = await countCompletedSessions();
    const depositsBefore = await countDeepDeposits();

    await gotoInfo(page);
    await fillBasicInfo(page, SAMPLE_INFO);
    await addOneline(page, SAMPLE_ONELINE);
    const result = await recommendToFinalize(page, {
      onWrite: () => expectDesignDrawerWidths(page),
    });
    // 과제를 고르지 않았으므로 성장설계 회신 문구는 없다.
    await expect(
      result.getByText("성장설계 실행계획 과제를 완료로 알렸어요"),
    ).toHaveCount(0);

    expect(await countCompletedSessions()).toBe(completedBefore + 1);
    expect(await countDeepDeposits()).toBe(depositsBefore + 1);

    // 보관함에 확정 행이 하나 늘었다.
    await result.getByRole("link", { name: "보관함으로" }).click();
    const rows = page
      .getByRole("table", { name: "심화탐구 보관함 목록" })
      .getByRole("row")
      .filter({ hasText: "확정" });
    await expect(rows).toHaveCount(completedBefore + 1);
  });

  test("동아리활동 완주: 활동명을 적어 확정하면 활동 기록 구분과 보관함 과목 칸이 영역을 따른다", async ({
    studentPage: page,
  }) => {
    await deleteOpenSessions();
    const activityName = e2eText("천문 동아리 별자리 관측");
    let sessionId = "";

    await gotoInfo(page);
    await fillBasicInfo(page, {
      ...SAMPLE_INFO,
      area: "club",
      activityName,
    });
    await addOneline(page, SAMPLE_ONELINE);
    const result = await recommendToFinalize(page, {
      onTopics: async () => {
        const id = await openSessionId();
        if (!id) throw new Error("추천 화면에서 열린 세션이 있어야 한다");
        sessionId = id;
      },
    });

    // fn_inquiry_finalize: 동아리는 구분이 '동아리', subject 는 활동명.
    const record = await readDeepRecordBySession(sessionId);
    expect(record).toEqual({ subject_group: "동아리", subject: activityName });

    // 보관함 과목 칸은 "라벨 / 활동명" 으로 보인다.
    const cellText = submitTargetText({
      area: "club",
      subject: null,
      activityName,
    });
    expect(cellText).toBe(`동아리 / ${activityName}`);
    await result.getByRole("link", { name: "보관함으로" }).click();
    const row = page
      .getByRole("table", { name: "심화탐구 보관함 목록" })
      .getByRole("row")
      .filter({ hasText: cellText });
    await expect(row.first()).toBeVisible();
    await expect(row.first().getByRole("cell", { name: "확정" })).toBeVisible();
  });

  test("콜드 스타트: 활동 0건이면 관심 기반 예비 주제와 확인 질문 3개가 나온다", async ({
    studentPage: page,
  }) => {
    await deleteOpenSessions();
    await gotoInfo(page);
    await fillBasicInfo(page, SAMPLE_INFO);
    await page.getByRole("button", { name: "주제 3개 추천받기" }).click();
    await page
      .getByRole("dialog", { name: "고른 활동이 없어요" })
      .getByRole("button", { name: "예비 주제로 추천받기" })
      .click();
    await page.waitForURL("**/app/inquiry/topics");

    const notice = page.getByRole("region", { name: "예비 주제 안내" });
    await waitWithRetry(page, notice, MODEL_WAIT);
    await expect(notice).toContainText("관심 기반 예비 주제");
    await expect(notice.getByRole("listitem")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "이 주제로 확정" }).first(),
    ).toBeVisible();

    // 다음 스펙에 영향이 없게 이 세션을 보관 처리한다.
    await archiveOpenSessions();
  });

  test("연동 완주: 성장설계 실행계획 과제를 골라 끝내면 과제가 완료로 알려진다", async ({
    studentPage: page,
  }) => {
    await deleteOpenSessions();
    const reportId = await latestCompletedGrowthReportId();
    expect(reportId, "완료된 성장설계 회차가 있어야 한다").not.toBe("");
    await insertPendingPlanItem(reportId, PLAN_TITLE);

    await gotoInfo(page);
    const group = page.getByRole("radiogroup", { name: "이번에 이어갈 과제" });
    await expect(group).toBeVisible();
    await group.getByRole("radio", { name: PLAN_TITLE }).check();
    await expect(group.getByRole("radio", { name: PLAN_TITLE })).toBeChecked();

    await fillBasicInfo(page, SAMPLE_INFO);
    await addOneline(page, SAMPLE_ONELINE);
    const result = await recommendToFinalize(page);
    await expect(
      result.getByText("성장설계 실행계획 과제를 완료로 알렸어요"),
    ).toBeVisible();

    const item = await readPlanItemByTitle(PLAN_TITLE);
    expect(item).toEqual({ status: "done", done_source_program: "deep" });
  });
});
