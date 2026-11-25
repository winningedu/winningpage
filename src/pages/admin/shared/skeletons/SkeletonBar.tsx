import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// 스크린리더에는 숨기고(상태 이름은 래퍼가 읽는다) 모션 줄이기 설정이면 멈추는 막대.
export function SkeletonBar({ className }: { className?: string }) {
  return (
    <Skeleton
      aria-hidden="true"
      className={cn("motion-reduce:animate-none", className)}
    />
  );
}
