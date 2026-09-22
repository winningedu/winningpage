import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  PREMIUM_GRADUATE_GREEN,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// §10 하단 CTA 배너 — 기본(A 페이지, S 프로그램 안내): 풀폭 이미지 배경 + 어두운 오버레이 +
// 중앙 흰 텍스트 + 텍스트 링크. 높이 493px(=30.8125rem, 시안 실측).
// variant="light" (S 페이지, A 프로그램 안내): 사진 없음, 베이지 배경, 검정 헤딩,
// 골드 pill 버튼. bgSrc 는 light 에서는 사용하지 않는다.
// sub / secondaryCta — 대학원입학 시안: 채움 버튼("이용 신청하기") + 아웃라인 버튼(tel: 전화상담)
// 2개 구성. 둘 다 옵셔널이라 기존 단일 CTA 사용처(A/S 페이지)는 렌더 결과가 그대로다.
// primaryTone — light variant 주 버튼 색. 기본 "gold"(기존 A/S 렌더 그대로), "brand"는
// 대학원입학 시안의 진초록(PREMIUM_GRADUATE_GREEN) 필 버튼, "navy"는 특목고입학 시안의
// --color-primary(#013262) 필 버튼.
// cta.href — 특목고입학 시안의 "카카오톡 상담" 버튼처럼 외부 링크(카카오 채널 등)로 보내야
// 하는 주 CTA용. href가 있으면 내부 라우팅 Link 대신 새 탭 <a target="_blank"> 로 렌더한다.
// 기존 사용처는 전부 to만 넘기므로 렌더 결과가 그대로다.
// eyebrow — 국제・해외고 국내대 입학컨설팅 시안의 "STUDY ABROAD, WIN HOME" 같은 title 위
// 영문 스몰캡스 라벨. light variant 전용, 옵셔널이라 기존 사용처는 렌더 결과가 그대로다.
type PremiumCtaBannerProps = {
  title: ReactNode;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  cta: { label: string; to?: string | undefined; href?: string | undefined };
  secondaryCta?: { label: string; href: string } | undefined;
  /** public/images/premium/cta-s-program-bg.webp — 페이지가 명시적으로 넘긴다. variant="light" 에선 불필요. */
  bgSrc?: string;
  /** light: 베이지 배경+pill(S→A 안내). plain: 흰 배경+텍스트 링크(시안 S 하단 첫 배너). */
  variant?: "light" | "plain";
  /** light variant 전용. 기본 "gold" — 지정하지 않으면 기존 렌더와 완전히 동일하다. */
  primaryTone?: "gold" | "brand" | "navy";
};

// tone별 주 버튼 클래스 — brand는 배경을 style(PREMIUM_GRADUATE_GREEN)로 별도 적용하므로
// 여기엔 배경색 유틸을 넣지 않는다(bg-gold/bg-primary만 각자 tone 클래스에 포함).
const PRIMARY_CTA_CLASS_BY_TONE: Record<
  NonNullable<PremiumCtaBannerProps["primaryTone"]>,
  string
> = {
  gold: "rounded-full bg-gold px-[3.75rem] py-[1.5rem] text-[1.25rem] font-semibold leading-[1.4] text-ink-strong transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none",
  brand:
    "rounded-full px-[3.75rem] py-[1.5rem] text-[1.25rem] font-semibold leading-[1.4] text-white transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none",
  navy: "rounded-full bg-primary px-[3.75rem] py-[1.5rem] text-[1.25rem] font-semibold leading-[1.4] text-white transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none",
};

export default function PremiumCtaBanner({
  title,
  eyebrow,
  sub,
  cta,
  secondaryCta,
  bgSrc,
  variant,
  primaryTone = "gold",
}: PremiumCtaBannerProps) {
  if (variant === "plain") {
    return (
      <section
        className={`flex w-full items-center justify-center bg-white px-5 ${PREMIUM_SECTION_PADDING_CLASS}`}
      >
        <div className="flex flex-col items-center gap-8 text-center">
          <h2 className="break-keep text-[2rem] font-semibold leading-[1.4] text-ink-strong">
            {title}
          </h2>
          {cta.to ? (
            <Link
              to={cta.to}
              className="rounded-sm text-[1.25rem] font-medium leading-[1.4] text-ink-strong underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {cta.label}
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  if (variant === "light") {
    return (
      <section
        className={`flex w-full items-center justify-center bg-surface-beige px-5 ${PREMIUM_SECTION_PADDING_CLASS}`}
      >
        <div className="flex flex-col items-center gap-8 text-center">
          <div>
            {eyebrow ? (
              <p className="mb-2 break-keep text-[0.875rem] font-medium uppercase leading-[1.4] tracking-[0.08em] text-ink-natural [font-variant:small-caps]">
                {eyebrow}
              </p>
            ) : null}
            <h2 className="break-keep text-[2rem] font-semibold leading-[1.4] text-ink-strong">
              {title}
            </h2>
            {sub ? (
              <p className="mt-3 break-keep text-[1rem] font-medium leading-[1.5] text-ink">
                {sub}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {cta.href ? (
              <a
                href={cta.href}
                target="_blank"
                rel="noopener noreferrer"
                style={
                  primaryTone === "brand"
                    ? { backgroundColor: PREMIUM_GRADUATE_GREEN }
                    : undefined
                }
                className={PRIMARY_CTA_CLASS_BY_TONE[primaryTone]}
              >
                {cta.label}
              </a>
            ) : cta.to ? (
              <Link
                to={cta.to}
                style={
                  primaryTone === "brand"
                    ? { backgroundColor: PREMIUM_GRADUATE_GREEN }
                    : undefined
                }
                className={PRIMARY_CTA_CLASS_BY_TONE[primaryTone]}
              >
                {cta.label}
              </Link>
            ) : null}
            {secondaryCta ? (
              <a
                href={secondaryCta.href}
                className="rounded-full border border-line bg-white px-10 py-[1.5rem] text-[1.25rem] font-semibold leading-[1.4] text-ink-strong transition hover:bg-surface-footer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                {secondaryCta.label}
              </a>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex h-[30.8125rem] w-full items-center justify-center overflow-hidden px-5">
      {bgSrc ? (
        <img
          src={bgSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <h2 className="break-keep text-[2rem] font-semibold leading-[1.4] text-white">
          {title}
        </h2>
        {cta.to ? (
          <Link
            to={cta.to}
            className="text-[1.25rem] font-medium leading-[1.4] text-white underline-offset-4 hover:underline rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            {cta.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
