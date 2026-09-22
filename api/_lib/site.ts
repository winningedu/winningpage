// 배포 사이트 식별 — 같은 repo를 Vercel 프로젝트 2개(위닝에듀/스쿨멘토)로
// 배포하고, 서버측 정체성은 env `SITE`로 구분한다(프론트 쪽은 `VITE_SITE`,
// 별도). 아직 호출부 없음(뼈대) — signup_enabled 등 사이트별 분기가 붙을 때
// 여기 getSiteKey()를 쓴다. 폴백 없음 — 값이 두 사이트 중 하나가 아니면
// 즉시 에러로 죽는다(잘못된 배포 설정으로 조용히 잘못된 사이트처럼 동작하는
// 것보다 낫다).

import { getEnv } from "./supabaseAdmin.js";

export type SiteKey = "winning" | "schoolmentor";

export function getSiteKey(): SiteKey {
  const value = getEnv("SITE");
  if (value === "winning" || value === "schoolmentor") {
    return value;
  }
  throw new Error(
    `SITE 환경변수가 "winning" 또는 "schoolmentor"이어야 합니다(현재: ${JSON.stringify(value)}).`,
  );
}
