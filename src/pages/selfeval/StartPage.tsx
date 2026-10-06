import { useState } from "react";
import { useNavigate } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { CARD } from "@/components/growth/start/cardStyles";
import DiscardConfirmModal from "@/components/selfeval/DiscardConfirmModal";
import GrowthDirectionBanner from "@/components/selfeval/GrowthDirectionBanner";
import {
  useSelfevalScreenStep,
  useSelfevalShell,
} from "@/components/selfeval/SelfevalShellContext";
import { SELFEVAL_PATHS } from "@/components/selfeval/selfevalPaths";
import StartStats from "@/components/selfeval/start/StartStats";
import StudentSummaryCard from "@/components/selfeval/start/StudentSummaryCard";
import {
  deriveStartMode,
  studentSummaryLine,
} from "@/components/selfeval/start/startLogic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { discardSession } from "@/lib/selfeval/api";
import type { EntryResponse } from "@/lib/selfeval/types";

// 자기평가서 시작 화면(시안 01~06, 명세 No.14, 15, 70, 71, 101~103). 경로: /app/selfeval
// 단계 알림(useSelfevalScreenStep)은 사이드바 진행단계가 의존한다.
// 하단 고지 4줄은 SelfevalAppLayout 이 그린다(여기서 또 그리지 않는다).
const BODY = "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";
const PRICING = "/pricing?service=selfeval";

export default function StartPage() {
  useSelfevalScreenStep(1);
  const { entry, isEntryLoading, refetchEntry } = useSelfevalShell();

  return (
    <>
      <GoalPageHeader
        title="위닝 자기평가서"
        subcopy="기록에서 고르고, 쓰고, 검증하는 자기평가서 작성 도구입니다"
      />
      {entry ? (
        <StartBody entry={entry} />
      ) : isEntryLoading ? (
        <div role="status" aria-label="불러오는 중" className={BODY}>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : (
        <div className={BODY}>
          <p className="text-app-body text-ink-sub">
            자기평가서 정보를 불러오지 못했어요.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-10 px-5 text-app-label"
              onClick={() => void refetchEntry()}
            >
              다시 시도
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function StartBody({ entry }: { entry: EntryResponse["entry"] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { quotaRemaining, quotaTotal } = useSession();
  const { studentName, refetchEntry } = useSelfevalShell();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const start = deriveStartMode(entry, quotaRemaining);
  const { growth } = entry;

  async function discardAndRestart(sessionId: string) {
    if (discarding) return;
    setDiscarding(true);
    const result = await discardSession(sessionId);
    setDiscarding(false);
    if (result.kind !== "ok") {
      toast.error(
        "작성 중인 자기평가서를 파기하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      );
      return;
    }
    await refetchEntry();
    setConfirmOpen(false);
    navigate(SELFEVAL_PATHS.new);
  }

  return (
    <div className={BODY}>
      {growth && (
        <GrowthDirectionBanner banner={growth.banner} stale={growth.stale} />
      )}
      <StudentSummaryCard
        studentName={studentName}
        summaryLine={studentSummaryLine(entry.profile)}
        quotaRemaining={quotaRemaining}
      />
      <StartStats
        quotaRemaining={quotaRemaining}
        quotaTotal={quotaTotal}
        activityCount={entry.activityCount}
        openCount={entry.openSession ? 1 : 0}
      />

      {start.mode === "quota_zero" && (
        <section className={`${CARD} bg-surface-04`}>
          <p className="text-app-card-title font-bold text-ink-strong">
            이용 가능 횟수가 없어요
          </p>
          <p className="mt-1 text-app-label text-ink-sub">
            자기평가서는 생성에 성공하면 이용 횟수가 1회 차감돼요. 이용권을
            구매하면 바로 시작할 수 있어요.
          </p>
        </section>
      )}
      {start.mode === "no_activities" && (
        <section className={`${CARD} bg-surface-04`}>
          <p className="text-app-card-title font-bold text-ink-strong">
            저장된 활동이 아직 없어요
          </p>
          <p className="mt-1 text-app-label text-ink-sub">
            수행평가나 심화탐구에서 저장한 활동이 없어도 괜찮아요. 활동을 직접
            입력해서 시작할 수 있어요.
          </p>
        </section>
      )}

      <div className="flex justify-end gap-3">
        {start.mode === "resume" && (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-10 px-5 text-app-label font-medium"
              onClick={() => setConfirmOpen(true)}
            >
              새로 만들기
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-10 px-5 text-app-label font-semibold"
              onClick={() => navigate(start.resumeTo)}
            >
              이어서 작성하기
            </Button>
          </>
        )}
        {start.mode === "new" && (
          <Button
            type="button"
            size="lg"
            className="h-10 px-5 text-app-label font-semibold"
            onClick={() => navigate(SELFEVAL_PATHS.new)}
          >
            새 자기평가서 만들기
          </Button>
        )}
        {start.mode === "no_activities" && (
          <Button
            type="button"
            size="lg"
            className="h-10 px-5 text-app-label font-semibold"
            onClick={() => navigate(`${SELFEVAL_PATHS.new}?manual=1`)}
          >
            직접 입력으로 시작하기
          </Button>
        )}
        {start.mode === "quota_zero" && (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-10 px-5 text-app-label font-medium"
              disabled
            >
              새 자기평가서 만들기
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-10 px-5 text-app-label font-semibold"
              onClick={() => navigate(PRICING)}
            >
              이용권 보러 가기
            </Button>
          </>
        )}
      </div>

      {start.mode === "resume" && (
        <DiscardConfirmModal
          open={confirmOpen}
          busy={discarding}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => void discardAndRestart(start.sessionId)}
        />
      )}
    </div>
  );
}
