import type { ReactNode } from "react";
import { Link } from "react-router";

// §1 히어로 — 풀폭 배경사진(bgSrc) 위 중앙 텍스트 블록.
//
// 가독성 장치는 시안의 hero-glow.svg(흰→투명 타원, 가장자리가 너무 묽어 본문 2행이 사진
// 어두운 영역에 걸치면 읽히지 않았음) 대신 CSS 방사형 라이트로 교체했다. 텍스트 블록
// 범위는 흰색 불투명도 0.28~0.34 로 아주 옅게 밝히고(사진 질감이 비치도록), 넓은 반경으로 완만히
// 투명해져 사진의 손·연필·종이 디테일이 그대로 보인다. 어두운 텍스트(ink-strong/ink)는
// 그대로 — 라이트 위에서 AA 대비 확보.
//
// glowClassName — Tailwind는 소스의 완성된 리터럴 클래스만 스캔하므로 `bg-[${...}]` 런타임
// 조합은 컴파일되지 않는다. 페이지가 완성된 Tailwind 리터럴 클래스 문자열을 통째로 주입한다
// (AdmissionConsultingA/S.tsx 상단 상수 참고 — 각 페이지가 자기 배경사진 분위기에 맞는 라이트를
// 직접 소유해서 PremiumHero와의 결합도를 낮춘다).
//
// align — 기본 "center"(A/S/대학원입학과 완전히 동일한 중앙정렬 렌더). "left"는 해외명문대
// 진학컨설팅 시안 전용: 텍스트 블록이 사이트 표준 컨테이너 왼쪽에 붙고 좌측정렬된다.
// ctaClassName — CTA 버튼 스타일 전체 override. 기본은 기존 ink-strong pill 그대로.
type PremiumHeroProps = {
  title: ReactNode;
  description: ReactNode;
  cta: { label: string; to: string };
  bgSrc: string;
  /** 완성된 Tailwind 리터럴 클래스(방사형 라이트 배경) — 페이지가 배경사진에 맞춰 주입한다 */
  glowClassName: string;
  /** 기본은 어두운 텍스트(text-ink-strong). 밝은 라이트가 아닌 배경(예: 진초록 타일) 등
   * 반전이 필요한 페이지만 재정의한다. */
  titleClassName?: string;
  descriptionClassName?: string;
  ctaClassName?: string;
  /** 기본 "center". "left"는 해외명문대 시안 전용 좌측정렬 레이아웃. */
  align?: "center" | "left";
  /** 배너 이미지에 버튼이 그려진 페이지 전용. 이미지 비율(1920:772)을 고정하고 그려진 버튼 위치
   * (이미지 기준 %)에 투명 링크를 덮는다. md 미만은 이미지 아래에 코드 CTA 버튼을 보인다. */
  ctaOverlay?: { left: string; top: string; width: string; height: string };
};

const DEFAULT_TITLE_CLASS =
  "break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[2rem]";
const DEFAULT_DESCRIPTION_CLASS =
  "mt-4 break-keep text-[1rem] font-medium leading-[1.6] text-ink-strong sm:text-[1.25rem] lg:text-[1.5rem]";
const DEFAULT_CTA_CLASS =
  "mt-8 inline-flex items-center justify-center rounded-full bg-ink-strong px-[3.75rem] py-[1.5rem] text-[1.25rem] font-medium text-white transition-colors hover:bg-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none";

export default function PremiumHero({
  title,
  description,
  cta,
  bgSrc,
  glowClassName,
  titleClassName,
  descriptionClassName,
  ctaClassName,
  align = "center",
  ctaOverlay,
}: PremiumHeroProps) {
  const isLeft = align === "left";

  if (ctaOverlay) {
    return (
      <section className="w-full">
        <div className="relative md:aspect-[1920/772]">
          <img
            src={bgSrc}
            alt=""
            fetchPriority="high"
            className="block h-auto w-full md:h-full md:object-fill"
          />
          <h1 className={titleClassName ?? DEFAULT_TITLE_CLASS}>{title}</h1>
          <p className={descriptionClassName ?? DEFAULT_DESCRIPTION_CLASS}>
            {description}
          </p>
          <Link
            to={cta.to}
            aria-label={cta.label}
            style={ctaOverlay}
            className="absolute hidden rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:block"
          >
            <span className="sr-only">{cta.label}</span>
          </Link>
        </div>
        <div className="mx-auto w-full max-w-content px-5 pb-8 sm:px-8 md:hidden">
          <Link to={cta.to} className={`${DEFAULT_CTA_CLASS} md:hidden`}>
            {cta.label}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`relative flex h-[28rem] w-full items-center overflow-hidden sm:h-[36rem] lg:h-[46.9375rem] ${isLeft ? "justify-start" : "justify-center"}`}
    >
      <img
        src={bgSrc}
        alt=""
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* 방사형 라이트 — 텍스트 블록(최대 38.8rem)보다 넉넉한 타원, 모바일은 폭 대비 더 크게.
          좌측정렬(align="left")은 방사형 대신 페이지가 넘긴 클래스로 좌→우 그라디언트 등을
          쓸 수 있게 위치를 좌측 기준으로 이동한다. */}
      <div
        aria-hidden="true"
        className={
          isLeft
            ? `pointer-events-none absolute inset-0 ${glowClassName}`
            : `pointer-events-none absolute left-1/2 top-1/2 h-[160%] w-[260%] -translate-x-1/2 -translate-y-1/2 ${glowClassName} sm:w-[180%] lg:h-[200%] lg:w-[130%]`
        }
      />
      {isLeft ? (
        <div className="relative z-10 mx-auto w-full max-w-content px-5 text-left sm:px-8">
          <div className="max-w-[35rem]">
            <h1 className={titleClassName ?? DEFAULT_TITLE_CLASS}>{title}</h1>
            <p className={descriptionClassName ?? DEFAULT_DESCRIPTION_CLASS}>
              {description}
            </p>
            <Link to={cta.to} className={ctaClassName ?? DEFAULT_CTA_CLASS}>
              {cta.label}
            </Link>
          </div>
        </div>
      ) : (
        <div className="relative z-10 mx-auto w-full max-w-[38.8125rem] px-5 text-center sm:px-8">
          <h1 className={titleClassName ?? DEFAULT_TITLE_CLASS}>{title}</h1>
          <p className={descriptionClassName ?? DEFAULT_DESCRIPTION_CLASS}>
            {description}
          </p>
          <Link to={cta.to} className={ctaClassName ?? DEFAULT_CTA_CLASS}>
            {cta.label}
          </Link>
        </div>
      )}
    </section>
  );
}
