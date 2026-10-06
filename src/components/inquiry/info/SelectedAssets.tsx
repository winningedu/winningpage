import { RELIABILITY_NOTES } from "@/lib/inquiry/labels";
import type { LocalAsset } from "./infoLogic";
import { CARD_HINT } from "./styles";

type SelectedAssetsProps = {
  items: LocalAsset[];
  disabled: boolean;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: "up" | "down") => void;
};

const ROW_BUTTON =
  "rounded px-2 py-1 text-app-caption text-ink-sub outline-none hover:bg-surface-04 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40";

// 선택한 활동 목록. 첫 항목이 출발 활동이다. 신뢰도 C 는 배지 없이 문장으로만 알린다(No.38, 43).
export default function SelectedAssets({
  items,
  disabled,
  onRemove,
  onMove,
}: SelectedAssetsProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label="고른 활동">
      <p className={CARD_HINT}>
        맨 위 활동에서 출발해요. 순서는 위아래로 바꿀 수 있어요.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            key={item.key}
            className="flex items-start justify-between gap-3 rounded-lg border border-line/60 bg-surface-04 px-4 py-3"
          >
            <div className="min-w-0">
              {index === 0 && (
                <span className="mr-2 rounded-full bg-accent px-2 py-0.5 text-app-caption font-semibold text-white">
                  출발 활동
                </span>
              )}
              <span className="text-app-label font-medium text-ink-strong">
                {item.summary}
              </span>
              {item.reliability === "C" && (
                <p className="mt-1 text-app-caption text-ink-sub">
                  {RELIABILITY_NOTES.C}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className={ROW_BUTTON}
                disabled={disabled || index === 0}
                aria-label={`${item.summary} 위로`}
                onClick={() => onMove(item.key, "up")}
              >
                위로
              </button>
              <button
                type="button"
                className={ROW_BUTTON}
                disabled={disabled || index === items.length - 1}
                aria-label={`${item.summary} 아래로`}
                onClick={() => onMove(item.key, "down")}
              >
                아래로
              </button>
              <button
                type="button"
                className={ROW_BUTTON}
                disabled={disabled}
                aria-label={`${item.summary} 제거`}
                onClick={() => onRemove(item.key)}
              >
                제거
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
