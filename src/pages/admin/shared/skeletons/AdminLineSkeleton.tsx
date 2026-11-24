import { cn } from "@/lib/utils";
import { AdminSkeletonStatus } from "./AdminSkeletonStatus";
import { SkeletonBar } from "./SkeletonBar";

interface AdminLineSkeletonProps {
  label?: string;
  className?: string;
}

// 값 하나가 들어갈 자리의 한 줄 막대. className은 막대 크기를 바꾼다.
export function AdminLineSkeleton({
  label,
  className,
}: AdminLineSkeletonProps) {
  return (
    <AdminSkeletonStatus label={label}>
      <SkeletonBar className={cn("h-4 w-32", className)} />
    </AdminSkeletonStatus>
  );
}
