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
  company: {
    name: string;
    ceo: string;
    corpRegNo: string;
    bizRegNo: string;
    address: string;
    patentNo?: string;
    mailOrderNo?: string;
    supportChannelLabel?: string;
    tel?: string;
    centerTel?: string;
    kakao?: string;
    kakaoChannelUrl?: string;
  };
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
    company: {
      name: "주식회사 위닝에듀",
      ceo: "강원석",
      corpRegNo: "180111-0161411",
      patentNo: "10-2024-0048889",
      bizRegNo: "266-88-03449",
      mailOrderNo: "제2026-세종아름-0264호",
      address: "(본점) 세종특별자치시 마음안1로 61, 404호",
      tel: "010-3664-0081",
      centerTel: "051-902-0080",
      kakao: "winningedu_official",
      kakaoChannelUrl: "https://pf.kakao.com/_EfjwX",
      supportChannelLabel: "카카오 채널 '위닝에듀'",
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
    company: {
      name: "주식회사 위닝로직",
      ceo: "강원석",
      corpRegNo: "164711-0016571",
      bizRegNo: "783-81-04298",
      address:
        "세종특별자치시 마음안1로 61, 404-B호 (고운동, 세종 리치먼드힐2 타운하우스)",
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
