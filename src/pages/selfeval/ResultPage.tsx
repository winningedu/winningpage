import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { CARD } from "@/components/growth/start/cardStyles";
import ReportText from "@/components/selfeval/result/ReportText";
import {
  charChips,
  evidenceOf,
  paragraphTexts,
  pendingFeelings,
  textsWithoutSentence,
} from "@/components/selfeval/result/resultLogic";
import {
  EvidencePanel,
  PendingFeelingsPanel,
} from "@/components/selfeval/result/SidePanels";
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
  writeConfirmFeeling,
  writeEdit,
  writeGenerate,
} from "@/lib/selfeval/api";
import { selfevalQueryKeys } from "@/lib/selfeval/queries";
import type {
  CharCount,
  GenerationSections,
  SessionDetailResponse,
} from "@/lib/selfeval/types";

// 생성중과 생성 결과 화면(시안 35~42, 명세 No.44~52, 117~121). 경로: /app/selfeval/s/:sessionId/result
//   ?generate=1  분석 확인에서 넘어온 진입. 진입 즉시 작성본을 만든다.
// 생성 리포트가 없으면 쿼리가 없어도 만든다. 하단 고지는 SelfevalAppLayout 이 그린다.

const TITLE = "자기평가서가 완성됐습니다";
const CHIP =
  "rounded-full bg-surface-04 px-3 py-1 text-app-caption font-semibold text-ink-strong";

type Shown = { sections: GenerationSections; charCount: CharCount | null };

function failure(result: Exclude<ApiResult<unknown>, { kind: "ok" }>) {
  return result.kind === "error" ? result.message : GENERIC_ERROR_MESSAGE;
}

export default function ResultPage() {
  useSelfevalScreenStep(5);
  const { sessionId = null } = useParams();
  return (
    <SessionDetailGate sessionId={sessionId} title={TITLE}>
      {(detail) =>
        sessionId ? <ResultBody sessionId={sessionId} detail={detail} /> : null
      }
    </SessionDetailGate>
  );
}

