// 비밀번호 재설정 token_hash 모드(A1) E2E — Supabase 공식 가이드가 권장하는
// verifyOtp({ token_hash, type: "recovery" }) 경로가 실제로 세션을 만들고,
// 같은 토큰을 두 번 쓰면 만료 화면으로 떨어지는지 확인한다.
//
// 실행법
//   1) 로컬 dev 서버를 5303 포트로 미리 띄워둔다(이 config는 서버를 직접
//      띄우지 않는다 — playwright.config.ts 상단 주석 참고):
//        npm run dev -- --port 5303 --strictPort
//   2) 다음 환경변수를 채워서 실행한다:
//        SEED_SUPABASE_URL=... SEED_SERVICE_ROLE_KEY=... npx playwright test e2e/reset-password.spec.ts
//      VITE_SUPABASE_ANON_KEY는 .env.local에 이미 있으면 그대로 쓰인다.
//      없으면 E2E_SUPABASE_ANON_KEY로 별도 지정한다.
//   둘 중 하나라도 없으면 이 파일의 모든 테스트를 스킵한다(로컬 키 없이도
//   타입체크·린트는 통과해야 한다).
//
// 각 테스트는 새 브라우저 컨텍스트에서 돈다 — e2e/fixtures/auth.ts의
// 워커 스코프 storageState 공유 관례는 여기서 쓰지 않는다(세션별 격리 원칙,
// [[feedback_verification-playwright-isolated]]).
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const SEED_SUPABASE_URL = process.env.SEED_SUPABASE_URL;
const SEED_SERVICE_ROLE_KEY = process.env.SEED_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.E2E_SUPABASE_ANON_KEY;

const hasEnv = Boolean(SEED_SUPABASE_URL && SEED_SERVICE_ROLE_KEY && ANON_KEY);

test.describe("비밀번호 재설정 — token_hash 모드", () => {
  test.skip(!hasEnv, "SEED_SUPABASE_URL/SEED_SERVICE_ROLE_KEY/anon key 없음");

  const email = `e2e-reset-${Date.now()}@winning.test`;
  const oldPassword = "Old!pass1";
  const newPassword = "New!pass2";

  let userId: string | undefined;
  let tokenHash: string | undefined;

  test.beforeAll(async () => {
    if (!hasEnv) return;

    const admin = createClient(
      SEED_SUPABASE_URL as string,
      SEED_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: createData, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: oldPassword,
        email_confirm: true,
      });
    if (createError || !createData.user) {
      throw new Error(`QA 계정 생성 실패: ${createError?.message}`);
    }
    userId = createData.user.id;

    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({ type: "recovery", email });
    if (linkError || !linkData.properties?.hashed_token) {
      throw new Error(`recovery 링크 생성 실패: ${linkError?.message}`);
    }
    tokenHash = linkData.properties.hashed_token;
  });

  test.afterAll(async () => {
    if (!hasEnv || !userId) return;

    const admin = createClient(
      SEED_SUPABASE_URL as string,
      SEED_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await admin.auth.admin.deleteUser(userId);
  });

  test("token_hash 링크로 들어가면 세션 없이도 폼이 즉시 뜨고, 비밀번호를 바꾸면 새 비밀번호로만 로그인된다", async ({
    page,
  }) => {
    await page.goto(
      `/login/reset-password?token_hash=${tokenHash}&type=recovery`,
    );

    // 세션이 아직 없는 상태에서도(제출 전이라 verifyOtp를 부르지 않았다)
    // "링크를 확인하고 있어요" 대기 화면 없이 곧바로 폼이 보여야 한다.
    const passwordField = page.getByLabel("새 비밀번호", { exact: true });
    await expect(passwordField).toBeVisible();

    await passwordField.fill(newPassword);
    await page.getByLabel("새 비밀번호 확인").fill(newPassword);
    await page.getByRole("button", { name: "비밀번호 변경하기" }).click();

    await expect(page.getByText("비밀번호가 변경됐어요")).toBeVisible();

    const anon = createClient(SEED_SUPABASE_URL as string, ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const signedInWithNew = await anon.auth.signInWithPassword({
      email,
      password: newPassword,
    });
    expect(signedInWithNew.error).toBeNull();

    const signedInWithOld = await anon.auth.signInWithPassword({
      email,
      password: oldPassword,
    });
    expect(signedInWithOld.error).not.toBeNull();
  });

  test("같은 token_hash로 다시 제출하면 이미 소모된 토큰이라 만료 화면으로 떨어진다", async ({
    page,
  }) => {
    await page.goto(
      `/login/reset-password?token_hash=${tokenHash}&type=recovery`,
    );

    await page.getByLabel("새 비밀번호", { exact: true }).fill(newPassword);
    await page.getByLabel("새 비밀번호 확인").fill(newPassword);
    await page.getByRole("button", { name: "비밀번호 변경하기" }).click();

    await expect(page.getByText("링크가 만료됐어요")).toBeVisible();
  });
});
