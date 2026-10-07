import { useState } from "react";

// 실제 서비스 화면 3장을 브라우저 프레임에 담아 점으로 넘겨 보는 미리보기. 자동 재생 없음.
type PreviewSlide = { src: string; alt: string };

type SelfevalScreenPreviewProps = {
  slides: PreviewSlide[];
};

export default function SelfevalScreenPreview({
  slides,
}: SelfevalScreenPreviewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = slides[activeIndex];

  if (!active) return null;

  return (
    <div className="mt-8 sm:mt-10 lg:mt-10">
      <div className="px-0 lg:px-8.75">
        <div className="overflow-hidden rounded-[0.3125rem] bg-white shadow-[0_0_0.0625rem_rgba(0,0,0,0.7),0_1.25rem_1.875rem_rgba(0,0,0,0.3),0_0.625rem_3.125rem_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-3 border-b border-[#E5E7EB] bg-[#DFE1E5] px-4 py-2.5">
            <span className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ED6A5E]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#F6BE4F]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#62C554]" />
            </span>
            <span className="flex-1 truncate rounded-full bg-[#F1F3F4] px-4 py-1 text-center text-[0.75rem] text-[#767676]">
              https://www.winningedu.com
            </span>
          </div>
          <img
            key={active.src}
            src={active.src}
            alt={active.alt}
            className="block aspect-1920/1005 w-full object-cover object-top"
          />
        </div>
      </div>

      <fieldset
        aria-label="화면 미리보기 선택"
        className="mt-5 flex justify-center gap-2"
      >
        {slides.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`${i + 1}번째 화면`}
            aria-pressed={i === activeIndex}
            onClick={() => setActiveIndex(i)}
            className={`h-2.25 rounded-full transition-all ${
              i === activeIndex ? "w-6.5 bg-primary" : "w-2.25 bg-line"
            }`}
          />
        ))}
      </fieldset>
    </div>
  );
}
