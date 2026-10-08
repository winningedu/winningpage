import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import bizAiPlatform from "@/assets/company/biz-ai-platform.png";
import bizConsulting from "@/assets/company/biz-consulting.png";
import bizNetwork from "@/assets/company/biz-network.png";
import missionBg from "@/assets/company/mission-bg.jpg";
import partnerChloeWinningArt from "@/assets/company/partner-chloe-winning-art.png";
import partnerJungsangLanguage from "@/assets/company/partner-jungsang-language.png";
import partnerJungsangMath from "@/assets/company/partner-jungsang-math.png";
import SafeHtml from "@/components/admission/SafeHtml";
import {
  isPremiumLink,
  PREMIUM_ADMISSION_A_PATH,
} from "@/components/premium/premiumRoutesPaths";
import { site } from "@/config/site";
import { alertServiceNotReady } from "@/lib/paidServiceAccess";
import { withDedupedKeys } from "@/lib/reactKeys";
import { supabase } from "@/lib/supabase";
import {
  BOARD_SOURCES,
  type BoardRow,
  formatBoardDate,
  incrementBoardView,
} from "./board/boardData";

// company-intro 슬러그의 page_contents 행 — HeroSection 이 읽는 body 필드만 좁혀서 갖는다
// (그 외 필드는 이 페이지가 쓰지 않는다, 파일 상단 HeroSection 주석 참고).
type IntroPage = { body?: string | null } | null;

type Attachment = string | { name?: string; url?: string };

// 회사소개(/company-news) — Figma 시안(1882:19182 "회사소개", 1920×6363) 전면 재작성.
// 라우트 · 헤더/푸터(SiteLayout 전역 렌더) · Supabase 조회/검색/상세/첨부 기능은 그대로 두고
// 히어로~회사소식까지 5개 섹션을 시안 실측대로 새로 짰다. 컨테이너는 전 섹션 max-w-content
// px-5 sm:px-8 로 통일했다(시안 섹션별 실폭 1417/1174/1277 드리프트는 좌단 정렬 일관성을
// 위해 정규화).
//
// 섹션 간 상단 여백(1920 시안 → ×0.766, 배경 전환 없는 경계만 ×0.67 추가 축소):
//   Hero(다크)→Mission(사진)     배경 전환, 축소 없음 — 히어로 자체 높이로 자연 경계
//   Mission(사진)→Business(흰)   배경 전환, 축소 없음 — Business lg:pt-40
//   Business(흰)→Location(회색)  배경 전환 — Business lg:pb-41.75 / Location lg:pt-29
//   Location(회색)→News(흰)      배경 전환 — Location lg:pb-30.25 / News lg:pt-18.75
//   News(흰)→Footer(#f9fafb)     배경 전환, 시안 249px 그대로 — News lg:pb-47.75
//
// 히어로 카드 타이틀은 시안 서체 "우아한세리프"(GraceSerif, Pear Type Foundry / 이희배,
// SIL OFL 1.1)를 tailwind.config.js의 font-grace 토큰으로 셀프호스팅 적용한다(src/styles/fonts.css).
// 카드 타이틀 weight 는 시안이 Bold/Regular 혼용(학습진단·수시카드·프리미엄만 Bold)인데 확대
// 렌더로도 구분이 안 되는 시안 실수로 판단해 전 카드 font-bold 로 통일했다.
// 카드는 사용자 확정으로 6→8장으로 확장했다(수시카드는 코드 정본 서비스가 아니라 제외,
// 성장설계, 자기평가, 심화탐구를 새로 추가).
// 목표관리 카드 설명 텍스트만 시안 실측이 #ffffff 로 다른 카드(배경색의 밝은 틴트)와 규칙이
// 다르다(시안 결함으로 추정) — 카피가 아닌 색 값 판단은 임의 확정하지 않고 실측값을
// 보수적으로 유지했다. 카드 설명 텍스트의 opacity는 WCAG AA(4.5:1) 검증 결과 0.7에서 기존
// 6장 중 4장이 미달해 0.95로 상향했다(리뷰 실측: susi/mentor/perf/premium 전부 4.5:1 이상
// 확보). 신규 3장(성장설계·자기평가·심화탐구)도 동일 opacity 0.95에서 4.5:1 이상을 확보하는
// 배경색·틴트 조합으로 선정했다(계산 실측: 5.07 / 5.37 / 5.31).

// -------------------------------------------------------------------------
// 히어로 — 서비스 카드 8장 (제공 전 서비스 + 프리미엄, 사용자 확정으로 6→8장 확장.
// 수시카드는 코드 정본 서비스가 아니라 목록에서 뺐다. 1882:19182 y 148~1023 시안의
// 3×2 6칸 그리드를 4×2 8칸으로 확장했다 — 아래 그리드 클래스 참고.)
// -------------------------------------------------------------------------
const HERO_CARDS = [
  {
    key: "free",
    bg: "#013262",
    tint: "#bddfff",
    title: "학습진단",
    desc: ["나에게 필요한", "서비스 진단"],
    best: true,
    route: "/services/learning-diagnosis",
  },
  {
    key: "goal",
    bg: "#47406b",
    tint: "#ffffff",
    title: "목표관리",
    desc: ["수험생활의", "완벽한 목표 설계"],
    best: false,
    route: "/services/goal",
  },
  {
    key: "perf",
    bg: "#40606b",
    tint: "#c0eefe",
    title: "수행평가",
    desc: ["주제 추천부터 연계까지", "AI가 관리하는 수행평가"],
    best: false,
    route: "/services/performance",
  },
  {
    key: "growth",
    bg: "#2d5c4a",
    tint: "#b6e3cf",
    title: "성장설계",
    desc: ["나만의 강점을 찾는", "성장 로드맵 설계"],
    best: false,
    route: "/services/growth",
  },
  {
    key: "self",
    bg: "#5a3d63",
    tint: "#e3c2ea",
    title: "자기평가",
    desc: ["활동 후 정리까지", "완성하는 자기평가서"],
    best: false,
    route: "/services/self-assessment",
  },
  {
    key: "research",
    bg: "#3d4a6b",
    tint: "#c2d0f5",
    title: "심화탐구",
    desc: ["주제 추천부터 연계까지", "깊이 있는 심화탐구"],
    best: false,
    route: "/services/research",
  },
  {
    key: "mentor",
    bg: "#66452b",
    tint: "#f2bc92",
    title: "콜멘토",
    desc: ["나만의 1:1", "입시 멘토링"],
    best: true,
    route: "/services/callmentor",
  },
  {
    key: "premium",
    bg: "#304d2d",
    tint: "#a0c99c",
    title: "프리미엄",
    desc: ["전문가가 직접 관리하는", "밀착 컨설팅"],
    best: false,
    route: PREMIUM_ADMISSION_A_PATH,
  },
];

