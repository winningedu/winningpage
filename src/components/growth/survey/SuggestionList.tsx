import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

type SuggestionListProps = {
  label: string;
  names: readonly string[];
  loading: boolean;
  /** 결과가 없을 때 목록 안에 그리는 안내와 직접 입력 버튼. */
  empty: ReactNode | null;
  onPick: (name: string) => void;
};

// 목록은 입력 바로 아래 오버레이다. absolute 는 ScrollArea 밖의 일반 래퍼가 맡는다
// (overlayscrollbars.css 가 layer 밖이라 ScrollArea 루트의 absolute 는 무시된다).
export default function SuggestionList({
  label,
  names,
  loading,
  empty,
  onPick,
}: SuggestionListProps) {
  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20">
      <ScrollArea className="max-h-64 rounded-xl border border-line bg-white shadow-[0_0.75rem_2rem_rgba(15,23,42,0.12)]">
        {loading ? (
          <p className="px-4 py-3 text-app-body text-ink-sub">검색 중</p>
        ) : names.length > 0 ? (
          <ul aria-label={label}>
            {names.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onPick(name)}
                  className="flex min-h-11 w-full items-center px-4 text-left text-app-body text-ink transition-colors hover:bg-surface-03"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          empty
        )}
      </ScrollArea>
    </div>
  );
}
