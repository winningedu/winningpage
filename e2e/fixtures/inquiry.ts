import { execFileSync } from "node:child_process";
import { expect, type Locator, type Page } from "@playwright/test";
import playwrightConfig from "../../playwright.config";
import { test as authTest } from "./auth";

// 심화탐구 E2E 공용 헬퍼. 셀렉터는 role 과 접근 가능한 이름을 쓴다.
// 로컬 공유 Supabase 스택 전용이다. DB 접근은 psql(docker exec)과 auth admin API 만 쓴다.

/** 로컬 QA 학생 profile id. */
export const QA_PROFILE_ID = "00000000-0000-4000-8000-000000000002";

/** E2E_INQUIRY_FULL=1 일 때만 모델을 부르는 스펙을 돌린다. */
export const INQUIRY_FULL = Boolean(process.env.E2E_INQUIRY_FULL);

/** psql 한 문장을 실행하고 결과(-At, 열은 | 로 구분)를 돌려준다. */
export function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_winningpage",
      "psql",
      "-U",
      "postgres",
      "-At",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

/** 열린(draft, in_progress) 세션을 지운다. 자산, 주제는 FK 로 같이 지워진다. */
export function deleteOpenSessions(profileId = QA_PROFILE_ID) {
  psql(
    `delete from inquiry_sessions where profile_id = '${profileId}' and status in ('draft','in_progress')`,
  );
}

type StackEnv = { apiUrl: string; serviceKey: string };
let stackEnv: StackEnv | undefined;

/** supabase status 의 API_URL, SERVICE_ROLE_KEY. 값은 출력하지 않는다. */
function readStackEnv(): StackEnv {
  if (stackEnv) return stackEnv;
  const out = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const pick = (name: string) => {
    const match = new RegExp(`^${name}="?([^"\\n]*)"?$`, "m").exec(out);
    if (!match) throw new Error(`supabase status 에 ${name} 이 없다`);
    return match[1];
  };
  stackEnv = {
    apiUrl: pick("API_URL"),
    serviceKey: pick("SERVICE_ROLE_KEY"),
  };
  return stackEnv;
}

/** auth admin API 로 계정을 만든다. 이미 있으면 그대로 쓴다. 프로필은 가입 트리거가 만든다. */
export async function ensureAuthUser(email: string, password: string) {
  const { apiUrl, serviceKey } = readStackEnv();
  const res = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {},
    }),
  });
  if (!res.ok && res.status !== 422) {
    throw new Error(`계정 생성 실패: ${res.status}`);
  }
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