// -------------------------------------------------------------------------
// 사업영역 카드 3장 (1882:19477)
// -------------------------------------------------------------------------
const BUSINESS_CARDS = [
  {
    key: "ai-platform",
    image: bizAiPlatform,
    title: "학습 플랫폼",
    desc: "학습진단, 목표관리, 수행평가, 성장설계, 콜멘토, 자기평가, 심화탐구",
  },
  {
    key: "consulting",
    premiumOnly: true,
    image: bizConsulting,
    title: "입시 컨설팅 서비스",
    desc: "멘토기반 프리미엄 컨설팅, 소수 원장 프리미엄 컨설팅",
  },
  {
    key: "network",
    image: bizNetwork,
    title: "연계 협력 네트워크",
    desc: "정상어학원・정상수학학원\n클로이위닝 미술학원",
  },
];
// ! 가운뎃점은 시안 원문이 U+00B7(·)이나, 코드 정본(InDepthResearch.jsx) 및 페이지 전역 선례가
// U+30FB(・)로 통일돼 있어 그 관용을 따랐다.

// -------------------------------------------------------------------------
// Location — 캠퍼스 카드 9장 (1882:19312, 대전 실주소 반영 + 청담 오픈예정 추가)
// -------------------------------------------------------------------------
const CAMPUS_CARDS = [
  {
    key: "sejong",
    name: "위닝에듀 세종캠퍼스",
    address: ["세종 마음안1로 61"],
    href: "https://naver.me/ximXcCHi",
  },
  {
    key: "hwamyeong",
    name: "위닝에듀 화명캠퍼스",
    address: ["부산 북구 화명대로 40", "현천휴먼 타워, 8층"],
    href: "https://naver.me/FFqICy0L",
  },
  {
    key: "centum",
    name: "위닝에듀 센텀캠퍼스",
    address: ["부산 해운대구 센텀1로 9 S동 24층"],
    href: "https://naver.me/5gFDq5b6",
  },
  {
    key: "cheonan",
    name: "위닝에듀 천안캠퍼스",
    address: ["충남 천안시 서북구 불당23로 73-27 파크힐"],
    href: "https://naver.me/xydFeL4Z",
  },
  {
    key: "jeju",
    name: "위닝에듀 제주캠퍼스",
    address: ["제주 제주시 애월읍 엄장로 55 106동 3층"],
    href: "https://naver.me/xCjzg3XD",
  },
  {
    key: "daejeon",
    name: "위닝에듀 대전캠퍼스",
    address: ["대전시 서구 대덕대로 325, 4층"],
    href: "https://naver.me/5MvGNyCS",
  },
  { key: "daechi", name: "위닝에듀 대치캠퍼스", address: [], comingSoon: true },
  {
    key: "bundang",
    name: "위닝에듀 분당캠퍼스",
    address: [],
    comingSoon: true,
  },
  {
    key: "cheongdam",
    name: "위닝에듀 청담캠퍼스",
    address: [],
    comingSoon: true,
  },
];

