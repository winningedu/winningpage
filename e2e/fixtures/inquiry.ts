import { expect, type Locator, type Page } from "@playwright/test";
import playwrightConfig from "../../playwright.config";
import { test as authTest } from "./auth";
import {
  ensureAuthUser,
  resolveStudentProfileId,
  serviceRoleClient,
} from "./env";

export { ensureAuthUser };

// 심화탐구 E2E 공용 헬퍼. 셀렉터는 role 과 접근 가능한 이름을 쓴다.
// DB 접근은 service role 클라이언트와 auth admin API 만 쓴다(e2e/fixtures/env.ts).
// 세 스위트(성장설계, 자기평가서, 심화탐구)는 같은 env 계약을 쓴다. 로컬은 vite 5303 과 vercel dev 3000 을
// 띄우고 `E2E_API_BASE=http://127.0.0.1:3000/api` 만 더 주면 Supabase 값은 `supabase status` 에서 읽는다.
// dev 프리뷰는 `E2E_BASE_URL=https://winningpage-git-dev-winningedu-s-projects.vercel.app` 와
// `E2E_SUPABASE_URL=https://gjowqdiopinhixfivnkx.supabase.co`, `E2E_SUPABASE_ANON_KEY`,
// `E2E_SUPABASE_SERVICE_ROLE_KEY`(Supabase Management API `GET /v1/projects/<ref>/api-keys?reveal=true` 로
// 받고 값은 기록하지 않는다), 계정 `E2E_STUDENT_EMAIL`/`E2E_STUDENT_PASSWORD` 를 준다.
// 같은 계정을 공유하므로 반드시 `--workers=1`. 연동 케이스는 그 계정에 완료된 성장설계 리포트 1건이 있어야
// 한다(없으면 `E2E_GROWTH_FULL=1 npx playwright test e2e/growth-full.spec.ts --workers=1` 을 같은 계정으로
// 먼저 돌린다). 예: `E2E_BASE_URL=... E2E_SUPABASE_URL=... E2E_SUPABASE_ANON_KEY=... E2E_SUPABASE_SERVICE_ROLE_KEY=... E2E_STUDENT_EMAIL=... E2E_STUDENT_PASSWORD=... npx playwright test e2e/inquiry-*.spec.ts --workers=1`

/** E2E_INQUIRY_FULL=1 일 때만 모델을 부르는 스펙을 돌린다. */
export const INQUIRY_FULL = Boolean(process.env.E2E_INQUIRY_FULL);

/** 서비스 롤 쿼리 결과의 error 를 오류로 올린다. */
function check<T extends { error: { message: string } | null }>(
  what: string,
  res: T,
): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res;
}

const OPEN_STATUSES = ["draft", "in_progress"];

/** 열린(draft, in_progress) 세션을 지운다. 자산, 주제는 FK 로 같이 지워진다. */
export async function deleteOpenSessions() {
  const profileId = await resolveStudentProfileId();
  check(
    "열린 세션 삭제",
    await serviceRoleClient()
      .from("inquiry_sessions")
      .delete()
      .eq("profile_id", profileId)
      .in("status", OPEN_STATUSES),
  );
}

/** 열린 세션을 보관 처리한다. */
export async function archiveOpenSessions() {
  const profileId = await resolveStudentProfileId();
  check(
    "열린 세션 보관",
    await serviceRoleClient()
      .from("inquiry_sessions")
      .update({ status: "archived" })
      .eq("profile_id", profileId)
      .in("status", OPEN_STATUSES),
  );
}

/** 완료된 세션 수. */
export async function countCompletedSessions(): Promise<number> {
  const profileId = await resolveStudentProfileId();
  const res = check(
    "완료 세션 수 조회",
    await serviceRoleClient()
      .from("inquiry_sessions")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("status", "completed"),
  );
  return res.count ?? 0;
}

