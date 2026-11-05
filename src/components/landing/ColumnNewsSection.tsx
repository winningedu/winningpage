import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { site } from "@/config/site";
import { ColumnBoxItem } from "./ColumnBox";
import type { HomeColumnBox } from "./homeColumns";
import VideoPlayerDialog from "./VideoPlayerDialog";

type ColumnNewsSectionProps = {
  status: "loading" | "ready" | "error";
  boxes: HomeColumnBox[];
};

/** 칼럼-교육청소식 섹션(W1, 스쿨멘토 전용). 영상 박스는 팝업(W2)을, 칼럼 박스는 상세 글을 연다. */
export default function ColumnNewsSection({ boxes }: ColumnNewsSectionProps) {
  const [playing, setPlaying] = useState<HomeColumnBox | null>(null);

  return (
    <section
      aria-label={site.columnTitle}
      className="mx-auto w-full max-w-content px-5 pb-8 sm:px-8 md:pb-20"
    >
      <div className="flex items-center justify-between">
        <span aria-hidden="true" className="size-10" />
        <h2 className="text-center text-[1.75rem] font-semibold leading-[1.4] tracking-[-0.04rem] text-ink sm:text-[2rem]">
          {site.columnTitle}
        </h2>
        <Link
          to="/info/column"
          aria-label={`${site.columnTitle} 더 보기`}
          className="relative flex size-10 items-center justify-center rounded-perf-modal after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] lg:after:hidden"
        >
          <Plus size={24} aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-[1.375rem] flex gap-3.5 overflow-x-auto md:grid md:grid-cols-2 md:justify-items-center lg:flex lg:justify-start">
        {boxes.map((box) => (
          <ColumnBoxItem key={box.id} box={box} onPlay={setPlaying} />
        ))}
      </ul>
      {playing?.videoId && (
        <VideoPlayerDialog
          open
          onOpenChange={(open) => {
            if (!open) setPlaying(null);
          }}
          videoId={playing.videoId}
          title={playing.title}
        />
      )}
    </section>
  );
}