// 연계 협력기관 카드 4장(QA 시트 행19로 4번 추가, Figma 1882:19387) — 카드1만 시안이
// 설명문(제목)/브랜드명(부제) 위계가 다른 2·3과 반대인데, 카피 변경 권한이 없어 시안 그대로
// 옮겼다. lg:grid-cols-3 그리드라 4번째 카드는 시안대로 2행으로 자연히 내려간다.
const PARTNER_CARDS = [
  {
    key: "chloe-winning-art",
    title: "미대입시 실기/비실기\n전문 연계기관",
    subtitle: "클로이위닝 미술학원",
    brand: "클로이위닝 미술학원", // title/subtitle 위계가 카드마다 달라 링크 aria-label용 브랜드명을 별도로 둔다
    links: [
      { label: "해운센텀점", href: "https://naver.me/5r9K3YCL" },
      { label: "정관점", href: "https://naver.me/5UEceSEF" },
      { label: "천안점", href: "https://naver.me/xKthcxAW" },
    ],
    logo: partnerChloeWinningArt,
    logoWidth: "w-[8.35rem]",
  },
  {
    key: "jungsang-language",
    title: "정상어학원",
    subtitle: "어학 교육 전문 연계기관",
    brand: "정상어학원",
    links: [{ label: "화명캠퍼스", href: "https://naver.me/FY3j5eyl" }],
    logo: partnerJungsangLanguage,
    logoWidth: "w-[6.5rem]",
  },
  {
    key: "jungsang-math",
    title: "정상수학학원",
    subtitle: "수학 교육 전문 연계기관",
    brand: "정상수학학원",
    links: [{ label: "부산캠퍼스", href: "https://naver.me/GkRHGKeZ" }],
    logo: partnerJungsangMath,
    logoWidth: "w-[6.5rem]",
  },
  {
    // QA 시트 행19(Figma 1882:19387) — 4번째 카드 신규 추가. 정관점 링크는 사용자 확인 결과
    // 카드1(클로이위닝 미술학원) 정관점과 같은 지점을 공유해 동일 URL을 재사용한다. logo도
    // 카드1과 같은 클로이위닝 마크를 재사용한다(조형미술연구소 전용 로고 에셋은 아직 없음).
    key: "chloe-winning-sculpture",
    title: "클로이위닝\n조형미술연구소",
    subtitle: "클로이위닝 미술학원",
    brand: "클로이위닝 조형미술연구소",
    links: [{ label: "정관점", href: "https://naver.me/5UEceSEF" }],
    logo: partnerChloeWinningArt,
    logoWidth: "w-[8.35rem]",
  },
];
// "바로가기" 5개 링크는 네이버 지도 단축링크(naver.me)를 실제 목적지로 받았다 — 전부 외부 새 탭
// (target="_blank" rel="noopener noreferrer")으로 연다. href가 있는 링크는 <a>, 없는 경우
// (지금은 없지만 데이터에 href: null이 다시 들어올 가능성을 막지 않기 위해)는 방어적으로
// <button onClick={alertServiceNotReady}> 폴백을 PartnerCard 내부에 유지한다.

const NEWS_PREVIEW_COUNT = 5;

// -------------------------------------------------------------------------
// 회사소식 데이터 유틸 — 기존 구현 계보 그대로 보존 (Events.jsx 와 동일 패턴)
// -------------------------------------------------------------------------
function normalizeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return [value];
    }
  }

  return [];
}

function cleanText(value: unknown): string {
  return String(value || "").trim();
}

// 날짜 표기는 boardData.js 의 formatBoardDate(KST 기준) 하나로 통일한다.
// 기존 로컬 formatDate 는 UTC(toISOString) 기준이라 KST 00:00~08:59 작성 글이
// /company-news/list(신규 목록, formatBoardDate)와 하루 어긋나 같은 글이 두 날짜로
// 보였다. 공지사항(Events.jsx)도 formatBoardDate 를 쓴다.
// 폴백 동작은 동일: falsy → '', 파싱 실패 → String(value).slice(0, 10).

function getAttachmentName(file: Attachment | null | undefined) {
  if (!file || typeof file === "string") return "첨부파일 다운로드";
  return file.name || "첨부파일 다운로드";
}

function getAttachmentUrl(file: Attachment | null | undefined) {
  if (!file) return "";
  return typeof file === "string" ? file : file.url;
}

function renderContent(content: string | null | undefined) {
  if (!content) return null;

  if (/<\/?[a-z][\s\S]*>/i.test(content)) {
    return <SafeHtml html={content} className="notice-content" />;
  }

  return <div className="notice-content whitespace-pre-line">{content}</div>;
}