function ResultBody({
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
  const [params, setParams] = useSearchParams();

  const { session, activities } = detail;
  const needGenerate =
    params.get("generate") === "1" || detail.reports.generation === null;
  const [runKey, setRunKey] = useState(0);
  const flow = useStepFlow(() => writeGenerate(sessionId), {
    enabled: needGenerate || runKey > 0,
    runKey,
  });
  const { phase, data: generated } = flow.state;

  // 저장, 확인, 다시 생성이 돌려준 본문. 서버 상세는 이 화면을 떠날 때 새로 읽는다.
  const [override, setOverride] = useState<Shown | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase !== "done" || !generated) return;
    setOverride({
      sections: generated.report.sections,
      charCount: generated.report.charCount,
    });
    setLeft(generated.regenerationsLeft);
    setSelectedId(null);
    // 생성이 끝났으니 주소의 generate=1 을 지운다(새로고침이 같은 생성을 또 부르지 않게).
    if (params.get("generate") === "1") {
      const next = new URLSearchParams(params);
      next.delete("generate");
      setParams(next, { replace: true });
    }
    void queryClient.invalidateQueries({
      queryKey: selfevalQueryKeys.session(userId, sessionId),
    });
    void refetchEntry();
  }, [
    phase,
    generated,
    params,
    setParams,
    queryClient,
    userId,
    sessionId,
    refetchEntry,
  ]);

  useEffect(() => {
    if (phase === "terminal") void refetchEntry();
  }, [phase, refetchEntry]);

  const stored = detail.current?.sections as GenerationSections | undefined;
  const shown: Shown | null =
    override ??
    (stored
      ? { sections: stored, charCount: detail.current?.charCount ?? null }
      : null);
  const regenerationsLeft = left ?? detail.regenerationsLeft;
  const flowActive = needGenerate || runKey > 0;
  const generating =
    flowActive &&
    (phase === "running" || phase === "waiting" || phase === "idle");

  // 본문이 바뀌면 검증 화면이 낡은 본문을 보지 않도록 세션 상세를 다시 읽게 한다.
  function refreshSession() {
    void queryClient.invalidateQueries({
      queryKey: selfevalQueryKeys.session(userId, sessionId),
    });
  }

  async function save(paragraphs: string[]) {
    if (busy) return false;
    setBusy(true);
    const result = await writeEdit(sessionId, paragraphs);
    setBusy(false);
    if (result.kind !== "ok") {
      toast.error(failure(result));
      return false;
    }
    setOverride({
      sections: result.data.report.sections,
      charCount: result.data.report.charCount,
    });
    refreshSession();
    return true;
  }

  async function confirmFeeling(sentenceId: string) {
    if (busy) return;
    setBusy(true);
    const result = await writeConfirmFeeling(sessionId, sentenceId);
    setBusy(false);
    if (result.kind !== "ok") {
      toast.error(failure(result));
      return;
    }
    setOverride({
      sections: result.data.report.sections,
      charCount: result.data.report.charCount,
    });
    refreshSession();
  }

  // 생성 중이거나 아직 본문이 없으면 본문 자리에 진행 카드(또는 실패 카드)만 그린다.
  if (flowActive && (generating || !shown)) {
    return (
      <>
        <GoalPageHeader title={TITLE} />
        <div className={PAGE_BODY}>
          <StepFlowNotice
            kind="write"
            sessionId={sessionId}
            state={flow.state}
            onRetry={flow.retry}
          />
        </div>
      </>
    );
  }
  if (!shown) return null;

  const chips = charChips(
    shown.charCount ?? { withSpace: 0, withoutSpace: 0 },
    session.targetChars,
    session.targetCharsMode,
  );
  const pending = pendingFeelings(shown.sections);
  const selectedSentence = selectedId
    ? shown.sections.paragraphs
        .flatMap((p) => p.sentences)
        .find((s) => s.id === selectedId)
    : undefined;
  const selectedView = selectedSentence
    ? evidenceOf(selectedSentence, activities)
    : null;

  return (
    <>
      <GoalPageHeader
        title={TITLE}
        subcopy="문장을 누르면 어떤 활동에서 나왔는지 볼 수 있습니다. 바로 고쳐도 됩니다"
      />
      <div className={PAGE_BODY}>
        {phase === "failed" || phase === "terminal" || phase === "blocked" ? (
          <StepFlowNotice
            kind="write"
            sessionId={sessionId}
            state={flow.state}
            onRetry={flow.retry}
          />
        ) : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            {shown.charCount && (
              <ul className="flex flex-wrap gap-2" aria-label="글자 수">
                <li className={CHIP}>공백 포함 {chips.withSpace}자</li>
                <li className={CHIP}>공백 제외 {chips.withoutSpace}자</li>
                {chips.target && (
                  <li className={CHIP}>
                    목표 {chips.target.value}자 대비{" "}
                    {chips.target.diff > 0 ? "+" : ""}
                    {chips.target.diff}
                  </li>
                )}
                {chips.target?.outOfRange && (
                  <li className="rounded-full bg-error/10 px-3 py-1 text-app-caption font-semibold text-error">
                    ±5% 초과
                  </li>
                )}
              </ul>
            )}
            <section className={CARD}>
              {editing ? (
                <div className="flex flex-col gap-3">
                  {editing.map((text, i) => (
                    <textarea
                      // biome-ignore lint/suspicious/noArrayIndexKey: 문단은 순서가 곧 식별자다
                      key={i}
                      aria-label={`${i + 1}문단`}
                      rows={5}
                      value={text}
                      onChange={(e) =>
                        setEditing(
                          editing.map((t, j) => (j === i ? e.target.value : t)),
                        )
                      }
                      className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-app-body text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  ))}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="h-10 px-5 text-app-label"
                      onClick={() => setEditing(null)}
                    >
                      취소
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      className="h-10 px-5 text-app-label font-semibold"
                      disabled={busy}
                      onClick={async () => {
                        if (await save(editing)) setEditing(null);
                      }}
                    >
                      저장
                    </Button>
                  </div>
                </div>
              ) : (
                <ReportText
                  sections={shown.sections}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
            </section>
            {!editing && (
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-10 px-5 text-app-label font-medium"
                    disabled={regenerationsLeft <= 0 || busy || generating}
                    onClick={() => setRunKey((k) => k + 1)}
                  >
                    다시 생성 (남은 {regenerationsLeft}회)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-10 px-5 text-app-label font-medium"
                    onClick={() => setEditing(paragraphTexts(shown.sections))}
                  >
                    직접 고치기
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="h-10 px-5 text-app-label font-semibold"
                    disabled={busy}
                    onClick={() => navigate(SELFEVAL_PATHS.verify(sessionId))}
                  >
                    검증하기
                  </Button>
                </div>
                {regenerationsLeft <= 0 && (
                  <p className="text-app-caption text-ink-sub">
                    다시 생성을 3회 모두 썼어요. 직접 고치거나 검증으로 넘어가
                    주세요
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <EvidencePanel
              sections={shown.sections}
              activities={activities}
              selected={
                selectedSentence && selectedView
                  ? { sentence: selectedSentence, view: selectedView }
                  : null
              }
            />
            <PendingFeelingsPanel
              pending={pending}
              busy={busy}
              onConfirm={(id) => void confirmFeeling(id)}
              onRemove={(id) =>
                void save(textsWithoutSentence(shown.sections, id))
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
