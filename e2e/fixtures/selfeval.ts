import fs from "node:fs";
import path from "node:path";
import {
  type APIRequestContext,
  type Locator,
  type Page,
  expect as pwExpect,
} from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { test as authTest } from "./auth";
import {
  apiBase,
  resolveStudentProfileId,
  serviceRoleClient,
  studentCredentials,
  supabaseEnv,
} from "./env";

export { expect } from "./auth";

// 자기평가서 E2E 공용 헬퍼. 접속 값은 모두 e2e/fixtures/env.ts 의 env 계약에서 읽는다.
// 로그인 storageState 는 e2e/fixtures/auth.ts 의 test 픽스처를 그대로 쓰고, 여기는 API 직접 호출과
// service role 보조(이용권, 성장설계 과제)만 맡는다.
// 세 스위트(성장설계, 자기평가서, 심화탐구)는 같은 env 계약을 쓴다. 로컬은 vite 5303 과 vercel dev 3000 을
// 띄우고 `E2E_API_BASE=http://127.0.0.1:3000/api` 만 더 주면 Supabase 값은 `supabase status` 에서 읽는다.
// dev 프리뷰는 `E2E_BASE_URL=https://winningpage-git-dev-winningedu-s-projects.vercel.app` 와
// `E2E_SUPABASE_URL=https://gjowqdiopinhixfivnkx.supabase.co`, `E2E_SUPABASE_ANON_KEY`,
// `E2E_SUPABASE_SERVICE_ROLE_KEY`(Supabase Management API `GET /v1/projects/<ref>/api-keys?reveal=true` 로
// 받고 값은 기록하지 않는다), 계정 `E2E_STUDENT_EMAIL`/`E2E_STUDENT_PASSWORD` 를 준다.
// 모든 selfeval 스펙이 QA 학생 계정 하나를 공유하고 학생당 열린 세션은 1개뿐이므로 반드시
// `--workers=1` 로 돌린다. 워커를 여럿 두면 다른 스펙이 만든 세션을 서로 파기해 실패한다.
// 연동 케이스는 그 계정에 완료된 성장설계 리포트 1건이 있어야 한다(없으면
// `E2E_GROWTH_FULL=1 npx playwright test e2e/growth-full.spec.ts --workers=1` 을 같은 계정으로 먼저 돌린다).
// 예: `E2E_BASE_URL=... E2E_SUPABASE_URL=... E2E_SUPABASE_ANON_KEY=... E2E_SUPABASE_SERVICE_ROLE_KEY=... E2E_STUDENT_EMAIL=... E2E_STUDENT_PASSWORD=... npx playwright test e2e/selfeval-*.spec.ts --workers=1`

export { serviceRoleClient };

export type ApiReply = {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: 응답 모양은 호출마다 달라 스펙에서 좁힌다
  json: any;
};

/** 학생 비밀번호 로그인으로 access_token 을 받는다. */
export async function getStudentToken(
  request: APIRequestContext,
): Promise<string> {
  const { email, password } = studentCredentials();
  const { url, anonKey } = supabaseEnv();
  const res = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`학생 로그인 실패: ${res.status()}`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("access_token 이 없다.");
  return body.access_token;
}

