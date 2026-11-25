import { AdminSkeletonStatus } from "./AdminSkeletonStatus";
import { SkeletonBar } from "./SkeletonBar";

interface AdminDetailSkeletonProps {
  rows: number;
  label?: string;
}

// AdminEngine 상세의 키 값 격자(13.75rem 라벨 칸 + 값 칸)와 같은 모양이다.
// 값 막대는 폼 입력칸 높이(2.5rem)라 폼 자리에도 쓴다.
export function AdminDetailSkeleton({ rows, label }: AdminDetailSkeletonProps) {
  const lines = Array.from({ length: rows }, (_, i) => `row-${i}`);
  return (
    <AdminSkeletonStatus label={label} className="bg-white">
      {lines.map((line) => (
        <div
          key={line}
          data-part="row"
          className="grid grid-cols-[13.75rem_1fr] border-b border-[#edf0f4]"
        >
          <div data-part="label" className="bg-[#fafafa] px-5 py-3">
            <SkeletonBar className="h-4 w-24" />
          </div>
          <div data-part="value" className="px-5 py-3">
            <SkeletonBar className="h-10 w-full max-w-md" />
          </div>
        </div>
      ))}
    </AdminSkeletonStatus>
  );
}
