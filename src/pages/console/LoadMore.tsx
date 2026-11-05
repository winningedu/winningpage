// 휴대폰에서 쪽 나누기 대신 쓰는 더 보기(스펙 0.4). 다 보였으면 그리지 않는다.

import { Button } from "@/components/ui/button";

interface LoadMoreProps {
  shown: number;
  total: number;
  unit: "건" | "명";
  onMore: () => void;
}

export default function LoadMore({
  shown,
  total,
  unit,
  onMore,
}: LoadMoreProps) {
  if (shown >= total) return null;
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-app-label text-ink-sub">{`${shown} / ${total}${unit}`}</p>
      <Button
        type="button"
        onClick={onMore}
        className="h-11 w-full rounded-lg bg-surface-muted text-app-label font-semibold text-primary hover:bg-surface-muted"
      >
        더 보기
      </Button>
    </div>
  );
}
