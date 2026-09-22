// 사이트 정체성(위닝에듀/스쿨멘토) — 같은 저장소를 Vercel 프로젝트 2개(winning /
// schoolmentor)로 배포하기 위한 빌드타임 상수다(env: VITE_SITE, vite.config.js가
// 빌드 시점에 값 존재를 한 번 더 검증한다).
//
// 브랜드 문자열(로고·회사명 등)의 정본은 이 파일 하나다 — 컴포넌트는 site를 읽기만
// 하고 사이트 분기(`if site.key === "schoolmentor"`)를 직접 두지 않는다.
export type SiteKey = "winning" | "schoolmentor";

interface SiteConfig {
  key: SiteKey;
  name: string;
  brandName: string;
  logo: { horizontal: string; stacked: string };
  favicon: { png96: string; appleTouch: string; ico: string; svg?: string };
}

const SITES: Record<SiteKey, SiteConfig> = {
  winning: {
    key: "winning",
    name: "위닝에듀",
    brandName: "위닝에듀",
    logo: {
      horizontal: "/images/winning-logo-horizontal.svg",
      stacked: "/images/winning-logo-stacked.svg",
    },
    favicon: {
      png96: "/favicon-96x96.png",
      appleTouch: "/apple-touch-icon.png",
      ico: "/favicon.ico",
      svg: "/favicon.svg",
    },
  },
  schoolmentor: {
    key: "schoolmentor",
    name: "스쿨멘토",
    brandName: "스쿨멘토",
    logo: {
      horizontal: "/images/schoolmentor-logo-horizontal.png",
      stacked: "/images/schoolmentor-logo-stacked.png",
    },
    favicon: {
      png96: "/schoolmentor/favicon-96x96.png",
      appleTouch: "/schoolmentor/apple-touch-icon.png",
      ico: "/schoolmentor/favicon.ico",
    },
  },
};

function resolveSiteKey(value: string | undefined): SiteKey {
  if (value === "winning" || value === "schoolmentor") return value;
  throw new Error(
    `VITE_SITE 누락/오류 — winning 또는 schoolmentor여야 합니다(현재: ${value})`,
  );
}

export const site: SiteConfig =
  SITES[resolveSiteKey(import.meta.env.VITE_SITE)];
