import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import playwrightConfig from "../../playwright.config";

// E2E 픽스처 공용 env 계약. 로컬 스택과 dev 프리뷰 어디서나 같은 변수로 돌린다.
// 값(키, 비밀번호)은 어디에도 출력하지 않는다.
//
// E2E_BASE_URL                  앱 주소. 없으면 playwright.config 기본값.
// E2E_API_BASE                  API 주소. 없으면 앱 주소 + "/api".
// E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY
//                               셋 다 없으면 `supabase status -o env` 에서 읽는다. 일부만 있으면 오류.
// E2E_STUDENT_EMAIL, E2E_STUDENT_PASSWORD
//                               QA 학생 계정. 없으면 오류.

/** API 루트(끝 슬래시 없음, "/api" 까지 포함). */
export function apiBase(): string {
  const explicit = process.env.E2E_API_BASE;
  if (explicit) return explicit.replace(/\/+$/, "");
  const base =
    process.env.E2E_BASE_URL ?? playwrightConfig.use?.baseURL ?? undefined;
  if (!base) {
    throw new Error("E2E_API_BASE 또는 E2E_BASE_URL 이 필요하다.");
  }
  return `${base.replace(/\/+$/, "")}/api`;
}

export type SupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};
let cachedSupabaseEnv: SupabaseEnv | undefined;

/** supabase status 의 API_URL, ANON_KEY, SERVICE_ROLE_KEY. */
function readStatusEnv(): SupabaseEnv {
  const out = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const pick = (name: string) => {
    const match = new RegExp(`^${name}="?([^"\\n]*)"?$`, "m").exec(out);
    const value = match?.[1];
    if (!value) throw new Error(`supabase status 에 ${name} 이 없다`);
    return value;
  };
  return {
    url: pick("API_URL"),
    anonKey: pick("ANON_KEY"),
    serviceRoleKey: pick("SERVICE_ROLE_KEY"),
  };
}

/** Supabase 접속 값. env 세 개가 모두 없을 때만 supabase status 로 대체한다. */
export function supabaseEnv(): SupabaseEnv {
  if (cachedSupabaseEnv) return cachedSupabaseEnv;
  const url = process.env.E2E_SUPABASE_URL;
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  const given = [url, anonKey, serviceRoleKey].filter(Boolean).length;
  if (given === 3) {
    cachedSupabaseEnv = {
      url: (url as string).replace(/\/+$/, ""),
      anonKey: anonKey as string,
      serviceRoleKey: serviceRoleKey as string,
    };
  } else if (given === 0) {
    cachedSupabaseEnv = readStatusEnv();
  } else {
    throw new Error("E2E_SUPABASE_* 세 값은 함께 준다.");
  }
  return cachedSupabaseEnv;
}

let cachedClient: SupabaseClient | undefined;

/** service role 클라이언트. 이용권, 테스트 데이터 정리와 조회에만 쓴다. */
export function serviceRoleClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const { url, serviceRoleKey } = supabaseEnv();
  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

/** QA 학생 계정. 없으면 오류. */
export function studentCredentials(): { email: string; password: string } {
  const email = process.env.E2E_STUDENT_EMAIL;
  const password = process.env.E2E_STUDENT_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD 환경변수가 없다. QA 학생 계정으로 채워서 실행할 것.",
    );
  }
  return { email, password };
}

let cachedProfileId: Promise<string> | undefined;

/** E2E_STUDENT_EMAIL 계정의 profiles.id. 서비스 롤로 조회하고 캐시한다. */
export function resolveStudentProfileId(): Promise<string> {
  if (!cachedProfileId) {
    cachedProfileId = (async () => {
      const { email } = studentCredentials();
      const found = await serviceRoleClient()
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (found.error) {
        throw new Error(`학생 프로필 조회 실패: ${found.error.message}`);
      }
      if (!found.data) {
        throw new Error("E2E_STUDENT_EMAIL 에 해당하는 profiles 행이 없다.");
      }
      return found.data.id as string;
    })();
    cachedProfileId.catch(() => {
      cachedProfileId = undefined;
    });
  }
  return cachedProfileId;
}

/** auth admin API 로 계정을 만든다. 이미 있으면 그대로 쓴다. 프로필은 가입 트리거가 만든다. */
export async function ensureAuthUser(email: string, password: string) {
  const { url, serviceRoleKey } = supabaseEnv();
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
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
