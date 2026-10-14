import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  useInquiryScreenStep,
  useInquiryShell,
} from "@/components/inquiry/InquiryShellContext";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import StepGate from "@/components/inquiry/StepGate";
import StepGuardCard from "@/components/inquiry/StepGuardCard";
import { guardFor } from "@/components/inquiry/stepGuards";
import GeneratingCard from "@/components/inquiry/topics/GeneratingCard";
import { RUNNING_RETRY_MS } from "@/components/inquiry/topics/topicsLogic";
import DesignDrawer, {
  DRAWER_GUTTER_CLASS,
} from "@/components/inquiry/write/DesignDrawer";
import EvaluateStatusCard from "@/components/inquiry/write/EvaluateStatusCard";
import PlaceholderWarning from "@/components/inquiry/write/PlaceholderWarning";
import SectionEditor from "@/components/inquiry/write/SectionEditor";
import SidePanels from "@/components/inquiry/write/SidePanels";
import TooShortCard from "@/components/inquiry/write/TooShortCard";
import {
  AUTOSAVE_MS,
  buildSectionRows,
  classifyEvaluate,
  EVALUATE_LINES,
  type EvaluateOutcome,
  emptyMessage,
  initialSections,
  isDirty,
  precheck,
  saveStatusText,
  shouldAutosave,
} from "@/components/inquiry/write/writeLogic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { evaluateReport, postSubmission } from "@/lib/inquiry/api";
import {
  inquiryQueryKeys,
  inquirySessionDetailQuery,
} from "@/lib/inquiry/queries";
import { countPlaceholders } from "@/lib/inquiry/submission";
import type {
  DesignView,
  EvaluateResponse,
  SectionId,
  SessionView,
  SubmissionSections,
  TopicView,
} from "@/lib/inquiry/types";
import { cn } from "@/lib/utils";

// 경로: /app/inquiry/write (화면 4, 보고서 작성)
// 8절을 쓰고 60초마다(더티일 때만) 자동 저장한다. 제출은 저장 뒤 evaluateReport 를 부른다(부록 B 3, C).

export default function WritePage() {
  useInquiryScreenStep(4);
  // 상단 버튼과 하단 버튼이 같은 서랍 상태를 토글하도록 여기서 들고 있는다.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleDrawer = () => setDrawerOpen((open) => !open);
  const { userId } = useSession();
  const { session, isBootstrapLoading } = useInquiryShell();
  const { data } = useQuery(
    inquirySessionDetailQuery(userId, session?.id ?? null),
  );
  // 설계 리포트가 없으면 서랍에 보여 줄 것이 없다. 하단 버튼은 본문과 함께 사라지므로 상단만 막는다.
  const reportReady =
    !isBootstrapLoading &&
    guardFor(4, session) === null &&
    Boolean(data?.design && data.topic);
  return (
    <StepGate
      step={4}
      title="보고서 작성"
      subcopy="여덟 개 절을 써요. 설계 리포트가 요구한 요소가 들어갔는지 옆에서 바로 확인해요."
      // 서랍이 열려 있는 동안 상단 버튼이 서랍에 가려지지 않게 본문과 같은 폭만큼 비운다.
      headerWidthClassName={cn(
        "max-w-goal-content",
        drawerOpen && DRAWER_GUTTER_CLASS,
      )}
      actions={
        <DesignReportButton
          onClick={toggleDrawer}
          expanded={drawerOpen}
          disabled={!reportReady}
        />
      }
    >
      <WriteContent
        drawerOpen={drawerOpen}
        onDrawerOpenChange={setDrawerOpen}
        onToggleDrawer={toggleDrawer}
      />
    </StepGate>
  );
}

type DrawerControl = {
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  onToggleDrawer: () => void;
};

// 서랍(28rem)은 화면 오른쪽에 붙고 본문 안쪽 오른쪽 패딩(3rem)이 이미 비어 있다.
// 그래서 폼이 비울 폭은 25rem 이고, 컨테이너(83.75rem) 오른쪽 바깥 여백이 있으면 그만큼 더 줄인다.
const FORM_DRAWER_GUTTER_CLASS =
  "xl:pr-[max(0rem,calc(25rem-max(0rem,100vw-101.75rem)))]";

const DISABLED_REASON_ID = "design-report-disabled-reason";

function DesignReportButton({
  onClick,
  expanded,
  disabled = false,
}: {
  onClick: () => void;
  expanded: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-10 px-5 text-app-label"
        disabled={disabled}
        aria-expanded={expanded}
        aria-describedby={disabled ? DISABLED_REASON_ID : undefined}
        onClick={onClick}
      >
        설계 리포트 보기
      </Button>
      {disabled && (
        <span id={DISABLED_REASON_ID} className="sr-only">
          설계 리포트가 만들어지면 볼 수 있어요.
        </span>
      )}
    </>
  );
}

