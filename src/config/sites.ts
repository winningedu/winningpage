// 사이트별 브랜드 데이터의 정본 — env(import.meta.env.VITE_SITE)에 의존하지 않는
// 순수 데이터만 담는다. vite.config.js(빌드타임, import.meta.env 사용 불가)와
// site.ts(런타임, env로 하나를 고른다) 양쪽이 이 파일을 공유한다.
import type { GateableProgram } from "./programs";

export type SiteKey = "winning" | "schoolmentor";

export interface SiteConfig {
  key: SiteKey;
  brandName: string;
  logo: { horizontal: string; stacked: string };
  favicon: { png96: string; appleTouch: string; ico: string; svg?: string };
  manifest: string;
  // 칼럼 게시판의 사용자 노출 이름(제목, 홈 링크, 빈 안내).
  columnTitle: string;
  // 사이트별 기능 노출 스위치 - 화면마다 사이트 키를 비교하지 않고 이 값 하나로 판정한다.
  features: {
    // 프리미엄(컨설팅 프로그램 6종 + 프리미엄 이용 신청)의 메뉴, 카드, 라우트 노출 여부.
    premium: boolean;
    // 콜멘토(메뉴, 라우트, 서비스 항목) 노출 여부.
    callmentor: boolean;
    // 화면 문구의 '위닝 ' 서비스 이름 접두어('위닝 수행평가' 등)와 '위닝 내부 기준'을 뺄지(결정 2).
    stripWinningPrefix: boolean;
    // 메뉴, 카드, 가격표, 라우트에서 숨길 신규 서비스(growth, selfeval, inquiry). 기본은 빈 배열(전부 노출).
    // 배포 환경별로는 site.ts가 VITE_HIDDEN_PROGRAMS로 덮어쓴다.
    hiddenPrograms: readonly GateableProgram[];
    // 홈 배너(큰 배너/작은 배너)가 노출 대상 없이 0건일 때 영역을 숨기지 않고 '배너가 없습니다' 안내를 보여줄지(기획 #26).
    bannerEmptyNotice: boolean;
    // 로그인을 서버(POST /api/auth/login, 아이디 로그인과 실패 잠금)로 처리할지. false면 클라이언트가 signInWithPassword 를 직접 부른다.
    serverLogin: boolean;
    // B2B 메뉴 트리(목표성장서비스, 수행심화서비스, 입시정보, 고객안내)를 fallback으로 쓸지. false면 위닝 트리.
    b2bMenu: boolean;
  };
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
    // 푸터 소셜 아이콘 URL. 값이 있는 것만 푸터에 렌더한다.
    naverBlogUrl?: string;
    youtubeUrl?: string;
    instagramUrl?: string;
    naverClipUrl?: string;
  };
}

export const SITES: Record<SiteKey, SiteConfig> = {
  winning: {
    key: "winning",
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
    manifest: "/site.webmanifest",
    columnTitle: "교육칼럼",
    features: {
      premium: true,
      callmentor: true,
      stripWinningPrefix: false,
      hiddenPrograms: [],
      bannerEmptyNotice: false,
      serverLogin: false,
      b2bMenu: false,
    },
    company: {
      name: "주식회사 위닝에듀",
      ceo: "강원석",
      corpRegNo: "180111-0161411",
      patentNo: "10-3038224-0000",
      bizRegNo: "266-88-03449",
      mailOrderNo: "제2026-세종아름-0264호",
      address: "(본점) 세종특별자치시 마음안1로 61, 404호",
      tel: "010-3664-0081",
      centerTel: "051-902-0080",
      kakao: "winningedu_official",
      kakaoChannelUrl: "https://pf.kakao.com/_EfjwX",
      naverBlogUrl: "https://blog.naver.com/winningedu",
      youtubeUrl: "https://www.youtube.com/@winningedu-100",
      // 고객 지시: 인스타그램 주소가 전달되기 전까지 임시로 유튜브 쇼츠 주소를 쓴다.
      instagramUrl: "https://www.instagram.com/winningedu.official/",
      naverClipUrl: "https://clip.naver.com/@winningedu",
      supportChannelLabel: "카카오 채널 '위닝에듀'",
    },
  },
  schoolmentor: {
    key: "schoolmentor",
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
    manifest: "/schoolmentor/site.webmanifest",
    columnTitle: "칼럼-교육청소식",
    features: {
      premium: false,
      callmentor: false,
      stripWinningPrefix: true,
      hiddenPrograms: [],
      bannerEmptyNotice: true,
      // 운영 선행 조건(시크릿 키 env, Sb-Forwarded-For 설정)과 W2 라우트가 갖춰질 때까지 끈다.
      serverLogin: false,
      b2bMenu: true,
    },
    company: {
      name: "주식회사 위닝로직",
      ceo: "강원석",
      corpRegNo: "164711-0016571",
      bizRegNo: "783-81-04298",
      address:
        "세종특별자치시 마음안1로 61, 404-B호 (고운동, 세종 리치먼드힐2 타운하우스)",
      // 결정 1(2026-11-05): 스쿨멘토도 위닝에듀 카카오 채널을 쓴다(온라인문의 메뉴 유지).
      kakaoChannelUrl: "https://pf.kakao.com/_EfjwX",
    },
  },
};
