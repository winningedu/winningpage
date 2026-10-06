import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { coreActivity } from "@/components/selfeval/analysis/analysisLogic";
import { paragraphTexts } from "@/components/selfeval/result/resultLogic";
import StepFlowNotice from "@/components/selfeval/result/StepFlowNotice";
import { useStepFlow } from "@/components/selfeval/result/useStepFlow";
import {
  useSelfevalScreenStep,
  useSelfevalShell,
} from "@/components/selfeval/SelfevalShellContext";
import SessionDetailGate, {
  PAGE_BODY,
} from "@/components/selfeval/SessionDetailGate";
import { SELFEVAL_PATHS } from "@/components/selfeval/selfevalPaths";
import PromoteModal from "@/components/selfeval/verify/PromoteModal";
import {
  buildPromoteDraft,
  toPromoted,
} from "@/components/selfeval/verify/promoteDraft";
import {
  ExcludedCard,
  FormatCard,
  GrowthFitCard,
  ImprovementsCard,
  MandatoryFixesCard,
  ScoreItemCards,
} from "@/components/selfeval/verify/VerificationCards";
import {
  SaveCard,
  SummaryCard,
  WorkCard,
} from "@/components/selfeval/verify/VerifySide";
import { summarizeVerification } from "@/components/selfeval/verify/verifyLogic";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { GENERIC_ERROR_MESSAGE } from "@/lib/growth/apiResult";
import { finalizeSession, verifySession } from "@/lib/selfeval/api";
import { selfevalQueryKeys } from "@/lib/selfeval/queries";
import type {
  GenerationSections,
  SessionDetailResponse,
  VerificationSections,
} from "@/lib/selfeval/types";
import { isVerificationStale } from "@/lib/selfeval/verification";

// 검증 결과와 저장 확인 화면(시안 43~52, 명세 No.53~62, 76, 122~125, 43).
// 경로: /app/selfeval/s/:sessionId/verify
// 검증이 없거나 현재 본문보다 오래됐으면 진입 즉시 다시 검증한다(계획서 §6 52).
// 하단 고지는 SelfevalAppLayout 이 그린다.

const TITLE = "검증 결과";

export default function VerifyPage() {
  useSelfevalScreenStep(6);
  const { sessionId = null } = useParams();
  return (
    <SessionDetailGate sessionId={sessionId} title={TITLE}>
      {(detail) =>
        sessionId ? <VerifyBody sessionId={sessionId} detail={detail} /> : null
      }
    </SessionDetailGate>
  );
}

