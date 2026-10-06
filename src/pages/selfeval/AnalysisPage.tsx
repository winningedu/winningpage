import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import AppModal from "@/components/goal/AppModal";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { CARD, CARD_TITLE } from "@/components/growth/start/cardStyles";
import AnalysisTable from "@/components/selfeval/analysis/AnalysisTable";
import {
  changedEdits,
  coreActivity,
  hasUnresolvedConflict,
  needsAnalysisRun,
} from "@/components/selfeval/analysis/analysisLogic";
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
import { Button } from "@/components/ui/button";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { GENERIC_ERROR_MESSAGE } from "@/lib/growth/apiResult";
import {
  type ApiResult,
  analyzeResolveConflict,
  analyzeRun,
  analyzeSave,
} from "@/lib/selfeval/api";
import { selfevalQueryKeys } from "@/lib/selfeval/queries";
import type {
  Analysis,
  AnalysisField,
  SessionDetailResponse,
} from "@/lib/selfeval/types";

// 분석 확인 화면(시안 30~34, 명세 No.37~43, 112, 114~116). 경로: /app/selfeval/s/:sessionId/analysis
// 핵심 활동의 분석이 비어 있으면 진입 즉시 모델 분석을 부른다. 하단 고지는 SelfevalAppLayout 이 그린다.

const PRINCIPLES = [
  "자료에서 확인된 사실만 씁니다",
  "수치와 감정과 태도 변화를 지어내지 않습니다",
  "활동 나열 대신 판단과 수정 과정을 씁니다",
  "진로를 억지로 연결하지 않습니다",
];
const LOCKED_NOTE =
  "활동 선택은 분석 뒤에 바꿀 수 없어요. 바꾸려면 새로 시작해 주세요";

function failure(result: Exclude<ApiResult<unknown>, { kind: "ok" }>) {
  return result.kind === "error" ? result.message : GENERIC_ERROR_MESSAGE;
}

export default function AnalysisPage() {
  useSelfevalScreenStep(4);
  const { sessionId = null } = useParams();
  return (
    <SessionDetailGate
      sessionId={sessionId}
      title="분석한 내용이 맞는지 봐주세요"
    >
      {(detail) =>
        sessionId ? (
          <AnalysisBody sessionId={sessionId} detail={detail} />
        ) : null
      }
    </SessionDetailGate>
  );
}