// -------------------------------------------------------------------------
// [1] 히어로 — 다크네이비 배경 + 카피 + 서비스 카드 8장
// 아이브로우/헤드라인은 시안 고정값이다(HeroSection 내부 주석 참고 — company-intro
// page_contents 행이 구 디자인 기준으로 운영 중이라 title/subtitle/image_url을 그대로
// 매핑하면 회귀가 난다). page.body만 선택적으로 보조 카피에 얹는다.
// 대표이사 사진(원 director-portrait.png)은 고객 확정으로 제거했다(QA 행310) — 우측
// 사진 컬럼을 없애고 텍스트+카드 단일 컬럼을 섹션 중앙에 배치하는 구성으로 재배치했다
// (사진에 맞춰 flush하던 min-h/pt/pb 계산도 함께 정리).
// -------------------------------------------------------------------------
function HeroSection({ page }: { page: IntroPage }) {
  // 원장 카피(아이브로우/헤드라인)는 시안 고정값으로 못박는다. company-intro 슬러그의
  // page_contents 행은 운영 중인 구 디자인(제목=회사명 "위닝에듀", 부제=설명 문단, 이미지=박스형
  // 사진, sql/34_menu_navigation_sync.sql에서 실사용 확인) 기준으로 채워져 있어, 그 값을 새
  // 히어로의 아이브로우/헤드라인 슬롯에 그대로 매핑하면 위계가 다른 옛 카피가 노출된다.
  // 관리자 오버레이는 회귀 위험이 낮은 body(보조 카피, 선택 렌더)만 유지한다.
  const headline = "15년간 쌓아온 데이터로 빈틈없이 함께 가겠습니다.";
  const body = cleanText(page?.body);

  return (
    <section className="relative overflow-hidden bg-[#202f3f] py-16 sm:py-20 lg:py-28">
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-10 px-5 text-center sm:px-8">
        <div className="flex flex-col items-center">
          <h1 className="break-keep text-[1.75rem] font-semibold leading-[1.3] text-white sm:text-[2.125rem]">
            {headline}
          </h1>
          {body && (
            <p className="mt-4 max-w-md whitespace-pre-line break-keep text-[0.9375rem] leading-normal text-white/70">
              {body}
            </p>
          )}
        </div>

        {/* 카드 그리드 검산: 8장 확장(6→8, 사용자 확정) 후 데스크톱 4열 × 2행,
            gap 0(맞닿는 타일이 시안 핵심 구성) 유지. 모바일은 2열 × 4행,
            768px 이상은 4열 × 2행으로 조기 전환해 타일이 과도하게 부풀지 않게 한다. */}
        <div className="grid w-full max-w-142.5 grid-cols-2 sm:grid-cols-4 lg:grid-rows-2">
          {HERO_CARDS.filter(
            (card) => site.features.premium || !isPremiumLink(card.route),
          ).map((card) => {
            const content = (
              <>
                {card.best && (
                  <span className="absolute left-0 top-0 flex h-5 w-8.5 items-center justify-center bg-[#ff8e00] text-[0.625rem] font-medium leading-[1.3] text-white sm:h-6 sm:w-10 sm:text-[0.6875rem]">
                    BEST
                  </span>
                )}
                {/* button(수시카드)은 phrasing content만 허용해 <p>가 유효하지 않다 —
                    6장 전부 <span className="block">으로 통일한다. */}
                <span
                  className="block text-center text-[0.6875rem] font-semibold leading-[1.3] sm:text-[0.8125rem]"
                  style={{ color: card.tint, opacity: 0.95 }}
                >
                  {card.desc[0]}
                  <br />
                  {card.desc[1]}
                </span>
                {/* 타이틀 서체 — 파일 상단 주석 참고(font-grace, font-bold 필수 동반). */}
                <span className="mt-2 block text-center font-grace text-[1.375rem] font-bold leading-[1.3] text-white sm:text-[1.6875rem] lg:text-[1.6rem]">
                  {card.title}
                </span>
              </>
            );
            const className =
              "relative flex aspect-248/229 flex-col items-center justify-center gap-1 px-2 transition hover:brightness-110 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-[-0.125rem] focus-visible:outline-white";

            return card.route ? (
              <Link
                key={card.key}
                to={card.route}
                style={{ backgroundColor: card.bg }}
                className={className}
              >
                {content}
              </Link>
            ) : (
              <button
                key={card.key}
                type="button"
                onClick={alertServiceNotReady}
                style={{ backgroundColor: card.bg }}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------
// [2] Mission / Vision — 전면 사진 배경 + 좌측 2블록
// 시안엔 dim 오버레이 레이어가 없어 실측 렌더에서 텍스트가 사진 밝은 영역에 묻힌다
// — 시안에 없는 좌→우 그라디언트 스크림을 추가로 넣었다(근거를 여기 남긴다).
// Talents for Winning Edu 블록은 사용자 확정으로 삭제했다(미션·비전만 유지).
// -------------------------------------------------------------------------
const MISSION_BLOCKS = [
  {
    key: "mission",
    label: "Mission",
    lines: [
      "학생 한 명, 한명의 가능성을 믿고,",
      "데이터와 전문성으로 증명하는 위닝에듀입니다",
    ],
  },
  {
    key: "vision",
    label: "Vision",
    lines: [
      "데이터와 실적으로 증명하는",
      "대한민국 대표 입시 컨설팅 플랫폼입니다",
    ],
  },
];

function MissionSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[#111418] pt-14 pb-14 sm:pt-20 sm:pb-20 lg:pt-27.75 lg:pb-31.5">
      <img
        src={missionBg}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      {/* 시안에 없는 스크림 — 사진 위 흰 텍스트 대비 확보용. 6개 뷰포트 × 줄박스 전수 픽셀
          조사(WCAG AA 4.5:1, 본문 17~20px/weight 600이라 대형 텍스트 예외 없음)로 재조정했다.
          sm 이상(데스크톱): 램프 종점을 텍스트 우측 끝이 아니라 콘텐츠 컨테이너 우단까지
          늘렸다 — 종점이 텍스트 끝과 겹치던 이전 버전은 그 지점이 사진에서 가장 밝은 흰 서류
          다발(RGB 226~234)과 맞물려 60개 줄 중 최대 25줄이 AA 미달이었다. 우단까지 늘리면
          그 밝은 구간 전체가 스크림 안에 들어와 미달이 375 전용 4줄로 줄어든다. 중간 정지점
          3개(0.69/0.54/0.35)는 알파 선형 보간(0.625/0.45/0.275)보다 전 구간에서 더 진하게
          잡았다 — 밝은 배경 위에서는 알파 선형 보간이 램프 시작부의 지각 밝기(L*) 변화를 가장
          급격하게 만들어(증분 16.6/11.5/9.2/8.4) 그 구간이 "낭떠러지"로 보인다. 배경 휘도
          0.83 기준 L* 등간격으로 정지점을 재배치해 이 문제를 없앴다.
          sm 미만(모바일): object-fit: cover의 스케일 결정축이 375/768에서는 높이라 가로는
          47%만 남는 크롭이 되고(좌우 방향성이 의미 없음), 게다가 우측 알파가 0.20까지
          떨어진다. 좌우 그라디언트 대신 평면 스크림(0.75)으로 대체한다. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 sm:hidden"
        style={{ background: "rgba(0,0,0,0.75)" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 hidden sm:block"
        style={
          {
            "--c": "min(100%, 72.75rem)",
            "--x0": "calc(50% - var(--c) / 2)",
            background:
              "linear-gradient(to right, rgba(0,0,0,0.80) 0, rgba(0,0,0,0.80) var(--x0), rgba(0,0,0,0.69) calc(var(--x0) + var(--c) * 0.25), rgba(0,0,0,0.54) calc(var(--x0) + var(--c) * 0.50), rgba(0,0,0,0.35) calc(var(--x0) + var(--c) * 0.75), rgba(0,0,0,0.12) calc(var(--x0) + var(--c)), rgba(0,0,0,0.12) 100%)",
          } as CSSProperties
        }
      />

      <div className="mx-auto flex w-full max-w-content flex-col px-5 sm:px-8">
        {MISSION_BLOCKS.map((block, index) => (
          <div
            key={block.key}
            className={index === 0 ? "" : "mt-5 sm:mt-7 lg:mt-10"}
          >
            {/* 구분선 — 첫 블록 위에는 없다. */}
            {index > 0 && (
              <span
                aria-hidden="true"
                className="mb-5 ml-0 block h-9 w-0.5 bg-[#D8D8D8] sm:ml-3 sm:mb-7 sm:h-12 lg:ml-4 lg:mb-10 lg:h-16"
              />
            )}
            <p className="text-[0.75rem] font-medium leading-[1.3] text-white sm:text-[0.8125rem] lg:text-[0.875rem]">
              {block.label}
            </p>
            <p
              className="mt-4 max-w-145.75 whitespace-pre-line break-keep text-[1.0625rem] font-semibold leading-[1.45] text-white sm:text-[1.125rem] lg:text-[1.25rem] lg:leading-[1.3]"
              style={{ textShadow: "0 0.1875rem 0.9375rem rgba(0,0,0,0.4)" }}
            >
              {block.lines.join("\n")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------
// [3] 사업영역 — 흰 배경 카드 3장 (3D 일러스트 + 타이틀 + 본문)
// -------------------------------------------------------------------------
function BusinessSection() {
  return (
    <section className="bg-white pt-16 pb-16 sm:pt-20 lg:pt-40 lg:pb-41.75">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <p className="text-center text-[0.875rem] font-medium leading-[1.3] text-primary sm:text-[1rem]">
          사업영역
        </p>
        <h2 className="mx-auto mt-5 max-w-xl break-keep text-center text-[1.5rem] font-semibold leading-[1.3] text-ink sm:text-[1.75rem] lg:text-[2rem]">
          위닝에듀는 기술을 기반으로 <br className="hidden lg:inline" />
          경계없는 입시지원을 제공합니다
        </h2>

        {/* 3열 폭 검산: (1100 − 30×2) / 3 = 346.7px, 시안 370×0.937(카드폭 정규화 비율) = 346.7px ✓
            (폰트를 시안 1:1로 유지하려면 컨테이너를 max-w-content로 정규화하고 카드 내부는
            카드폭 비율 0.937로 환산해야 한다). 768~1023 구간은 sm:grid-cols-2로
            채워 카드 한 장이 컨테이너 전폭을 차지해 여백만 남는 것을 막는다. */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:mt-16.75 lg:grid-cols-3 lg:gap-7.5">
          {BUSINESS_CARDS.filter(
            (card) => site.features.premium || !card.premiumOnly,
          ).map((card) => (
            <div
              key={card.key}
              className="flex flex-col rounded-perf-modal bg-white px-6 pb-8 pt-7 shadow-[0_0.125rem_0.25rem_0.125rem_rgba(215,215,215,0.25)] lg:rounded-3xl lg:px-10 lg:pb-12 lg:pt-10.5"
            >
              <img
                src={card.image}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-38 w-31 object-contain lg:h-50.5 lg:w-41.25"
              />
              <p className="mt-4 text-[1.125rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink lg:text-[1.5rem]">
                {card.title}
              </p>
              <p className="mt-7 whitespace-pre-line break-keep text-[0.9375rem] font-medium leading-[1.4] text-ink lg:text-[1.25rem]">
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------
// [4] Location + 연계 협력기관
// -------------------------------------------------------------------------
// 캠퍼스 9곳 중 6곳(세종·화명·센텀·천안·제주·대전)은 실제 네이버 지도 단축링크(CAMPUS_CARDS의
// href)를 받아 외부 새 탭으로 연다. 나머지 3곳(대치·분당·청담)은 아직 지점이 열리지 않아
// href가 없다(comingSoon) — 이 카드는 <button>으로 남기고 클릭 시 "오픈예정입니다." 전용
// 안내만 띄운다(PartnerCard의 alertServiceNotReady "준비중" 문구와 의도가 달라 구분했다).
// href 유무로 <a>/<button>을 분기하되(as-element), 카드 내부 구조(span 트리)·치수·간격은
// 두 분기에서 동일하게 공유해 시각 형태 차이가 없게 한다.
function alertComingSoon() {
  alert("오픈예정입니다.");
}

type CampusCardData = (typeof CAMPUS_CARDS)[number];

function CampusCard({ campus }: { campus: CampusCardData }) {
  const hasLink = Boolean(campus.href);

  const content = (
    <>
      <span className="block">
        <span className="block text-[0.75rem] leading-[1.3] text-primary">
          분점
        </span>
        <span className="mt-1.5 block break-keep text-[1.125rem] font-semibold leading-[1.3] text-ink sm:text-[1.25rem] lg:text-[1.5rem]">
          {campus.name}
        </span>
      </span>
      {/* 원형 화살표 버튼 — 헤더 행이 아닌 주소와 같은 하단 행에 items-end로 배치(시안:
          우측 하단 정렬). 오픈예정 카드는 원을 옅은 회색 #EDEDED(섹션 배경 #F6F7FB와
          카드 보더 #D9D9D9 사이 톤, 페이지 팔레트 안에서 선택) + 중간 회색 화살표
          #767676로 바꿔, 활성 카드의 "검은 원(#323232) + 흰 화살표"와 채움 자체가
          역전되도록 한다. 화살표 대 원 배경 대비는 약 4.2:1로 형태가 또렷이 읽히면서,
          두 상태를 나란히 놓았을 때 "옅은 원 = 아직 누를 단계가 아님"이 한눈에
          구분된다. */}
      <span className="mt-3 flex items-end justify-between gap-3">
        <span className="block min-h-[2.4rem] break-keep text-[0.8125rem] leading-[1.3] text-ink sm:text-[0.875rem]">
          {campus.comingSoon ? "오픈예정" : campus.address.join(", ")}
        </span>
        <span
          aria-hidden="true"
          className={
            hasLink
              ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#323232] text-white transition group-hover:bg-primary sm:h-8.5 sm:w-8.5"
              : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDEDED] text-[#767676] transition sm:h-8.5 sm:w-8.5"
          }
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
    </>
  );

  if (!hasLink) {
    // disabled 대신 실제로 동작하는 button — 클릭하면 "오픈예정입니다." 알럿이 뜨므로
    // disabled 속성은 붙이지 않는다(aria-disabled도 붙이지 않음: 클릭이 막혀 있지 않다).
    // hover 시 보더/배경이 네이비로 바뀌던 강조도 제거해 "누를 수 있어 보이는" 오인을 줄인다.
    return (
      <button
        type="button"
        onClick={alertComingSoon}
        className="group flex min-h-41 w-full flex-col justify-between rounded-xl border border-[#D9D9D9] bg-white px-5 py-5 text-left transition sm:px-6 sm:py-6 lg:px-8.5 lg:py-6"
      >
        {content}
      </button>
    );
  }

  return (
    <a
      href={campus.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-41 w-full flex-col justify-between rounded-xl border border-[#D9D9D9] bg-white px-5 py-5 text-left transition hover:border-primary hover:bg-[rgba(233,247,255,0.4)] sm:px-6 sm:py-6 lg:px-8.5 lg:py-6"
    >
      {content}
      <span className="sr-only"> (새 창에서 열림)</span>
    </a>
  );
}

type PartnerCardData = (typeof PARTNER_CARDS)[number];

function PartnerCard({ partner }: { partner: PartnerCardData }) {
  return (
    <div className="flex min-h-perf-pill flex-col justify-between rounded-xl border border-[#D9D9D9] bg-white px-6 pb-6 pt-7.25 lg:min-h-93 lg:px-5.75 lg:pb-6.25">
      <div>
        <p className="whitespace-pre-line break-keep text-[1.25rem] font-semibold leading-[1.3] text-ink lg:text-[1.5rem]">
          {partner.title}
        </p>
        <p className="mt-2 text-[0.8125rem] leading-[1.3] text-ink sm:text-[0.875rem]">
          {partner.subtitle}
        </p>
        <span
          aria-hidden="true"
          className="mt-4.25 block h-0.25 w-full bg-line"
        />
        <div className="mt-4.5 flex flex-col gap-3">
          {partner.links.map((link) => {
            const linkClassName =
              "flex items-center justify-between text-left text-[0.8125rem] font-medium leading-[1.3] text-ink hover:text-primary sm:text-[0.875rem]";
            const linkContent = (
              <>
                <span>{link.label}</span>
                <span className="inline-flex items-center gap-1 border-b border-ink">
                  바로가기
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </>
            );

            // href 없는 데이터가 다시 들어올 경우를 위한 방어적 폴백 — 지금 5개는 전부
            // href가 있어 이 분기를 타지 않는다.
            if (!link.href) {
              return (
                <button
                  key={link.label}
                  type="button"
                  onClick={alertServiceNotReady}
                  className={linkClassName}
                >
                  {linkContent}
                </button>
              );
            }

            return (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${partner.brand} ${link.label} 바로가기 (새 창에서 열림)`}
                className={linkClassName}
              >
                {linkContent}
                <span className="sr-only"> (새 창에서 열림)</span>
              </a>
            );
          })}
        </div>
      </div>
      <img
        src={partner.logo}
        alt=""
        loading="lazy"
        decoding="async"
        className={`mt-6 self-end ${partner.logoWidth} max-w-full object-contain opacity-30`}
      />
    </div>
  );
}

function LocationSection() {
  return (
    <section className="bg-[#F6F7FB] pt-14 pb-14 sm:pt-20 sm:pb-20 lg:pt-29 lg:pb-30.25">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* [A] Location 블록 */}
        <p className="text-[1rem] font-medium leading-[1.3] text-primary sm:text-[1.125rem]">
          Location
        </p>
        <h2 className="mt-4 max-w-160 break-keep text-[1.375rem] font-semibold leading-[1.3] text-ink sm:text-[1.5rem]">
          전국 어디서든, 필요한 입시 관리를 한곳에서{" "}
          <br className="hidden sm:inline" />
          여러 지점의 센터와 전문 연계기관을 통해 입시의 전 영역을 지원합니다.
        </h2>

        {/* 캠퍼스 카드 그리드 — 375: 1열 / 768: 2열 / 1024↑: 3열 */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-3.5 lg:mt-10.75 lg:grid-cols-3 lg:gap-4">
          {CAMPUS_CARDS.map((campus) => (
            <CampusCard key={campus.key} campus={campus} />
          ))}
        </div>

        {/* [B] 연계 협력기관 블록 */}
        <h2 className="mt-16 text-[1.375rem] font-semibold leading-[1.3] text-ink sm:mt-20 sm:text-[1.5rem] lg:mt-23">
          연계 협력기관
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:mt-7 lg:grid-cols-3">
          {PARTNER_CARDS.map((partner) => (
            <PartnerCard key={partner.key} partner={partner} />
          ))}
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------
// [5] 회사소식 — 최신 5건 미리보기 + "더보기" 링크 + 기존 ?id= 상세뷰
//
// 전체 목록(검색·페이지네이션·조회수)은 Figma 시안 2235:3536 이 독립 1920×2109 전체
// 페이지(헤더/제목/검색/표/페이지네이션/푸터)라 랜딩 하단 섹션에 넣을 수 있는 형태가 아니어서
// 신규 라우트 /company-news/list (BoardListPage 소비자)로 이관했다. 이 파일에 있던
// "더보기 → expanded 펼침 + 섹션 내 검색 입력 + 총 N건" 상태 기계는 그 이관과 함께 제거했고,
// 더보기는 요소만 <button> → <Link to="/company-news/list"> 로 바뀌었다(시각 형태 동일).
// 이관 전 주석이 기록해 둔 두 판단은 여기 계보로 남긴다:
//   · "더보기" 색은 시안 #D7D7D7 이 흰 배경 대비 AA 크게 미달 → #A0A0A0 으로 상향한 값이다.
//   · 노출 조건을 rows.length > 0 으로 둔다(5건 이하인 DB 상태에서도 전체 목록에 도달 가능).
//
// 상세뷰(?id=)는 그대로 유지한다 — 신규 목록의 제목 링크도 /company-news?id=<id> 로 여기에
// 되돌아오므로, 이 파일이 계속 회사소식 상세의 유일한 렌더 지점이다(§2 설계 결정).
// -------------------------------------------------------------------------
function NewsDetail({ row, onBack }: { row: BoardRow; onBack: () => void }) {
  const images = normalizeArray(row.image_urls) as string[];
  const finalImages = images.length
    ? images
    : row.image_url
      ? [row.image_url as string]
      : [];
  const attachments = normalizeArray(row.attachments) as Attachment[];

  return (
    <section className="bg-white pt-14 pb-16 sm:pt-20 lg:pt-18.75 lg:pb-47.75">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-ink hover:text-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-4.5 w-4.5" aria-hidden="true" />
          회사소식 목록으로
        </button>

        <article className="border-y border-[#D9D9D9]">
          <header className="border-b border-[#EFEFEF] px-1 py-8">
            {/* 여기에는 '중요' 칩이 없다 — 칩 노출은 게시판(BoardTable, 시안 2235:3741) 전용으로
                사용자가 확정했고, 회사소식 상세/목록에 있던 칩은 그에 따라 제거했다.
                is_pinned 는 계속 살아 있지만 이제 정렬(상단 고정)에만 쓰인다(fetch 의 order 참조). */}
            <p className="mb-3 text-sm font-medium text-[#767676]">
              {formatBoardDate(row.created_at)}
            </p>
            <h1 className="break-keep text-[1.5rem] font-bold leading-[1.35] text-ink sm:text-[1.75rem]">
              {row.title}
            </h1>
          </header>

          <div className="min-h-80 px-1 py-12">
            {finalImages.length > 0 && (
              <div className="mx-auto mb-10 max-w-230 space-y-4">
                {withDedupedKeys(finalImages).map(
                  ({ item: url, key }, index) => (
                    <img
                      key={key}
                      src={url}
                      alt={`${row.title} 이미지 ${index + 1}`}
                      className="w-full rounded-2xl object-contain"
                    />
                  ),
                )}
              </div>
            )}

            {renderContent(row.content as string | null | undefined)}

            {(attachments.length > 0 || Boolean(row.file_url)) && (
              <div className="mt-12 rounded-xl border border-[#D9D9D9] bg-surface-footer p-5">
                <p className="mb-3 text-sm font-bold text-ink">첨부파일</p>
                <div className="space-y-2">
                  {withDedupedKeys(
                    attachments.filter((file) => getAttachmentUrl(file)),
                    getAttachmentUrl,
                  ).map(({ item: file, key }) => (
                    <a
                      key={key}
                      href={getAttachmentUrl(file)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-[#D9D9D9] bg-white px-4 py-3 text-sm font-semibold text-ink hover:border-primary"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {getAttachmentName(file)}
                    </a>
                  ))}

                  {attachments.length === 0 && Boolean(row.file_url) && (
                    <a
                      href={row.file_url as string}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-[#D9D9D9] bg-white px-4 py-3 text-sm font-semibold text-ink hover:border-primary"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {(row.file_name as string) || "첨부파일 다운로드"}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function NewsRow({ row, onSelect }: { row: BoardRow; onSelect: () => void }) {
  return (
    // items-stretch(모바일 flex-col 기준)로 제목 span의 교차축 폭을 컨테이너 전체로
    // 고정해야 truncate(nowrap)가 min-content=max-content로 폭을 결정해버려 카드가 전역
    // 가로 스크롤을 유발하던 문제가 해소된다. 헤딩 태그(h3) 대신 span을 쓰는 이유는 button의
    // 콘텐츠 모델이 phrasing content만 허용해서다(h3는 flow content).
    // 제목 span 은 원래 '중요' 칩과 나란히 놓느라 flex 래퍼 안에 한 겹 더 들어 있었다.
    // 칩이 게시판 전용으로 확정돼 빠지면서 형제가 없어졌고, 래퍼는 min-w-0/flex-1/truncate 를
    // 제목 span 에 그대로 옮기고 없앴다(렌더 결과 동일).
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col items-stretch gap-1 py-3 text-left transition hover:text-primary sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0"
    >
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] leading-[1.4] text-ink sm:text-[1rem]">
        {row.title}
      </span>
      <span className="shrink-0 text-[0.75rem] leading-[1.4] text-[#767676] sm:text-[1rem] sm:text-ink">
        {formatBoardDate(row.created_at)}
      </span>
    </button>
  );
}

function NewsSection({
  rows,
  loading,
  onSelect,
}: {
  rows: BoardRow[];
  loading: boolean;
  onSelect: (id: BoardRow["id"]) => void;
}) {
  const visibleRows = rows.slice(0, NEWS_PREVIEW_COUNT);

  return (
    <section className="bg-white pt-14 pb-16 sm:pt-20 lg:pt-18.75 lg:pb-47.75">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <div className="flex items-end justify-between">
          <h2 className="text-[1.5rem] font-bold leading-[1.4] text-ink sm:text-[1.75rem] lg:text-[2rem]">
            회사소식
          </h2>
          {/* "더보기" — 전체 목록 페이지로 보낸다(색·크기·밑줄은 이관 전 버튼 그대로. 근거는
              섹션 상단 주석 참고). */}
          {rows.length > 0 && (
            <Link
              to="/company-news/list"
              className="text-[0.8125rem] font-normal leading-[1.3] text-[#A0A0A0] underline hover:text-ink sm:text-[0.9375rem]"
            >
              더보기
            </Link>
          )}
        </div>
        <span
          aria-hidden="true"
          className="mt-4.5 block h-0.25 w-full bg-ink"
        />

        <div className="mt-9 flex flex-col gap-3 sm:gap-4.5">
          {loading ? (
            <div className="py-16 text-center text-sm font-medium text-[#767676]">
              회사소식을 불러오는 중입니다.
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-16 text-center text-sm font-medium text-[#767676]">
              등록된 회사소식이 없습니다.
            </div>
          ) : (
            visibleRows.map((row) => (
              <NewsRow
                key={row.id}
                row={row}
                onSelect={() => onSelect(row.id)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default function CompanyNews() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("id");
  const [introPage, setIntroPage] = useState<IntroPage>(null);
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 상세뷰에서 조회수를 이미 올린 글 id. StrictMode의 effect 이중 실행과 리렌더 재호출을
  // 모두 막는다(id가 바뀌면 다시 올린다). state가 아니라 ref인 이유는 이 값의 변화가
  // 화면을 바꾸지 않아서다.
  const viewedIdRef = useRef<string | null>(null);

  // ?id= 변화(상세 진입·목록 복귀 모두)에서 스크롤을 최상단으로 되돌린다. 회사소식 섹션이
  // 페이지 하단(~5000px)에 있어 setSearchParams만으로는 pathname이 안 바뀌어
  // App.jsx의 ScrollToTop(pathname 전용)이 반응하지 않는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) selectedId는 effect 안에서 읽지 않는 트리거 전용 값 — ?id= 가 바뀔 때마다 스크롤을 맨 위로 되돌리기 위한 재실행 신호다.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedId]);

  useEffect(() => {
    let alive = true;

    async function loadPage() {
      setLoading(true);

      const [introResult, newsResult] = await Promise.all([
        supabase
          .from("page_contents")
          .select("*")
          .eq("slug", "company-intro")
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("company_news")
          .select("*")
          .eq("is_active", true)
          .order("is_pinned", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
      ]);

      if (!alive) return;

      if (introResult.error) {
        console.error("회사소개 조회 오류:", introResult.error);
      } else {
        setIntroPage((introResult.data as IntroPage) || null);
      }

      if (newsResult.error) {
        console.error("회사소식 조회 오류:", newsResult.error);
        setRows([]);
      } else {
        setRows((newsResult.data || []) as BoardRow[]);
      }

      setLoading(false);
    }

    loadPage();

    return () => {
      alive = false;
    };
  }, []);

  const selectedRow = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((row) => String(row.id) === String(selectedId)) || null;
  }, [rows, selectedId]);

  // 조회수 +1 — 상세뷰가 실제로 글을 표시하는 순간에만 1회. rows 로딩이 끝나기 전에는
  // selectedRow가 null이라(= 아직 아무것도 안 보여준 상태) 호출하지 않는다.
  // incrementBoardView는 RPC 미배포·네트워크 실패를 포함해 어떤 경우에도 throw하지 않으므로
  // (boardData.js 계약) 상세 화면 렌더에 영향을 주지 않는다. await 하지 않는 것도 의도적이다.
  useEffect(() => {
    if (!selectedId || !selectedRow) return;
    if (viewedIdRef.current === selectedId) return;

    // 실제 호출 전에 먼저 찍어야 StrictMode 이중 실행의 두 번째 호출이 걸러진다.
    viewedIdRef.current = selectedId;
    incrementBoardView(BOARD_SOURCES.companyNews, selectedRow.id);
  }, [selectedId, selectedRow]);

  // ?id= 딥링크 진입 시 rows 로딩이 끝나기 전까지는 selectedRow가 null이라 아래 분기를 타지
  // 못하고 전체 랜딩(히어로~회사소식, mission-bg 등 수 MB 에셋 포함)이 먼저 렌더됐다가 로딩
  // 완료 후 상세로 전환되는 플래시가 있었다. 로딩 중에는 랜딩 대신 플레이스홀더만 보여준다.
  if (selectedId && loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-sm font-medium text-[#767676]">불러오는 중입니다.</p>
      </main>
    );
  }

  if (selectedId && selectedRow) {
    return (
      <main className="min-h-screen bg-white pt-16">
        <NewsDetail row={selectedRow} onBack={() => setSearchParams({})} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection page={introPage} />
      <MissionSection />
      <BusinessSection />
      <LocationSection />
      <NewsSection
        rows={rows}
        loading={loading}
        onSelect={(id) => setSearchParams({ id: String(id) })}
      />
    </main>
  );
}
