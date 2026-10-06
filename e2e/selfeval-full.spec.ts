import {
  api,
  confirmAllFeelings,
  countCompleted,
  deletePlanItem,
  discardOpenSession,
  ensureSelfevalQuota,
  expect,
  insertPendingPlanItem,
  openNewSession,
  PLAN_ITEM_TITLE,
  QA_STUDENT_PROFILE_ID,
  readQuotaRemaining,
  saveFinal,
  serviceRoleClient,
  submitBasics,
  submitManualActivity,
  test,
  verifyUntilSubmittable,
  waitAnalysisReady,
  waitGenerated,
} from "./fixtures/selfeval";

// 모델을 부르는 완주 경로. E2E_SELFEVAL_FULL=1 일 때만 돈다(수 분, 이용 횟수 소모).
// 전제: 로컬 스택, 완료된 성장설계 리포트 1건(연동 스펙), 학생 QA 계정.
test.describe("자기평가서 모델 포함 완주", () => {
  test.skip(!process.env.E2E_SELFEVAL_FULL, "E2E_SELFEVAL_FULL=1 일 때만 실행");
  test.setTimeout(600_000);

  test("A 단독 완주와 C 직접 고치기 복구", async ({
    studentPage: page,
    request,
    token,
  }) => {
    await ensureSelfevalQuota(request, token, 2);
    await discardOpenSession(request, token);
    const quotaBefore = await readQuotaRemaining(request, token);
    const completedBefore = await countCompleted(request, token);
    expect(quotaBefore).not.toBeNull();

    await openNewSession(page);
    await submitBasics(page, { growth: false });
    await submitManualActivity(page, "버스 배차 간격 탐구");

    // 직접 입력 활동은 모델 없이 분석이 채워진다. 작성하기부터 모델 호출이다.
    await waitAnalysisReady(page);

    // 알려진 앱 결함 우회: 직접 입력 활동은 분석이 이미 채워져 있어 분석 확인 화면이 분석 실행을
    // 부르지 않고, 세션 단계가 2 에 머물러 작성하기가 STEP_ORDER 로 막힌다. 결함이 고쳐지면 이
    // 분기는 타지 않는다.
    const sessionId = page.url().match(/\/s\/([^/]+)\/analysis/)?.[1] ?? "";
    const detail = await api(
      request,
      token,
      "GET",
      `/reports?sessionId=${sessionId}`,
    );
    if (detail.json.session.currentStep < 3) {
      test.info().annotations.push({
        type: "app-defect",
        description:
          "직접 입력 활동의 분석 확인 화면이 analyze run 을 부르지 않아 currentStep 이 2 에 머문다",
      });
      const ran = await api(request, token, "POST", "/analyze", {
        sessionId,
        action: "run",
      });
      expect(ran.status).toBe(200);
    }

    await page.getByRole("button", { name: "이 내용으로 작성하기" }).click();
    await page.waitForURL(/\/result/);
    await waitGenerated(page);
    await confirmAllFeelings(page);
    await expect(page.getByText("확인이 필요한 표현이 없습니다")).toBeVisible();

    // C: 첫 문단의 첫 문장을 바꿔 저장하고 새로고침 뒤에도 남는지 본다.
    const marker = "배차 간격 표본을 직접 다시 확인해 정리했다.";
    await page.getByRole("button", { name: "직접 고치기" }).click();
    const first = page.getByRole("textbox", { name: "1문단" });
    const original = await first.inputValue();
    const rest = original.replace(/^[^.]*\.\s*/, "");
    await first.fill(`${marker} ${rest}`);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText(marker)).toBeVisible();
    await confirmAllFeelings(page);

    await page.reload();
    await expect(page.getByText(marker)).toBeVisible();
    await expect(page.getByRole("button", { name: "검증하기" })).toBeVisible();

    // 검증과 저장
    await page.getByRole("button", { name: "검증하기" }).click();
    await page.waitForURL(/\/verify$/);
    await verifyUntilSubmittable(page);
    await saveFinal(page);
    await expect(page.getByRole("button", { name: "전체 복사" })).toBeVisible();

    // 이용 횟수는 생성 성공에서 1회 차감된다.
    const quotaAfter = await readQuotaRemaining(request, token);
    expect(quotaAfter).toBe((quotaBefore ?? 0) - 1);

    // 보관함에 완료 행이 하나 늘었다.
    await page.getByRole("button", { name: "보관함으로" }).click();
    await page.waitForURL("**/app/selfeval/archive");
    await page.getByLabel("상태").selectOption({ label: "완료" });
    const rows = page.getByRole("listitem").filter({
      has: page.getByRole("button", { name: "다시 보기" }),
    });
    await expect(rows).toHaveCount(completedBefore + 1);

    const entry = await api(request, token, "GET", "/reports");
    expect(entry.json.entry.openSession).toBeNull();
  });

  test("B 성장설계 연동 완주와 과제 회신", async ({
    studentPage: page,
    request,
    token,
  }) => {
    await ensureSelfevalQuota(request, token, 1);
    await discardOpenSession(request, token);
    const admin = serviceRoleClient();
    const itemId = await insertPendingPlanItem(admin);
    try {
      await openNewSession(page);

      // 성장설계 방향 적용을 켜고 과제 카드를 고른다.
      await expect(
        page.getByRole("switch", {
          name: "이 방향을 이번 자기평가서에 적용합니다",
        }),
      ).toHaveAttribute("aria-checked", "true");
      await page.getByText(PLAN_ITEM_TITLE, { exact: true }).click();
      await expect(
        page.getByRole("radio", { name: new RegExp(PLAN_ITEM_TITLE) }),
      ).toBeChecked();
      await submitBasics(page, { growth: true });

      // 활동 선택: 추천 그대로. 자동 선택이 비어 있으면 첫 후보를 직접 고른다.
      const analyze = page.getByRole("button", {
        name: /^선택한 \d+건 분석하기$/,
      });
      await expect(analyze).toBeVisible();
      if (await analyze.isDisabled()) {
        await page.getByRole("checkbox", { name: /선택$/ }).first().check();
      }
      await expect(analyze).toBeEnabled();
      await analyze.click();
      await page.waitForURL(/\/analysis/);

      // 분석(모델) -> 작성 -> 검증 -> 저장
      await waitAnalysisReady(page);
      await page.getByRole("button", { name: "이 내용으로 작성하기" }).click();
      await page.waitForURL(/\/result/);
      await waitGenerated(page);
      await confirmAllFeelings(page);
      await page.getByRole("button", { name: "검증하기" }).click();
      await page.waitForURL(/\/verify$/);
      await verifyUntilSubmittable(page);

      await page.getByRole("button", { name: "최종본으로 저장" }).click();
      await expect(page.getByText("이 내용으로 저장할까요?")).toBeVisible();
      const fulfills = page.getByRole("checkbox", {
        name: new RegExp(`${PLAN_ITEM_TITLE}.*완료 처리해요`),
      });
      await expect(fulfills).toBeChecked();
      await page.getByRole("button", { name: "확인하고 저장" }).click();
      await page.waitForURL(/\/done/, { timeout: 60_000 });
      await expect(
        page.getByRole("heading", { name: "최종본을 저장했습니다" }),
      ).toBeVisible();
      await expect(
        page.getByText(
          `성장설계 실행계획의 '${PLAN_ITEM_TITLE}' 를 완료로 보냈습니다`,
        ),
      ).toBeVisible();

      const item = await admin
        .from("growth_plan_items")
        .select("status, done_source_program, profile_id")
        .eq("id", itemId)
        .single();
      expect(item.error).toBeNull();
      expect(item.data?.profile_id).toBe(QA_STUDENT_PROFILE_ID);
      expect(item.data?.status).toBe("done");
      expect(item.data?.done_source_program).toBe("self");
    } finally {
      await deletePlanItem(admin, itemId);
      await discardOpenSession(request, token);
    }
  });
});