/** 심화탐구가 적립한 활동 기록 수. */
export async function countDeepDeposits(): Promise<number> {
  const profileId = await resolveStudentProfileId();
  const res = check(
    "적립 기록 수 조회",
    await serviceRoleClient()
      .from("activity_records")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("source_program", "deep"),
  );
  return res.count ?? 0;
}

/** 가장 최근 완료된 성장설계 리포트 id. 없으면 오류. */
export async function latestCompletedGrowthReportId(): Promise<string> {
  const profileId = await resolveStudentProfileId();
  const res = check(
    "성장설계 리포트 조회",
    await serviceRoleClient()
      .from("growth_reports")
      .select("id")
      .eq("profile_id", profileId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!res.data) throw new Error("완료된 성장설계 회차가 있어야 한다");
  return res.data.id as string;
}

/** 심화탐구 대상 pending 실행계획 과제를 넣는다. */
export async function insertPendingPlanItem(reportId: string, title: string) {
  const profileId = await resolveStudentProfileId();
  check(
    "실행계획 과제 삽입",
    await serviceRoleClient().from("growth_plan_items").insert({
      report_id: reportId,
      profile_id: profileId,
      program: "deep",
      title,
      priority: "recommended",
      period: "semester",
      sort_order: 99,
      status: "pending",
    }),
  );
}

/** 제목이 같은 실행계획 과제를 지운다. */
export async function deletePlanItemsByTitle(title: string) {
  const profileId = await resolveStudentProfileId();
  check(
    "실행계획 과제 삭제",
    await serviceRoleClient()
      .from("growth_plan_items")
      .delete()
      .eq("profile_id", profileId)
      .eq("title", title),
  );
}

/** 제목으로 실행계획 과제의 상태와 완료 출처를 읽는다. */
export async function readPlanItemByTitle(
  title: string,
): Promise<{ status: string; done_source_program: string | null }> {
  const profileId = await resolveStudentProfileId();
  const res = check(
    "실행계획 과제 조회",
    await serviceRoleClient()
      .from("growth_plan_items")
      .select("status, done_source_program")
      .eq("profile_id", profileId)
      .eq("title", title)
      .single(),
  );
  return res.data as { status: string; done_source_program: string | null };
}

/** 열린 세션 한 건의 id. 없으면 null. */
async function openSessionId(): Promise<string | null> {
  const profileId = await resolveStudentProfileId();
  const res = check(
    "열린 세션 조회",
    await serviceRoleClient()
      .from("inquiry_sessions")
      .select("id")
      .eq("profile_id", profileId)
      .in("status", OPEN_STATUSES)
      .limit(1)
      .maybeSingle(),
  );
  return (res.data?.id as string | undefined) ?? null;
}

/** 열린 세션에 복사된 폼 값. */
export async function readOpenSessionBasics(): Promise<{
  grade_label: string;
  semester: number;
  career: string;
  subject: string;
}> {
  const profileId = await resolveStudentProfileId();
  const res = check(
    "열린 세션 값 조회",
    await serviceRoleClient()
      .from("inquiry_sessions")
      .select("grade_label, semester, career, subject")
      .eq("profile_id", profileId)
      .in("status", OPEN_STATUSES)
      .single(),
  );
  return res.data as {
    grade_label: string;
    semester: number;
    career: string;
    subject: string;
  };
}

/** 열린 세션의 자산(종류, 신뢰도)을 position 순으로 읽는다. */
export async function readOpenSessionAssets(): Promise<
  { kind: string; reliability: string }[]
> {
  const sessionId = await openSessionId();
  if (!sessionId) throw new Error("열린 세션이 있어야 한다");
  const res = check(
    "자산 조회",
    await serviceRoleClient()
      .from("inquiry_assets")
      .select("kind, reliability")
      .eq("session_id", sessionId)
      .order("position", { ascending: true }),
  );
  return (res.data ?? []) as { kind: string; reliability: string }[];
}

/** 가입 트리거가 만든 profiles 행을 약관 동의 완료 학생 계정으로 맞춘다. */
export async function updateProfileAsStudent(email: string, name: string) {
  check(
    "프로필 갱신",
    await serviceRoleClient()
      .from("profiles")
      .update({
        member_type: "student",
        name,
        terms_service_agreed: true,
        privacy_required_agreed: true,
      })
      .eq("email", email),
  );
}

/** 해당 이메일의 학생 profiles 행 수. */
export async function countStudentProfiles(email: string): Promise<number> {
  const res = check(
    "학생 프로필 수 조회",
    await serviceRoleClient()
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .eq("member_type", "student"),
  );
  return res.count ?? 0;
}

/** 로그인 폼으로 로그인한다. */
export async function loginWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** 인증된 학생 페이지가 들어 있는 test. 같은 계정이라 `--workers=1` 로 돌린다. */
export const test = authTest.extend<{ studentPage: Page }>({
  studentPage: async ({ browser, authStorageStatePath }, use) => {
    const context = await browser.newContext({
      baseURL: playwrightConfig.use?.baseURL,
      viewport: playwrightConfig.use?.viewport ?? undefined,
      storageState: authStorageStatePath,
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";

/** 정보 입력 화면(/app/inquiry)에 들어가 제목이 보일 때까지 기다린다. */
export async function gotoInfo(page: Page) {
  await page.goto("/app/inquiry");
  await expect(
    page.getByRole("heading", { name: "무엇을 이어서 파고들까요" }),
  ).toBeVisible();
}

export type BasicInfo = {
  grade: "고1" | "고2" | "고3";
  semester: 1 | 2;
  career: string;
  subject: string;
};

/** 기본 정보 카드를 채운다. 학년, 학기는 pill 라디오라 label 문구로 고른다. */
export async function fillBasicInfo(page: Page, info: BasicInfo) {
  await page
    .getByRole("group", { name: "학년" })
    .getByText(info.grade, { exact: true })
    .click();
  await page
    .getByRole("group", { name: "학기" })
    .getByText(`${info.semester}학기`, { exact: true })
    .click();
  await expect(page.getByRole("radio", { name: info.grade })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: `${info.semester}학기` }),
  ).toBeChecked();
  await page.getByLabel(/^희망 진로/).fill(info.career);
  await page.getByLabel(/^과목명/).fill(info.subject);
}

/** 주제 한 줄을 추가한다(추가 버튼). */
export async function addOneline(page: Page, text: string) {
  await page.getByLabel("했던 활동의 주제 한 줄").fill(text);
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "고른 활동" }).getByText(text),
  ).toBeVisible();
}

export const SAMPLE_INFO: BasicInfo = {
  grade: "고2",
  semester: 2,
  career: "수의예과",
  subject: "생명과학I",
};

export const SAMPLE_ONELINE =
  "여름철 반려견 산책 판단에 온습도지수를 적용해 본 활동";

/**
 * 모델 호출 화면에서 `done` 이 보일 때까지 기다린다. 생성 실패 카드의 "다시 시도" 버튼이 뜨면 눌러 이어간다
 * (성장설계 full 스펙과 같은 방식, 요청 단위 실패는 세션을 닫지 않는다).
 */
export async function waitWithRetry(
  page: Page,
  done: Locator,
  timeoutMs = 5 * 60_000,
) {
  const retry = page.getByRole("button", { name: "다시 시도" });
  const deadline = Date.now() + timeoutMs;
  while (!(await done.isVisible()) && Date.now() < deadline) {
    if (await retry.isVisible()) {
      // 생성 요청 하나가 실패했다는 뜻이라 리포트에 남긴다(세션은 열려 있고 이용 횟수는 더 차감되지 않는다).
      authTest.info().annotations.push({
        type: "생성 재시도",
        description: await page
          .getByRole("alert")
          .first()
          .innerText({ timeout: 1_000 })
          .catch(() => ""),
      });
      await retry.click();
    }
    await page.waitForTimeout(2_000);
  }
  await expect(done).toBeVisible({ timeout: 5_000 });
}
export type { Page } from "@playwright/test";