function VerifyBody({
  sessionId,
  detail,
}: {
  sessionId: string;
  detail: SessionDetailResponse;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const { refetchEntry, entry } = useSelfevalShell();
  const { session, activities } = detail;

  const needVerify = isVerificationStale(detail);
  const [runKey, setRunKey] = useState(0);
  const flow = useStepFlow(() => verifySession(sessionId), {
    enabled: needVerify || runKey > 0,
    runKey,
  });
  const { phase, data: verified } = flow.state;

  const [override, setOverride] = useState<VerificationSections | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase !== "done" || !verified) return;
    setOverride(verified.verification.sections);
    void queryClient.invalidateQueries({
      queryKey: selfevalQueryKeys.session(userId, sessionId),
    });
    void refetchEntry();
  }, [phase, verified, queryClient, userId, sessionId, refetchEntry]);

  useEffect(() => {
    if (phase === "terminal") void refetchEntry();
  }, [phase, refetchEntry]);

  const flowActive = needVerify || runKey > 0;
  const running =
    flowActive &&
    (phase === "running" || phase === "waiting" || phase === "idle");
  const sections =
    override ??
    (!needVerify
      ? (detail.reports.verification?.sections as
          | VerificationSections
          | undefined)
      : undefined) ??
    null;

  const core = coreActivity(activities);
  const planItem =
    session.planItemId && session.growthSnapshot
      ? session.growthSnapshot.planItems.find(
          (p) => p.id === session.planItemId,
        )
      : undefined;
  const currentText = detail.current
    ? paragraphTexts(detail.current.sections as GenerationSections).join("\n\n")
    : null;

  function reverify() {
    setOverride(null);
    setPromoteOpen(false);
    setRunKey((k) => k + 1);
  }

  async function finalize(
    form: Parameters<typeof toPromoted>[0],
    fulfills: boolean | undefined,
  ) {
    if (busy) return;
    setBusy(true);
    const result = await finalizeSession(sessionId, toPromoted(form), fulfills);
    setBusy(false);
    if (result.kind === "ok") {
      await queryClient.invalidateQueries({
        queryKey: selfevalQueryKeys.session(userId, sessionId),
      });
      await refetchEntry();
      navigate(SELFEVAL_PATHS.done(sessionId), {
        state: { reply: result.data.reply },
      });
      return;
    }
    const code = result.kind === "error" ? result.code : null;
    if (code === "VERIFICATION_STALE" || code === "VERIFICATION_MISSING") {
      reverify();
      return;
    }
    setPromoteOpen(false);
    if (code === "NOT_SUBMITTABLE") {
      toast.error(
        "필수 수정이 남아 있어 저장할 수 없어요. 작성 화면에서 고쳐 주세요.",
      );
      return;
    }
    toast.error(
      result.kind === "error" ? result.message : GENERIC_ERROR_MESSAGE,
    );
  }

  async function copyAll() {
    if (!currentText) return;
    try {
      await navigator.clipboard.writeText(currentText);
      toast.success("복사했어요");
    } catch {
      toast.error("복사하지 못했어요. 직접 선택해서 복사해 주세요.");
    }
  }

  if (running || !sections) {
    return (
      <>
        <GoalPageHeader title={TITLE} />
        <div className={PAGE_BODY}>
          <StepFlowNotice
            kind="verify"
            sessionId={sessionId}
            state={flow.state}
            onRetry={flow.retry}
          />
        </div>
      </>
    );
  }

  const summary = summarizeVerification(sections);
  return (
    <>
      <GoalPageHeader
        title={TITLE}
        subcopy="점수의 근거를 항목별로 확인하고, 고칠 곳이 없으면 최종본으로 저장하세요"
      />
      <div className={PAGE_BODY}>
        {phase === "failed" || phase === "terminal" || phase === "blocked" ? (
          <StepFlowNotice
            kind="verify"
            sessionId={sessionId}
            state={flow.state}
            onRetry={flow.retry}
          />
        ) : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <MandatoryFixesCard sections={sections} />
            <ScoreItemCards sections={sections} />
            <FormatCard sections={sections} />
            <GrowthFitCard sections={sections} />
            <ExcludedCard sections={sections} />
            <ImprovementsCard sections={sections} />
          </div>
          <div className="flex flex-col gap-4">
            <SummaryCard summary={summary} />
            <WorkCard
              charged={verified?.charged ?? null}
              quota={
                entry?.quota
                  ? {
                      remaining: entry.quota.quotaRemaining,
                      total: entry.quota.quotaTotal,
                    }
                  : null
              }
              direction={
                session.growthApplied
                  ? (session.growthSnapshot?.narrativeTheme ?? null)
                  : null
              }
              activities={activities}
            />
            <SaveCard
              submittable={summary.submittable}
              busy={busy}
              onSave={() => setPromoteOpen(true)}
              onCopy={() => void copyAll()}
              onBack={() => navigate(SELFEVAL_PATHS.result(sessionId))}
            />
          </div>
        </div>
      </div>
      {promoteOpen && core && (
        <PromoteModal
          open
          busy={busy}
          initial={buildPromoteDraft(core, session.activityName)}
          planItemTitle={planItem?.title ?? null}
          onClose={() => setPromoteOpen(false)}
          onSubmit={(form, fulfills) => void finalize(form, fulfills)}
        />
      )}
    </>
  );
}