function AnalysisBody({
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
  const { refetchEntry } = useSelfevalShell();

  const core = coreActivity(detail.activities);
  // 분석 확인 화면은 저장, 충돌 선택 결과를 로컬에 두고 쓴다. 서버 상세는 단계가 끝난 뒤 갱신한다.
  const [override, setOverride] = useState<Analysis | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [lockedNote, setLockedNote] = useState(false);

  const flow = useStepFlow(() => analyzeRun(sessionId), {
    enabled: needsAnalysisRun(core) || runKey > 0,
    runKey,
  });
  const { phase, data: runData } = flow.state;

  // 분석이 끝나면 다른 화면(사이드바, 생성)이 새 단계를 보도록 캐시를 갱신한다.
  useEffect(() => {
    if (phase === "done" && runData) {
      setOverride(runData.analysis);
      void queryClient.invalidateQueries({
        queryKey: selfevalQueryKeys.session(userId, sessionId),
      });
      void refetchEntry();
    }
    if (phase === "terminal") void refetchEntry();
  }, [phase, runData, queryClient, userId, sessionId, refetchEntry]);

  const analysis = override ?? core?.analysis ?? null;
  const analysisSource =
    runData?.analysisSource ?? core?.analysisSource ?? null;
  const flowActive = phase !== "done" && phase !== "idle" && analysis === null;
  const rerunning = runKey > 0 && phase !== "done";
  const showNotice = flowActive || rerunning;
  const unresolved = analysis
    ? hasUnresolvedConflict(analysis.conflicts)
    : false;
  const locked = detail.session.currentStep >= 3;

  async function commit(field: AnalysisField, value: string) {
    if (!analysis || busy) return;
    const edits = changedEdits(analysis.values, { [field]: value });
    if (Object.keys(edits).length === 0) return;
    setBusy(true);
    const result = await analyzeSave(sessionId, edits);
    setBusy(false);
    if (result.kind !== "ok") {
      toast.error(failure(result));
      return;
    }
    setOverride(result.data.analysis);
  }

  async function resolve(index: number, choice: "a" | "b") {
    if (busy) return;
    setBusy(true);
    const result = await analyzeResolveConflict(sessionId, index, choice);
    setBusy(false);
    if (result.kind !== "ok") {
      toast.error(failure(result));
      return;
    }
    setOverride(result.data.analysis);
  }

  function rerun() {
    setConfirmRerun(false);
    setOverride(null);
    setRunKey((k) => k + 1);
  }

  const prevButton = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="h-10 px-5 text-app-label font-medium"
      onClick={() =>
        locked
          ? setLockedNote(true)
          : navigate(SELFEVAL_PATHS.activities(sessionId))
      }
    >
      이전
    </Button>
  );

  return (
    <>
      <GoalPageHeader
        title="분석한 내용이 맞는지 봐주세요"
        subcopy="칸을 누르면 바로 고칠 수 있습니다. 고친 값이 글의 근거가 됩니다"
      />
      <div className={PAGE_BODY}>
        {showNotice || !analysis ? (
          <>
            <StepFlowNotice
              kind="analysis"
              sessionId={sessionId}
              state={flow.state}
              onRetry={flow.retry}
            />
            <div className="flex flex-col items-end gap-2">
              {prevButton}
              {lockedNote && (
                <p role="status" className="text-app-label text-ink-sub">
                  {LOCKED_NOTE}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="flex min-w-0 flex-col gap-4">
              {analysisSource === "student" && (
                <p className="rounded-xl bg-surface-04 px-5 py-4 text-app-label text-ink-strong">
                  직접 입력한 활동이라 분석 항목을 학생이 채워야 해요
                </p>
              )}
              <AnalysisTable
                analysis={analysis}
                disabled={busy}
                onCommit={(f, v) => void commit(f, v)}
                onResolve={(i, c) => void resolve(i, c)}
              />
              {lockedNote && (
                <p role="status" className="text-app-label text-ink-sub">
                  {LOCKED_NOTE}
                </p>
              )}
              <div className="flex items-center justify-end gap-3">
                {prevButton}
                <button
                  type="button"
                  className="text-app-label font-semibold text-accent underline underline-offset-2"
                  disabled={busy}
                  onClick={() => setConfirmRerun(true)}
                >
                  다시 분석
                </button>
                <Button
                  type="button"
                  size="lg"
                  className="h-10 px-5 text-app-label font-semibold"
                  disabled={unresolved || busy}
                  onClick={() =>
                    navigate(`${SELFEVAL_PATHS.result(sessionId)}?generate=1`)
                  }
                >
                  이 내용으로 작성하기
                </Button>
              </div>
              {unresolved && (
                <p className="text-right text-app-caption text-ink-sub">
                  확인이 필요한 수치를 고르면 작성할 수 있어요
                </p>
              )}
            </div>
            <aside className={CARD} aria-label="작성 원칙">
              <h2 className={CARD_TITLE}>작성 원칙</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {PRINCIPLES.map((line) => (
                  <li key={line} className="text-app-label text-ink-strong">
                    {line}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}
      </div>
      <AppModal
        open={confirmRerun}
        onClose={() => setConfirmRerun(false)}
        title="다시 분석할까요?"
        subtitle="고친 값이 덮어써져요. 모델이 기록을 다시 읽어 11개 항목을 새로 채워요."
        submitLabel="다시 분석하기"
        onSubmit={rerun}
      />
    </>
  );
}