function WriteContent(drawer: DrawerControl) {
  const { userId } = useSession();
  const { session } = useInquiryShell();
  const { data, error, isPending } = useQuery(
    inquirySessionDetailQuery(userId, session?.id ?? null),
  );

  if (isPending) {
    return (
      <div role="status" aria-label="불러오는 중">
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="text-app-label text-ink-strong">
        작성 화면을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.
      </p>
    );
  }
  if (!data.design || !data.topic || !session) {
    return (
      <StepGuardCard
        title="아직 보고서를 쓸 수 없어요"
        description="설계 리포트가 만들어지면 8절 작성 화면이 열려요. 주제 추천으로 돌아가 주제를 정하세요."
        backLabel="주제 추천으로 돌아가기"
        backTo={INQUIRY_PATHS.topics}
      />
    );
  }
  return (
    <WriteForm
      session={session}
      design={data.design}
      topic={data.topic}
      initial={initialSections(data.submission)}
      {...drawer}
    />
  );
}

type Phase =
  | { type: "idle" }
  | { type: "running" }
  | { type: "failed"; attempts: number | null }
  | { type: "terminal" }
  | { type: "noEntitlement" }
  | { type: "reevaluationLimit" };

type Notice =
  | { type: "empty"; message: string; sections: SectionId[] }
  | { type: "tooShort"; total: number | null }
  | { type: "saveFailed" }
  | { type: "error"; message: string };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const GROUPS = [
  { group: "intro", label: "서론" },
  { group: "body", label: "본론" },
  { group: "conclusion", label: "결론" },
] as const;

type FormProps = {
  session: SessionView;
  design: DesignView;
  topic: TopicView;
  initial: SubmissionSections;
} & DrawerControl;

