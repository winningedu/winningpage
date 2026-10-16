import type { Track } from "@/lib/growth/api";
import { CollectSection, NoticeBox } from "./CollectSection";
import { TRACKS } from "./collectLogic";

/** 현재 학년 카드(No.37, 50). 안내 문구는 서버 분석 범위 설명을 그대로 받는다. */
export function TrackCard({
  track,
  notice,
  onSelect,
}: {
  track: Track | null;
  notice: string | null;
  onSelect: (track: Track) => void;
}) {
  return (
    <CollectSection title="현재 학년">
      <div role="radiogroup" aria-label="현재 학년" className="flex gap-2">
        {TRACKS.map((item) => {
          const selected = item === track;
          return (
            // biome-ignore lint/a11y/useSemanticElements: 칩 모양 라디오라 button 에 role 을 둔다
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(item)}
              className={`h-9 min-w-14 rounded-full border px-4 text-app-label font-medium transition-colors ${
                selected
                  ? "border-ink-dark bg-ink-dark text-white"
                  : "border-line bg-white text-ink hover:bg-surface-04"
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <NoticeBox role="status">
          {track === null ? "현재 학년을 골라 주세요." : notice}
        </NoticeBox>
      </div>
    </CollectSection>
  );
}
