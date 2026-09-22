// 사이트 정체성(위닝에듀/스쿨멘토) — 같은 저장소를 Vercel 프로젝트 2개(winning /
// schoolmentor)로 배포하기 위한 빌드타임 상수다(env: VITE_SITE, vite.config.js가
// 빌드 시점에 값 존재를 한 번 더 검증한다).
//
// 아직 이 값을 소비하는 UI가 없다 — 지금은 뼈대만 둔다. 브랜드 문자열(로고·회사명
// 등) 치환에는 쓰지 않는다(이번 작업 범위 밖) — 가입 가능 여부 같은 "운영 토글"
// 판단에만 쓸 것.
export type SiteKey = "winning" | "schoolmentor";

interface SiteConfig {
  key: SiteKey;
  name: string;
}

const SITES: Record<SiteKey, SiteConfig> = {
  winning: { key: "winning", name: "위닝에듀" },
  schoolmentor: { key: "schoolmentor", name: "스쿨멘토" },
};

function resolveSiteKey(value: string | undefined): SiteKey {
  if (value === "winning" || value === "schoolmentor") return value;
  throw new Error(
    `VITE_SITE 누락/오류 — winning 또는 schoolmentor여야 합니다(현재: ${value})`,
  );
}

export const site: SiteConfig =
  SITES[resolveSiteKey(import.meta.env.VITE_SITE)];
