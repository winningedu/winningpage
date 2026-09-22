// 사이트 정체성(위닝에듀/스쿨멘토) — 같은 저장소를 Vercel 프로젝트 2개(winning /
// schoolmentor)로 배포하기 위한 빌드타임 상수다(env: VITE_SITE, vite.config.js가
// 빌드 시점에 값 존재를 한 번 더 검증한다).
//
// 브랜드 데이터 자체의 정본은 sites.ts(순수 데이터, env 비의존 — vite.config.js도
// 같은 데이터를 쓴다)다. 이 파일은 런타임에 VITE_SITE로 그중 하나를 고르기만 한다.
import { type SiteConfig, SITES, type SiteKey } from "@/config/sites";

export type { SiteConfig, SiteKey };

function resolveSiteKey(value: string | undefined): SiteKey {
  if (value === "winning" || value === "schoolmentor") return value;
  throw new Error(
    `VITE_SITE 누락/오류 — winning 또는 schoolmentor여야 합니다(현재: ${value})`,
  );
}

export const site: SiteConfig =
  SITES[resolveSiteKey(import.meta.env.VITE_SITE)];
