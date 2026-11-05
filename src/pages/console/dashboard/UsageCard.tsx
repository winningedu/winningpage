// 서비스 이용 학생 카드(교 #30). 네이비 면의 원형 그래프와 이용 인원.

import { Skeleton } from "@/components/ui/skeleton";
import { percent } from "./format";

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface UsageCardProps {
  /** null 이면 불러오는 중(뼈대). */
  usage: { usingCount: number; totalCount: number } | null;
}

export default function UsageCard({ usage }: UsageCardProps) {
  const ratio = usage ? percent(usage.usingCount, usage.totalCount) : 0;
  return (
    <section
      aria-label="서비스 이용 학생"
      className="flex flex-col items-center gap-6 rounded-perf-modal bg-primary p-8 text-primary-foreground lg:w-[30rem] lg:shrink-0"
    >
      <h2 className="text-app-card-title font-bold">서비스 이용 학생</h2>
      <div className="relative aspect-square w-full max-w-[17.5rem]">
        <svg viewBox="0 0 100 100" aria-hidden className="size-full -rotate-90">
          <title>이용 비율 그래프</title>
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            className="stroke-primary-foreground/20"
          />
          {usage && (
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(CIRCUMFERENCE * ratio) / 100} ${CIRCUMFERENCE}`}
              className="stroke-primary-foreground"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {usage ? (
            <p className="text-[3.125rem] leading-none font-semibold tracking-[-0.0625rem]">
              {`${ratio}%`}
            </p>
          ) : (
            <Skeleton className="h-10 w-28 bg-primary-foreground/20" />
          )}
        </div>
      </div>
      {usage ? (
        <>
          <p className="flex items-center gap-2">
            <span className="text-[2.375rem] leading-[1.3] font-bold">
              {usage.usingCount}
            </span>
            <span className="text-xl font-medium">{`/ ${usage.totalCount}명`}</span>
          </p>
          <p className="text-app-label">
            {`이용 비율 ${ratio}%. 서비스를 1개 이상 이용하는 학생`}
          </p>
        </>
      ) : (
        <>
          <Skeleton className="h-10 w-32 bg-primary-foreground/20" />
          <Skeleton className="h-4 w-60 bg-primary-foreground/20" />
        </>
      )}
    </section>
  );
}
