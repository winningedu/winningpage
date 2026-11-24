import { AdminSkeletonStatus } from "./AdminSkeletonStatus";
import { SkeletonBar } from "./SkeletonBar";

interface AdminCardsSkeletonProps {
  count: number;
  label?: string;
}

// 본사 대시보드 요약 카드(StatCard)와 같은 격자와 카드 모양이다.
// 카드마다 이름 막대, 값 막대, 기간 막대가 위에서 아래로 쌓인다.
export function AdminCardsSkeleton({ count, label }: AdminCardsSkeletonProps) {
  const cards = Array.from({ length: count }, (_, i) => `card-${i}`);
  return (
    <AdminSkeletonStatus label={label}>
      <div data-part="grid" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card}
            data-part="card"
            className="space-y-3 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10"
          >
            <SkeletonBar className="h-3 w-20" />
            <SkeletonBar className="h-6 w-28" />
            <SkeletonBar className="h-3 w-36" />
          </div>
        ))}
      </div>
    </AdminSkeletonStatus>
  );
}
