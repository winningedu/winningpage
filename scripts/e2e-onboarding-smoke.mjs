// 목표관리 온보딩 7단계 E2E 스모크 — dev DB 실데이터 증명용.
//
// qa-student@winning.test 계정으로 magiclink 세션을 새로 발급해 playwright
// 격리 컨텍스트(storageState 공유 없음)에 주입한 뒤, 온보딩 7단계를 실제 UI
// 조작으로 완주하고 POST /api/goal/intake 응답을 캡처한다. 실행 후
// goal_students / goal_probability_logs 를 service role로 읽어 실데이터
// 생성을 검증한다.
//
// 절대 규칙: dev DB(gjowqdiopinhixfivnkx)만 대상으로 한다 — 다른 ref면 즉시 abort.
// vercel dev는 이미 기동 중인 것을 그대로 쓴다(재기동하지 않는다).
//
// 실행: node scripts/e2e-onboarding-smoke.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const SHOT_DIR =
  "/private/tmp/claude-501/-Users-hyunsoo-uwellnow-winningpage-dev/472ce8b4-b0f1-46b6-8fef-8885b19d3ed3/scratchpad/goal-e2e-shots";

const APP_ORIGIN = "http://localhost:3000";
const TEST_EMAIL = "qa-student@winning.test";
const EXPECTED_PROFILE_ID = "e8b419ac-aa89-4004-b9a5-b62ef60c6894";
const EXPECTED_REF = "gjowqdiopinhixfivnkx";

// ---------------------------------------------------------------------------
// 0) 환경 로드 + ref 가드
// ---------------------------------------------------------------------------

function loadEnv() {
  const raw = readFileSync(`${REPO_ROOT}.env.local`, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SECRET_KEY = env.SUPABASE_SECRET_KEY;
const PUBLISHABLE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const refMatch = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./);
const ref = refMatch?.[1];

if (ref !== EXPECTED_REF) {
  console.error(
    `[ABORT] DB ref 불일치: 기대 ${EXPECTED_REF}, 실제 ${ref}. 운영 오조작 방지를 위해 중단합니다.`,
  );
  process.exit(1);
}

console.log(`[env] dev DB ref 확인 완료: ${ref}`);

const admin = createClient(SUPABASE_URL, SECRET_KEY);

// ---------------------------------------------------------------------------
// 1) 세션 발급 — admin generate_link(magiclink) → verify → supabase-js
//    localStorage 형식으로 조립
// ---------------------------------------------------------------------------

async function mintSession() {
  const glRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SECRET_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email: TEST_EMAIL }),
  });
  const glBody = await glRes.json();
  if (!glRes.ok)
    throw new Error(
      `generate_link 실패: ${glRes.status} ${JSON.stringify(glBody)}`,
    );

  const tokenHash = glBody.hashed_token || glBody.properties?.hashed_token;
  if (!tokenHash)
    throw new Error(`hashed_token 없음: ${JSON.stringify(glBody)}`);

  const vfRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await vfRes.json();
  if (!vfRes.ok || !session.access_token)
    throw new Error(`verify 실패: ${vfRes.status} ${JSON.stringify(session)}`);

  if (session.user?.id !== EXPECTED_PROFILE_ID) {
    throw new Error(
      `user id 불일치: 기대 ${EXPECTED_PROFILE_ID}, 실제 ${session.user?.id}`,
    );
  }

  const storageKey = `sb-${ref}-auth-token`;
  const storageVal = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type || "bearer",
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });

  console.log(
    `[session] 발급 완료 — user=${session.user?.email}, expires_at=${session.expires_at}`,
  );
  return { storageKey, storageVal };
}

// ---------------------------------------------------------------------------
// 2) DB 사전상태 확인 — goal_students 0행(미온보딩) 재확인
// ---------------------------------------------------------------------------

async function assertNotOnboardedYet() {
  const { data, error } = await admin
    .from("goal_students")
    .select("profile_id, status, onboarded_at")
    .eq("profile_id", EXPECTED_PROFILE_ID)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    console.warn(
      `[warn] goal_students에 이미 행이 있습니다(온보딩 재실행 시 서버가 409를 줄 수 있음): ${JSON.stringify(data)}`,
    );
  } else {
    console.log("[db] goal_students 사전상태: 0행(미온보딩) 확인");
  }
}

