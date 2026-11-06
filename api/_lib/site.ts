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

// 스쿨멘토 가입 라우트의 사이트 게이트. 같은 repo 를 위닝 프로젝트에도 배포하므로
// 위닝에서는 이 라우트들이 없는 것처럼 404 를 낸다. getSiteKey() 는 SITE 가 비면 던지는데,
// 아직 SITE 를 설정하지 않은 위닝 배포를 500 으로 만들 수 없어서 여기서는 던지지 않고
// "schoolmentor 로 명시된 때만 열림"으로 본다(폴백으로 여는 것이 아니라 닫는 쪽이다).
export function isSchoolmentorSite(): boolean {
  return getEnv("SITE") === "schoolmentor";
}
