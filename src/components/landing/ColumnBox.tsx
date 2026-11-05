import { Play } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { site } from "@/config/site";
import type { HomeColumnBox } from "./homeColumns";

// 박스 폭: 모바일(가로 스크롤)과 데스크톱은 Md 16.531rem, 태블릿(2x2)은 Lg 21.5625rem.
const BOX_CLASS =
  "flex w-[16.531rem] shrink-0 flex-col gap-3 rounded-2xl border border-column-line bg-white px-3 pt-3 pb-4 text-left md:w-[21.5625rem] lg:w-[16.531rem]";

function Thumbnail({ box }: { box: HomeColumnBox }) {
  const isVideo = box.kind === "video";
  return (
    <div className="relative aspect-8/5 w-full overflow-hidden rounded-[0.625rem] bg-column-thumb">
      {box.thumbnailUrl ? (
        <img
          src={box.thumbnailUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-surface-muted">
          <img
            src={site.logo.horizontal}
            alt=""
            className="w-[7.5rem] opacity-40"
          />
        </div>
      )}
      <span
        className={`absolute top-2 left-2 inline-flex h-[1.375rem] items-center rounded-md px-[0.5625rem] text-[0.71875rem] font-bold ${
          isVideo
            ? "bg-b2b-account text-white"
            : "border border-column-badge-line bg-b2b-pill-bg text-b2b-account"
        }`}
      >
        {isVideo ? "영상" : "칼럼"}
      </span>
      {isVideo && (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-column-play pl-[0.1875rem] text-white"
        >
          <Play size={16} fill="currentColor" />
        </span>
      )}
      {isVideo && box.durationLabel && (
        <span className="absolute right-2 bottom-2 inline-flex h-[1.375rem] items-center rounded-md bg-column-duration px-2 text-[0.71875rem] font-semibold text-white">
          {box.durationLabel}
        </span>
      )}
    </div>
  );
}

function Body({ box }: { box: HomeColumnBox }) {
  return (
    <>
      <Thumbnail box={box} />
      <p className="line-clamp-2 min-h-11 px-1 text-[0.9375rem] font-bold leading-[1.359rem] tracking-[-0.025rem] text-column-title">
        {box.title}
      </p>
      <p className="flex items-center gap-1.5 px-1 text-[0.78125rem] text-column-meta">
        <span>{box.kind === "video" ? "영상" : "칼럼"}</span>
        <span aria-hidden="true" className="h-2.5 w-px bg-column-divider" />
        <span>{box.date}</span>
      </p>
    </>
  );
}

export function ColumnBoxItem({
  box,
  onPlay,
}: {
  box: HomeColumnBox;
  onPlay: (box: HomeColumnBox) => void;
}): ReactNode {
  return (
    <li className="flex">
      {box.kind === "video" ? (
        <button
          type="button"
          aria-label={`${box.title} 영상 재생`}
          onClick={() => onPlay(box)}
          className={`${BOX_CLASS} cursor-pointer`}
        >
          <Body box={box} />
        </button>
      ) : (
        <Link to={`/info/column/${box.id}`} className={BOX_CLASS}>
          <Body box={box} />
        </Link>
      )}
    </li>
  );
}

/** 불러오는 중 박스(W1 loading): 같은 크기, 썸네일과 제목, 메타 자리에 막대. */
export function ColumnBoxSkeleton(): ReactNode {
  return (
    <div
      data-testid="column-box-skeleton"
      className={`${BOX_CLASS} h-[16.33rem]`}
    >
      <div className="aspect-8/5 w-full rounded-[0.625rem] bg-column-thumb" />
      <div className="h-4 w-[12.5rem] rounded-sm bg-surface-muted" />
      <div className="mt-auto h-3 w-[5.625rem] rounded-sm bg-surface-muted" />
    </div>
  );
}
