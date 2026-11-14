import type { BoardBanner } from "@/config/sites";

// 게시판 페이지 제목 위 배너. 열 전폭, 큰 둥근 모서리, 제목과 3.5rem 간격.
// width/height 는 레이아웃 이동을 막으려는 속성이고 실제 크기는 CSS 가 정한다.
export default function BoardBannerImage({ banner }: { banner: BoardBanner }) {
  return (
    <img
      src={banner.src}
      alt={banner.alt}
      width={banner.width}
      height={banner.height}
      loading="eager"
      decoding="async"
      className="mb-14 h-auto w-full rounded-[1.25rem]"
    />
  );
}
