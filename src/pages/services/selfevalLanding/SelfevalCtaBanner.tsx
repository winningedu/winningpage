// 페이지 맨 아래 다크 CTA 배너. 버튼 규격은 히어로 CTA 와 같다.
type SelfevalCtaBannerProps = {
  title: string;
  ctaLabel: string;
  onCta: () => void;
};

export default function SelfevalCtaBanner({
  title,
  ctaLabel,
  onCta,
}: SelfevalCtaBannerProps) {
  return (
    <section className="bg-[#172437] py-16 sm:py-20 lg:py-35.25">
      <div className="mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        <h2 className="break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-white sm:text-[2.25rem] lg:text-[2.75rem]">
          {title}
        </h2>
        <button
          type="button"
          onClick={onCta}
          className="mt-8 inline-flex h-14 w-full max-w-75 items-center justify-center rounded-[1.875rem] bg-primary px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:mt-10 sm:h-17 sm:text-[1.25rem] lg:mt-15"
        >
          {ctaLabel}
        </button>
      </div>
    </section>
  );
}
