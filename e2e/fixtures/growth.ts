import { expect, type Page } from "@playwright/test";
import { resolveStudentProfileId, serviceRoleClient } from "./env";
import {
  e2eText,
  hasE2ePrefix,
  isE2eOpenedReport,
  OPEN_REPORT_STATUSES,
  stripE2eAnswers,
} from "./marker";

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

/**
 * 프로필 저장, 조사 답, 트랙, 성적, 직접 입력 활동을 거쳐 "리포트 만들기"로 /app/growth/generate 에 진입한다.
 * 진입하면 서버가 회차를 만들고 이용권 1회가 차감된다. 입력 값은 모두 E2E 접두어를 쓴다.
 */
export async function createGrowthRoundForE2e(page: Page) {
  await page.goto("/app/growth");
  await ensureProfileSaved(page);

  await page.goto("/app/growth/survey");
  await answerFirstQuestion(page, e2eText(`수집 ${Date.now()}`));
  await goToCollectFromSurvey(page);

  await expect(page.getByRole("heading", { name: "활동 선택" })).toBeVisible();
  await page.getByRole("radio", { name: "고2" }).click();
  await expect(page.getByRole("radio", { name: "고2" })).toBeChecked();

  const gradeInput = page.locator('input[id^="grade-"]').first();
  await expect(gradeInput).toBeVisible();
  await gradeInput.fill("3");

  await page.getByLabel("학년", { exact: true }).selectOption("고2");
  await page.getByLabel("학기", { exact: true }).selectOption("1");
  await page.getByLabel("과목 또는 영역").fill("통합사회");
  await page
    .getByLabel("주제", { exact: true })
    .fill(e2eText("직접 입력 주제"));
  await page.getByLabel("개념", { exact: true }).fill(e2eText("개념"));
  await page.getByLabel("방법", { exact: true }).fill(e2eText("방법"));
  await page.getByLabel("결과", { exact: true }).fill(e2eText("결과"));
  await page.getByLabel("한계", { exact: true }).fill(e2eText("한계"));
  await page.getByRole("button", { name: "활동 추가" }).click();

  const total = page
    .getByText("분석 대상 합계")
    .locator("xpath=following-sibling::span");
  await expect(total).toHaveText(/^[1-9]\d*건$/, { timeout: 15_000 });

  const make = page.getByRole("button", {
    name: "리포트 만들기",
    exact: true,
  });
  await expect(make).toBeEnabled();
  await make.click();

  await page.waitForURL("**/app/growth/generate");
  await expect(page.getByRole("heading", { name: "진행 상황" })).toBeVisible();
}

/** 서비스 롤 쿼리 결과의 error 를 오류로 올린다. */
function check<T extends { error: { message: string } | null }>(
  what: string,
  res: T,
): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res;
}

/**
 * E2E 학생 계정에 접두어(E2E_PREFIX)로 남은 성장설계 데이터를 지운다. 접두어 없는 행과 값은 건드리지 않는다.
 * (a) 주제가 접두어로 시작하는 activity_records,
 * (b) growth_profiles.survey_answers 에서 접두어 값을 가진 키,
 * (c) E2E 가 연 미완(draft, in_progress) growth_reports. 차감된 회차는 reverse_growth_credit 으로 되돌린 뒤 지운다.
 */
export async function cleanupGrowthE2eData(): Promise<void> {
  const admin = serviceRoleClient();
  const profileId = await resolveStudentProfileId();

  const records = check(
    "E2E 활동 기록 조회",
    await admin
      .from("activity_records")
      .select("id, topic")
      .eq("profile_id", profileId),
  ).data;
  const e2eRecordIds = new Set(
    (records ?? [])
      .filter((r) => hasE2ePrefix(r.topic))
      .map((r) => r.id as string),
  );

  // 회차는 활동 기록보다 먼저 정리한다(회차가 기록 id 를 참조해 E2E 회차를 가려낸다).
  const reports = check(
    "미완 회차 조회",
    await admin
      .from("growth_reports")
      .select(
        "id, status, survey_answers, activity_ids, ledger_id, ledger_reversed_at",
      )
      .eq("profile_id", profileId)
      .in("status", OPEN_REPORT_STATUSES),
  ).data;
  for (const report of reports ?? []) {
    const row = {
      status: report.status as string,
      survey_answers: report.survey_answers,
      activity_ids: (report.activity_ids ?? []) as string[],
    };
    if (!isE2eOpenedReport(row, e2eRecordIds)) continue;
    if (report.ledger_id && !report.ledger_reversed_at) {
      check(
        "이용권 되돌림",
        await admin.rpc("reverse_growth_credit", {
          p_report_id: report.id,
          p_profile_id: profileId,
          p_reason: "e2e:cleanup",
        }),
      );
    }
    check(
      "E2E 회차 삭제",
      await admin
        .from("growth_reports")
        .delete()
        .eq("id", report.id)
        .eq("profile_id", profileId),
    );
  }

  if (e2eRecordIds.size > 0) {
    check(
      "E2E 활동 기록 삭제",
      await admin
        .from("activity_records")
        .delete()
        .in("id", [...e2eRecordIds])
        .eq("profile_id", profileId),
    );
  }

  const growth = check(
    "조사 답 조회",
    await admin
      .from("growth_profiles")
      .select("survey_answers")
      .eq("profile_id", profileId)
      .maybeSingle(),
  ).data;
  if (growth) {
    const { cleaned, removedKeys } = stripE2eAnswers(growth.survey_answers);
    if (removedKeys.length > 0) {
      check(
        "조사 답 정리",
        await admin
          .from("growth_profiles")
          .update({ survey_answers: cleaned })
          .eq("profile_id", profileId),
      );
    }
  }
}