function WriteForm({
  session,
  design,
  topic,
  initial,
  drawerOpen,
  onDrawerOpenChange,
  onToggleDrawer,
}: FormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const { applyBootstrap, refetchBootstrap } = useInquiryShell();
  const sessionId = session.id;

  const [sections, setSections] = useState<SubmissionSections>(initial);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);

  // 타이머 콜백이 최신 값을 읽도록 ref 로 들고 있는다.
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const savedRef = useRef<SubmissionSections | null>(initial);
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** 현재 8절을 저장한다. 성공하면 true. */
  const save = useCallback(
    async (auto: boolean): Promise<boolean> => {
      const snapshot = sectionsRef.current;
      busyRef.current = true;
      setSaving(true);
      const result = await postSubmission({ sessionId, sections: snapshot });
      busyRef.current = false;
      if (!alive.current) return result.kind === "ok";
      setSaving(false);
      if (result.kind !== "ok") return false;
      savedRef.current = snapshot;
      setSavedAt(new Date());
      setJustSaved(auto);
      return true;
    },
    [sessionId],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const dirty = isDirty(sectionsRef.current, savedRef.current);
      if (shouldAutosave({ dirty, busy: busyRef.current })) void save(true);
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [save]);

  function change(id: SectionId, value: string) {
    setSections((prev) => ({ ...prev, [id]: value }));
    setJustSaved(false);
  }

  async function manualSave() {
    setNotice(null);
    const ok = await save(false);
    if (!ok && alive.current) setNotice({ type: "saveFailed" });
  }

  const finishEvaluated = useCallback(
    (data: EvaluateResponse) => {
      applyBootstrap({ session: data.session });
      void refetchBootstrap();
      void queryClient.invalidateQueries({
        queryKey: inquiryQueryKeys.sessionDetail(userId, sessionId),
      });
      navigate(INQUIRY_PATHS.evaluate);
    },
    [
      applyBootstrap,
      refetchBootstrap,
      queryClient,
      userId,
      sessionId,
      navigate,
    ],
  );

  const runEvaluate = useCallback(async () => {
    setPhase({ type: "running" });
    let retries = 0;
    for (;;) {
      const result = await evaluateReport({ sessionId });
      if (!alive.current) return;
      const outcome: EvaluateOutcome = classifyEvaluate(result, retries);
      if (outcome.type === "retry") {
        retries += 1;
        await sleep(RUNNING_RETRY_MS);
        if (!alive.current) return;
        continue;
      }
      if (outcome.type === "ok" && result.kind === "ok") {
        finishEvaluated(result.data);
        return;
      }
      switch (outcome.type) {
        case "failed":
          setPhase({ type: "failed", attempts: outcome.attempts });
          return;
        case "terminal":
        case "noEntitlement":
        case "reevaluationLimit":
          setPhase({ type: outcome.type });
          return;
        case "sectionEmpty":
          setNotice({
            type: "empty",
            message: emptyMessage(precheckEmpty(sectionsRef.current)),
            sections: precheckEmpty(sectionsRef.current),
          });
          break;
        case "tooShort":
          setNotice({ type: "tooShort", total: null });
          break;
        case "error":
          setNotice({ type: "error", message: outcome.message });
          break;
        default:
          setNotice({
            type: "error",
            message: "평가를 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
          });
      }
      setPhase({ type: "idle" });
      return;
    }
  }, [sessionId, finishEvaluated]);

  async function submit() {
    setNotice(null);
    const check = precheck(sectionsRef.current);
    if (check.kind === "empty") {
      setNotice({
        type: "empty",
        message: emptyMessage(check.sections),
        sections: check.sections,
      });
      return;
    }
    if (check.kind === "tooShort") {
      setNotice({ type: "tooShort", total: check.total });
      return;
    }
    const saved = await save(false);
    if (!alive.current) return;
    if (!saved) {
      setNotice({ type: "saveFailed" });
      return;
    }
    await runEvaluate();
  }

  const rows = buildSectionRows(sections, design);
  const placeholders = countPlaceholders(sections);
  const running = phase.type === "running";
  const emptyIds = notice?.type === "empty" ? notice.sections : [];

  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-6",
        // 서랍이 열린 동안에는 xl 에서도 도우미 열을 접어 작성 칸이 좁아지지 않게 한다.
        drawerOpen
          ? cn("xl:grid-cols-1", FORM_DRAWER_GUTTER_CLASS)
          : "xl:grid-cols-[1fr_19rem]",
      )}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <fieldset disabled={running} className="flex flex-col gap-4">
          <legend className="sr-only">보고서 8절</legend>
          {GROUPS.map(({ group, label }) => (
            <section
              key={group}
              aria-labelledby={`write-group-${group}`}
              className="flex flex-col gap-5 rounded-xl border border-line/60 bg-white p-6"
            >
              <h2
                id={`write-group-${group}`}
                className="text-app-card-title font-bold text-ink-strong"
              >
                {label}
              </h2>
              {rows
                .filter((row) => row.group === group)
                .map((row) => (
                  <SectionEditor
                    key={row.id}
                    row={row}
                    value={sections[row.id]}
                    onChange={change}
                    invalid={emptyIds.includes(row.id)}
                  />
                ))}
            </section>
          ))}
        </fieldset>

        <PlaceholderWarning placeholders={placeholders} />

        {notice?.type === "empty" && (
          <p role="alert" className="text-app-label text-ink-strong">
            {notice.message}
          </p>
        )}
        {notice?.type === "tooShort" && <TooShortCard total={notice.total} />}
        {notice?.type === "saveFailed" && (
          <p role="alert" className="text-app-label text-ink-strong">
            저장하지 못했어요. 잠시 뒤 다시 시도해 주세요. 쓴 내용은 이 화면에
            그대로 있어요.
          </p>
        )}
        {notice?.type === "error" && (
          <p role="alert" className="text-app-label text-ink-strong">
            {notice.message}
          </p>
        )}

        {running && (
          <GeneratingCard
            title="평가 리포트를 만들고 있어요"
            lines={EVALUATE_LINES}
          />
        )}
        {phase.type === "failed" && (
          <EvaluateStatusCard
            variant="failed"
            attempts={phase.attempts}
            onRetry={() => void runEvaluate()}
          />
        )}
        {(phase.type === "terminal" ||
          phase.type === "noEntitlement" ||
          phase.type === "reevaluationLimit") && (
          <EvaluateStatusCard variant={phase.type} />
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <p role="status" className="text-app-caption text-ink-sub">
            {saveStatusText({ savedAt, justSaved })}
          </p>
          <DesignReportButton onClick={onToggleDrawer} expanded={drawerOpen} />
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 px-5 text-app-label"
            disabled={running || saving}
            onClick={() => void manualSave()}
          >
            중간 저장
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-10 px-5 text-app-label"
            disabled={running || saving}
            onClick={() => void submit()}
          >
            제출하고 평가받기
          </Button>
        </div>
      </div>

      <aside
        aria-label="작성 도우미"
        className={cn("xl:sticky xl:top-4", drawerOpen && "xl:hidden")}
      >
        <SidePanels design={design} />
      </aside>

      <DesignDrawer
        open={drawerOpen}
        onOpenChange={onDrawerOpenChange}
        design={design}
        topic={topic}
      />
    </div>
  );
}

/** 서버가 빈 절을 알렸을 때 현재 입력에서 빈 절을 다시 찾는다. */
function precheckEmpty(sections: SubmissionSections): SectionId[] {
  const check = precheck(sections);
  return check.kind === "empty" ? check.sections : [];
}