/** /api/selfeval/* 를 vercel dev 에 직접 호출한다. path 는 "/reports" 처럼 슬래시로 시작한다. */
export async function api(
  request: APIRequestContext,
  token: string,
  method: "GET" | "POST",
  apiPath: string,
  body?: unknown,
): Promise<ApiReply> {
  const res = await request.fetch(`${apiBase()}/selfeval${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { data: body }),
    timeout: 120_000,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status(), json };
}

/** 열린 세션이 있으면 파기한다. 학생당 열린 세션은 1개라 모든 스펙이 시작에 부른다. */
export async function discardOpenSession(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const entry = await api(request, token, "GET", "/reports");
  const open = entry.json?.entry?.openSession as { id: string } | null;
  if (open) {
    await api(request, token, "POST", "/session", {
      action: "discard",
      sessionId: open.id,
    });
  }
}

/** 기본 입력으로 세션을 만들고 id 를 돌려준다. */
export async function createSession(
  request: APIRequestContext,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await api(request, token, "POST", "/session", {
    action: "create",
    academicYear: 2026,
    gradeLabel: "고2",
    semester: 2,
    area: "subject",
    subject: "확률과 통계",
    activityName: null,
    schoolPrompt:
      "교과 학습 과정에서 스스로 탐구한 내용과 배운 점을 서술하시오.",
    teacherNote: null,
    targetChars: 500,
    targetCharsMode: "with_space",
    career: {
      career: "데이터 분석가",
      department: "통계학과",
      universities: [],
    },
    growthApplied: false,
    planItemId: null,
    ...overrides,
  });
  const id = res.json?.session?.id as string | undefined;
  if (res.status !== 200 || !id) {
    throw new Error(
      `세션 생성 실패: ${res.status} ${JSON.stringify(res.json)}`,
    );
  }
  return id;
}

export const MANUAL_ACTIVITY_NAME = "버스 배차 간격 탐구";
/** 판단 문장과 근거를 포함한 결과. 생성은 기록에 있는 내용만 쓰므로 검증의 판단 항목이 여기서 갈린다. */
export const MANUAL_RESULT_WITH_JUDGMENT =
  "평균 배차 간격은 8.4분, 표준편차는 2.1분이었다. 표준편차가 평균의 4분의 1에 이르러 배차가 고르지 않다고 판단했고, 그 근거로 간격 40개의 도수분포표를 남겼다.";

/** 연동 스펙이 후보 목록에서 고르는 기록의 활동명 머리. 실행마다 뒤에 시각을 붙여 유일하게 만든다. */
export const LINKED_ACTIVITY_PREFIX = "버스 배차 간격 연동 탐구";

/**
 * 이전 실행이 남긴 E2E 기록(직접 입력 초안, 연동용 초안, 자기평가서 확정본) 가운데 완료 세션이
 * 참조하지 않는 것을 지우고, 판단이 든 초안 하나를 이번 실행만의 활동명으로 둔다. 완료 세션이 참조해
 * 남는 옛 기록과 이름이 겹치지 않도록 활동명에 시각을 붙인다. 연동 스펙은 돌려받은 이름으로 고른다.
 */
export async function resetManualActivityRecords(
  admin: SupabaseClient,
): Promise<{ id: string; topic: string }> {
  const profileId = await resolveStudentProfileId();
  const found = await admin
    .from("activity_records")
    .select("id, topic")
    .eq("profile_id", profileId)
    .in("source_program", ["manual", "self"]);
  if (found.error) {
    throw new Error(`활동 기록 조회 실패: ${found.error.message}`);
  }
  const ids = (found.data ?? [])
    .filter((r) => {
      const topic = (r.topic as string | null) ?? "";
      return (
        topic === MANUAL_ACTIVITY_NAME ||
        topic.startsWith(LINKED_ACTIVITY_PREFIX)
      );
    })
    .map((r) => r.id as string);
  if (ids.length > 0) {
    // 완료 세션이 참조하는 기록은 그대로 둔다(같은 과목 완료 세션이 쓴 기록은 후보에서 빠진다).
    // 그 밖의 세션(파기, 진행 중) 연결은 끊고 기록을 지운다.
    const open = await admin
      .from("selfeval_sessions")
      .select("id")
      .eq("profile_id", profileId)
      .neq("status", "completed");
    if (open.error) {
      throw new Error(`세션 조회 실패: ${open.error.message}`);
    }
    const openIds = (open.data ?? []).map((s) => s.id as string);
    if (openIds.length > 0) {
      const unlink = await admin
        .from("selfeval_session_activities")
        .delete()
        .in("activity_record_id", ids)
        .in("session_id", openIds);
      if (unlink.error) {
        throw new Error(`세션 활동 정리 실패: ${unlink.error.message}`);
      }
    }
    const stillUsed = await admin
      .from("selfeval_session_activities")
      .select("activity_record_id")
      .in("activity_record_id", ids);
    if (stillUsed.error) {
      throw new Error(`세션 활동 조회 실패: ${stillUsed.error.message}`);
    }
    const keep = new Set(
      (stillUsed.data ?? []).map((r) => r.activity_record_id as string),
    );
    const removable = ids.filter((id) => !keep.has(id));
    if (removable.length > 0) {
      const removed = await admin
        .from("activity_records")
        .delete()
        .in("id", removable);
      if (removed.error) {
        throw new Error(`활동 기록 정리 실패: ${removed.error.message}`);
      }
    }
  }
  const topic = `${LINKED_ACTIVITY_PREFIX} ${new Date()
    .toISOString()
    .slice(11, 19)
    .replace(/:/g, "")}`;
  const inserted = await admin
    .from("activity_records")
    .insert({
      profile_id: profileId,
      source_program: "manual",
      status: "draft",
      grade_label: "고2",
      semester: 2,
      subject_group: "확률과 통계",
      subject: "확률과 통계",
      topic,
      concept:
        "확률변수의 평균과 표준편차, 정규분포를 이용한 구간 추정을 적용했다.",
      method:
        "도착 간격 40개를 표로 만들어 평균과 표준편차를 계산하고 히스토그램으로 분포를 확인했다.",
      result: MANUAL_RESULT_WITH_JUDGMENT,
      limitation: "표본이 2주치뿐이라 요일별 차이는 확인하지 못했다.",
      numbers: ["8.4분", "2.1분", "40개"],
      sources: [],
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    throw new Error(
      `활동 기록 삽입 실패: ${inserted.error?.message ?? "없음"}`,
    );
  }
  return { id: inserted.data.id as string, topic };
}

/** 직접 입력 활동을 핵심으로 확정한다(current_step 2). 활동 기록 id 를 돌려준다. */
export async function addManualActivity(
  request: APIRequestContext,
  token: string,
  sessionId: string,
  activityName: string = MANUAL_ACTIVITY_NAME,
): Promise<string> {
  const res = await api(request, token, "POST", "/pick-records", {
    sessionId,
    action: "manual",
    input: {
      activityName,
      subjectOrArea: "확률과 통계",
      gradeLabel: "고2",
      semester: 2,
      motive:
        "통학 버스가 배차 간격보다 늦게 오는 날이 잦아 실제 분포가 궁금했다.",
      concept:
        "확률변수의 평균과 표준편차, 정규분포를 이용한 구간 추정을 적용했다.",
      action:
        "2주 동안 정류장에서 버스 도착 시각을 기록하고 배차 간격 데이터를 정리했다.",
      method:
        "도착 간격 40개를 표로 만들어 평균과 표준편차를 계산하고 히스토그램으로 분포를 확인했다.",
      result: MANUAL_RESULT_WITH_JUDGMENT,
      role: "자료 수집과 계산을 직접 맡았다.",
      limitation: "표본이 2주치뿐이라 요일별 차이는 확인하지 못했다.",
      next: "요일별로 나누어 분산 차이를 검정해 볼 계획이다.",
    },
  });
  const id = res.json?.activityRecordId as string | undefined;
  if (res.status !== 200 || !id) {
    throw new Error(
      `직접 입력 활동 실패: ${res.status} ${JSON.stringify(res.json)}`,
    );
  }
  return id;
}

/** 현재 이용 가능 횟수. 이용권이 없으면 null. */
export async function readQuotaRemaining(
  request: APIRequestContext,
  token: string,
): Promise<number | null> {
  const entry = await api(request, token, "GET", "/reports");
  return (entry.json?.entry?.quota?.quotaRemaining ?? null) as number | null;
}

/** 잔여가 minRemaining 미만이면 QA 이용권 행을 넣고 캐시를 동기화한다. full 스펙에서만 쓴다. */
export async function ensureSelfevalQuota(
  request: APIRequestContext,
  token: string,
  minRemaining: number,
): Promise<number | null> {
  const entry = await api(request, token, "GET", "/reports");
  const quota = entry.json?.entry?.quota as {
    quotaRemaining: number | null;
  } | null;
  // quotaRemaining 이 null 이면 무제한 이용권이라 아무것도 넣지 않는다(dev QA 계정).
  if (quota && quota.quotaRemaining === null) return null;
  const remaining = quota?.quotaRemaining ?? 0;
  if (remaining >= minRemaining) return remaining;

  const profileId = await resolveStudentProfileId();
  const admin = serviceRoleClient();
  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + 12);
  const inserted = await admin.from("program_access_grants").insert({
    profile_id: profileId,
    program_key: "selfeval",
    granted_by: "qa",
    granted_sessions: 5,
    granted_months: 12,
    starts_at: now.toISOString(),
    expires_at: expires.toISOString(),
  });
  if (inserted.error) {
    throw new Error(`이용권 삽입 실패: ${inserted.error.message}`);
  }
  const synced = await admin.rpc("fn_sync_program_access_cache", {
    p_profile_id: profileId,
    p_program_key: "selfeval",
  });
  if (synced.error) {
    throw new Error(`이용권 캐시 동기화 실패: ${synced.error.message}`);
  }
  return readQuotaRemaining(request, token);
}

export const PLAN_ITEM_TITLE = "자기평가서 E2E 과제";

/** 최신 완료 성장설계 리포트에 program self pending 과제를 넣고 id 를 돌려준다. */
export async function insertPendingPlanItem(
  admin: SupabaseClient,
): Promise<string> {
  const profileId = await resolveStudentProfileId();
  const report = await admin
    .from("growth_reports")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "completed")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (report.error || !report.data) {
    throw new Error(
      `완료된 성장설계 리포트가 없다: ${report.error?.message ?? "없음"}`,
    );
  }
  // 중단된 실행이 남긴 같은 제목의 과제가 있으면 카드가 둘이 되어 선택이 막히므로 먼저 지운다.
  await admin
    .from("growth_plan_items")
    .delete()
    .eq("profile_id", profileId)
    .eq("title", PLAN_ITEM_TITLE);
  const inserted = await admin
    .from("growth_plan_items")
    .insert({
      report_id: report.data.id,
      profile_id: profileId,
      program: "self",
      status: "pending",
      title: PLAN_ITEM_TITLE,
      category: "확률과 통계",
      axis: "B",
      priority: "recommended",
      period: "semester",
      sort_order: 999,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    throw new Error(`과제 삽입 실패: ${inserted.error?.message ?? "없음"}`);
  }
  return inserted.data.id as string;
}

export async function deletePlanItem(
  admin: SupabaseClient,
  id: string,
): Promise<void> {
  await admin.from("growth_plan_items").delete().eq("id", id);
}

const SCREENSHOT_DIR = "/tmp/selfeval-e2e";

/**
 * 로그인한 학생 페이지(studentPage)와 API 토큰(token)을 주는 test.
 * 실패한 테스트는 커밋 대상이 아닌 /tmp/selfeval-e2e 에 스크린샷을 남긴다.
 */
export const test = authTest.extend<{ studentPage: Page; token: string }>({
  token: async ({ request }, use) => {
    await use(await getStudentToken(request));
  },
  studentPage: async ({ browser, authStorageStatePath }, use, testInfo) => {
    const context = await browser.newContext({
      storageState: authStorageStatePath,
    });
    const page = await context.newPage();
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const name = testInfo.title.replace(/[^\w가-힣-]+/g, "_").slice(0, 80);
      await page
        .screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) })
        .catch(() => {});
    }
    await context.close();
  },
});

// ---------------------------------------------------------------------------
// 화면 흐름 헬퍼(full 스펙이 쓴다). 문구는 화면 소스에서 그대로 가져왔다.
// ---------------------------------------------------------------------------

const MODEL_WAIT_MS = 150_000;

/** 대상이 보일 때까지 기다린다. 실패 카드의 다시 시도 버튼이 뜨면 눌러 이어 간다. */
async function waitVisibleWithRetry(
  page: Page,
  target: Locator,
  retryName: RegExp,
  timeoutMs: number = MODEL_WAIT_MS,
) {
  const retry = page.getByRole("button", { name: retryName });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await target.isVisible()) return;
    if (await retry.isVisible()) await retry.click();
    await page.waitForTimeout(1_500);
  }
  await pwExpect(target).toBeVisible({ timeout: 1_000 });
}

/** 시작 화면에서 기본 입력 화면까지 간다. */
export async function openNewSession(page: Page) {
  await page.goto("/app/selfeval");
  await page.getByRole("button", { name: "새 자기평가서 만들기" }).click();
  await page.waitForURL("**/app/selfeval/new");
}

/** 기본 입력을 채우고 제출해 활동 선택 화면까지 간다. 성장설계 방향 적용 여부는 growth 로 정한다. */
export async function submitBasics(
  page: Page,
  options: { subject?: string; growth: boolean },
) {
  const grade = page.getByLabel("학년", { exact: true });
  if ((await grade.inputValue()) === "") await grade.selectOption("고2");
  const semester = page.getByLabel("학기", { exact: true });
  if ((await semester.inputValue()) === "") await semester.selectOption("2");
  await page.getByLabel("과목명").fill(options.subject ?? "확률과 통계");
  await page
    .getByLabel("학교 문항 전문")
    .fill("교과 학습 과정에서 스스로 탐구한 내용과 배운 점을 서술하시오.");
  await page.getByLabel("목표 글자 수").fill("500");

  const toggle = page.getByRole("switch", {
    name: "이 방향을 이번 자기평가서에 적용합니다",
  });
  if (await toggle.isVisible()) {
    const on = (await toggle.getAttribute("aria-checked")) === "true";
    if (on !== options.growth) await toggle.click();
  } else if (options.growth) {
    throw new Error("성장설계 카드가 없다. 완료된 성장설계 리포트가 필요하다.");
  }
  await page.getByRole("button", { name: "이 조건으로 활동 찾기" }).click();
  await page.waitForURL(/\/app\/selfeval\/s\/[^/]+\/activities/);
}

/** 활동 선택 화면에서 직접 입력 폼으로 활동 하나를 넣고 분석 확인 화면까지 간다. */
export async function submitManualActivity(page: Page, activityName: string) {
  const form = page.getByRole("region", { name: "직접 입력" });
  const open = page.getByRole("button", { name: "직접 입력", exact: true });
  await pwExpect(form.or(open)).toBeVisible();
  if (!(await form.isVisible())) await open.click();
  await form.getByLabel("활동명").fill(activityName);
  await form
    .getByLabel("계기")
    .fill("통학 버스가 배차 간격보다 늦게 오는 날이 잦아 분포가 궁금했다.");
  await form
    .getByLabel("교과 개념")
    .fill("확률변수의 평균과 표준편차, 정규분포 구간 추정을 적용했다.");
  await form
    .getByLabel("한 일")
    .fill("2주 동안 정류장에서 버스 도착 시각을 기록해 배차 간격을 정리했다.");
  await form
    .getByLabel("방법")
    .fill("도착 간격 40개로 표를 만들고 평균과 표준편차를 계산했다.");
  // 생성은 기록에 있는 내용만 쓰므로 판단 문장과 근거 수치를 기록에 넣어야 검증의 판단 항목
  // (15점 미만이면 필수 수정)이 통과한다.
  await form.getByLabel("결과와 근거").fill(MANUAL_RESULT_WITH_JUDGMENT);
  await form.getByLabel("역할").fill("자료 수집과 계산을 직접 맡았다.");
  await form
    .getByLabel("한계")
    .fill("표본이 2주치뿐이라 요일별 차이는 확인하지 못했다.");
  await form
    .getByLabel("다음 단계")
    .fill("요일별로 나누어 분산 차이를 검정해 볼 계획이다.");
  await form.getByRole("button", { name: "이 활동으로 분석하기" }).click();
  await page.waitForURL(/\/app\/selfeval\/s\/[^/]+\/analysis/);
}

/** 분석 확인 화면에서 분석이 끝나고 충돌이 풀릴 때까지 기다린다. */
export async function waitAnalysisReady(page: Page) {
  const write = page.getByRole("button", { name: "이 내용으로 작성하기" });
  await waitVisibleWithRetry(page, write, /^다시 시도/);
  // 수치 충돌이 남아 있으면 첫 선택지를 고른다. 버튼은 분석이 도는 동안에도 비활성으로 보이므로
  // 충돌 행이 없을 때는 누르지 않고 기다린다(없는 행을 누르면 테스트 시간이 다할 때까지 멈춘다).
  for (let i = 0; i < 60 && (await write.isDisabled()); i += 1) {
    const row = page
      .getByRole("listitem")
      .filter({ hasText: "확인 필요" })
      .first();
    if ((await row.count()) > 0) {
      // 고르면 행이 바로 사라져 클릭 동작이 재시도로 끝나지 않을 수 있다. 제한 시간을 두고 실패는
      // 무시한 뒤 버튼 상태로 다시 판단한다.
      await row
        .getByRole("button")
        .first()
        .click({ timeout: 5_000, noWaitAfter: true })
        .catch(() => undefined);
    }
    await page.waitForTimeout(1_000);
  }
  await pwExpect(write).toBeEnabled();
}

/** 생성 결과 화면이 뜰 때까지 기다린다. */
export async function waitGenerated(page: Page) {
  const verify = page.getByRole("button", { name: "검증하기" });
  await waitVisibleWithRetry(page, verify, /^다시 시도/);
}

/** 확인이 필요한 느낌 문장을 모두 "맞아요" 로 확인한다. */
export async function confirmAllFeelings(page: Page) {
  const buttons = page.getByRole("button", { name: "맞아요" });
  for (let i = 0; i < 30; i += 1) {
    const n = await buttons.count();
    if (n === 0) return;
    await buttons.first().click();
    await pwExpect(buttons).toHaveCount(n - 1);
  }
}

/**
 * 검증 결과를 기다리고 저장 가능할 때까지 최대 3번 돌린다.
 * 필수 수정이 남으면 작성 화면으로 돌아가 느낌 문장을 확인하고 다시 검증한다.
 */
export async function verifyUntilSubmittable(page: Page) {
  const save = page.getByRole("button", { name: "최종본으로 저장" });
  let lastFixes = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitVisibleWithRetry(page, save, /^다시 검증하기/);
    if (await save.isEnabled()) return;
    const fixes = page.getByRole("alert", { name: "필수 수정" });
    lastFixes = (await fixes.count()) > 0 ? await fixes.innerText() : "(없음)";
    await page.getByRole("button", { name: "작성 화면으로" }).click();
    await waitGenerated(page);
    await confirmAllFeelings(page);
    await page.getByRole("button", { name: "검증하기" }).click();
    await page.waitForURL(/\/verify$/);
  }
  throw new Error(`필수 수정이 풀리지 않았다: ${lastFixes}`);
}

/** 저장 확인 모달에서 확인하고 저장해 완료 화면까지 간다. */
export async function saveFinal(page: Page) {
  await page.getByRole("button", { name: "최종본으로 저장" }).click();
  await pwExpect(page.getByText("이 내용으로 저장할까요?")).toBeVisible();
  await page.getByRole("button", { name: "확인하고 저장" }).click();
  await page.waitForURL(/\/app\/selfeval\/s\/[^/]+\/done/, {
    timeout: 60_000,
  });
  await pwExpect(
    page.getByRole("heading", { name: "최종본을 저장했습니다" }),
  ).toBeVisible();
}

/** 완료된 세션 수(API 기준). */
export async function countCompleted(
  request: APIRequestContext,
  token: string,
): Promise<number> {
  const entry = await api(request, token, "GET", "/reports");
  const sessions = (entry.json?.sessions ?? []) as { status: string }[];
  return sessions.filter((s) => s.status === "completed").length;
}