// ---------------------------------------------------------------------------
// 3) Playwright — 7단계 완주
// ---------------------------------------------------------------------------

async function runOnboarding({ storageKey, storageVal }) {
  const browser = await chromium.launch();
  // 새 격리 컨텍스트 — storageState 공유 금지(세션별 격리 정책).
  const context = await browser.newContext();

  await context.addInitScript(
    ([key, val]) => {
      window.localStorage.setItem(key, val);
    },
    [storageKey, storageVal],
  );

  const page = await context.newPage();

  let intakeResponse = null;
  page.on("response", async (response) => {
    if (response.url().includes("/api/goal/intake")) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => null);
      }
      intakeResponse = { status: response.status(), body };
      console.log(`[network] POST /api/goal/intake -> ${response.status()}`);
      console.log(JSON.stringify(body, null, 2));
    }
  });

  async function shot(name) {
    await page
      .screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true })
      .catch((e) => {
        console.warn(`[shot] ${name} 실패:`, e.message);
      });
  }

  try {
    console.log("[nav] /app/goal 진입");
    await page.goto(`${APP_ORIGIN}/app/goal`, { waitUntil: "networkidle" });
    await page.waitForURL("**/app/goal/onboarding/step-1", { timeout: 15000 });
    await shot("step-1-entered");

    // ---- Step 1: 학교유형 + 학년 ----
    await page.getByRole("radio", { name: "일반고" }).click();
    await page.getByRole("radio", { name: "고등학교 1학년" }).click();
    await shot("step-1-filled");
    await clickNext(page);
    await page.waitForURL("**/app/goal/onboarding/step-2", { timeout: 10000 });

    // ---- Step 2: 상한 목표 대학 (서울대학교 / 컴퓨터공학부 — 컷 존재 확인됨) ----
    await selectUniversity(page, "upper", "서울대학교", "컴퓨터공학부");
    await shot("step-2-filled");
    await clickNext(page);
    await page.waitForURL("**/app/goal/onboarding/step-3", { timeout: 10000 });

    // ---- Step 3: 하한 목표 대학 (서울대학교 / 의예과 — 컷 존재 확인됨) ----
    await selectUniversity(page, "lower", "서울대학교", "의예과");
    await shot("step-3-filled");
    await clickNext(page);
    await page.waitForURL("**/app/goal/onboarding/step-4", { timeout: 10000 });

    // ---- Step 4: 내신 — 전부 "없음" 경로 + 이전 학년 평균 등급 ----
    // NoneCheckbox.jsx의 실제 <input>은 `peer sr-only`로 시각적으로 숨겨져 있고 장식용
    // <span>이 그 위를 덮는다 — 일반 클릭은 그 span에 막히므로 force로 우회한다.
    const noneCheckboxes = page.locator('input[type="checkbox"]');
    const noneCount = await noneCheckboxes.count();
    for (let i = 0; i < noneCount; i += 1) {
      await noneCheckboxes.nth(i).check({ force: true });
    }
    // "이전 학년까지의 내신 평균 등급" 입력 — allNone일 때만 나타나는 필드.
    // GradeNumberField는 label만 텍스트라 placeholder(3.24)로 마지막 활성 인풋을 찾는다.
    const priorGradeInput = page
      .locator('input[placeholder="3.24"]:not([disabled])')
      .last();
    await priorGradeInput.waitFor({ state: "visible", timeout: 5000 });
    await priorGradeInput.fill("3");
    await shot("step-4-filled");
    await clickNext(page);
    await page.waitForURL("**/app/goal/onboarding/step-5", { timeout: 10000 });

    // ---- Step 5: 모의고사 — 4회차 전부 "없음" ----
    const mogoNoneCheckboxes = page.locator('input[type="checkbox"]');
    const mogoNoneCount = await mogoNoneCheckboxes.count();
    for (let i = 0; i < mogoNoneCount; i += 1) {
      await mogoNoneCheckboxes.nth(i).check({ force: true });
    }
    await shot("step-5-filled");
    await clickNext(page);
    await page.waitForURL("**/app/goal/onboarding/step-6", { timeout: 10000 });

    // ---- Step 6: 자습 시간 — 최소 1개 요일 0h 초과 ----
    const monIncrease = page.getByRole("button", {
      name: "월요일 자습 시간 늘리기",
    });
    await monIncrease.click();
    await monIncrease.click();
    await shot("step-6-filled");
    await clickNext(page);
    await page.waitForURL("**/app/goal/onboarding/step-7", { timeout: 10000 });

    // ---- Step 7: 일일 스케줄 — 기본값 그대로 제출(항상 활성) ----
    await shot("step-7-before-submit");
    const finishButton = page.getByRole("button", { name: "다음" });
    await finishButton.click();

    // 계산 오버레이 노출 후 /app/goal 로 이동하거나, 실패 시 온보딩 화면에 머무른다.
    await page.waitForTimeout(3000);
    await shot("step-7-after-submit");

    // intake 응답이 늦게 도착할 수 있으니 잠깐 더 대기.
    for (let i = 0; i < 10 && !intakeResponse; i += 1) {
      await page.waitForTimeout(500);
    }

    const finalUrl = page.url();
    console.log(`[nav] 최종 URL: ${finalUrl}`);

    return { intakeResponse, finalUrl };
  } catch (error) {
    await shot("FAILURE");
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function clickNext(page) {
  const nextButton = page.getByRole("button", { name: "다음" });
  await nextButton.waitFor({ state: "visible" });
  // disabled 해제를 기다린다.
  await page.waitForFunction(
    () => {
      const buttons = [...document.querySelectorAll("button")].filter(
        (b) => b.textContent?.trim() === "다음",
      );
      return buttons.some((b) => !b.disabled);
    },
    { timeout: 10000 },
  );
  await nextButton.click();
}

async function selectUniversity(page, target, universityName, departmentName) {
  const input = page.locator(`#university-select-${target}`);
  await input.click();
  await input.fill(universityName);
  await page.getByRole("option", { name: universityName, exact: true }).click();

  const select = page.locator(`#department-select-${target}`);
  await select.selectOption({ label: departmentName });
}

// ---------------------------------------------------------------------------
// 4) 실행 후 DB 검증
// ---------------------------------------------------------------------------

async function verifyDb() {
  const { data: student, error: studentErr } = await admin
    .from("goal_students")
    .select("*")
    .eq("profile_id", EXPECTED_PROFILE_ID)
    .maybeSingle();
  if (studentErr) throw studentErr;

  const { data: logs, error: logsErr } = await admin
    .from("goal_probability_logs")
    .select("*")
    .eq("profile_id", EXPECTED_PROFILE_ID)
    .order("id", { ascending: true });
  if (logsErr) throw logsErr;

  return { student, logs: logs || [] };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  await assertNotOnboardedYet();
  const session = await mintSession();
  const { intakeResponse, finalUrl } = await runOnboarding(session);

  console.log("\n=== intake 응답 ===");
  console.log(JSON.stringify(intakeResponse, null, 2));
  console.log(`\n최종 URL: ${finalUrl}`);

  console.log("\n=== DB 검증 ===");
  const { student, logs } = await verifyDb();
  console.log("goal_students 행:", JSON.stringify(student, null, 2));
  console.log(`goal_probability_logs 행수: ${logs.length}`);
  console.log("goal_probability_logs:", JSON.stringify(logs, null, 2));

  if (student) {
    console.log("\n=== 요약 ===");
    console.log(`status=${student.status}`);
    console.log(
      `ideal_university=${student.ideal_university} / ideal_department=${student.ideal_department}`,
    );
    console.log(
      `min_university=${student.min_university} / min_department=${student.min_department}`,
    );
    console.log(`grade=${student.grade}`);
    console.log(
      `base_ideal_susi=${student.base_ideal_susi}, base_ideal_jungsi=${student.base_ideal_jungsi}`,
    );
    console.log(
      `base_min_susi=${student.base_min_susi}, base_min_jungsi=${student.base_min_jungsi}`,
    );
  } else {
    console.log(
      "\n[결과] goal_students 행이 생성되지 않았습니다 — 실패로 간주.",
    );
  }
}

main()
  .then(() => {
    console.log("\n[done]");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n[FATAL]", error);
    process.exit(1);
  });
