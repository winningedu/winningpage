import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { CARD } from "@/components/growth/start/cardStyles";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { GENERIC_ERROR_MESSAGE } from "@/lib/growth/apiResult";
import { SelfevalApiError, selfevalSessionQuery } from "@/lib/selfeval/queries";
import type { SessionDetailResponse } from "@/lib/selfeval/types";

// 세션 상세를 읽는 P6 화면(분석, 결과, 검증, 완료)의 공통 로딩과 오류 껍데기.
// 상세가 오면 children 에 값을 넘기고, 그 전에는 제목만 있는 화면에 스켈레톤이나 재시도 카드를 둔다.

export const PAGE_BODY =
  "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";

type Props = {
  sessionId: string | null;
  /** 상세가 오기 전에 보여 줄 제목. */
  title: string;
  children: (
    detail: SessionDetailResponse,
    refetch: () => Promise<unknown>,
  ) => ReactNode;
};

export default function SessionDetailGate({
  sessionId,
  title,
  children,
}: Props) {
  const { userId } = useSession();
  const detail = useQuery(selfevalSessionQuery(userId, sessionId));

  if (detail.data) return <>{children(detail.data, detail.refetch)}</>;

  const error = detail.error;
  const message =
    error instanceof SelfevalApiError && error.result.kind === "error"
      ? error.result.message
      : GENERIC_ERROR_MESSAGE;

  return (
    <>
      <GoalPageHeader title={title} />
      {error ? (
        <div className={PAGE_BODY}>
          <section className={CARD} role="alert">
            <p className="text-app-card-title font-bold text-ink-strong">
              자기평가서를 불러오지 못했어요
            </p>
            <p className="mt-1 text-app-label text-ink-sub">{message}</p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="mt-4 h-10 px-5 text-app-label"
              onClick={() => void detail.refetch()}
            >
              다시 시도
            </Button>
          </section>
        </div>
      ) : (
        <div role="status" aria-label="불러오는 중" className={PAGE_BODY}>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      )}
    </>
  );
}
