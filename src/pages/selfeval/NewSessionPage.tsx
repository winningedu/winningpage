import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import AppModal from "@/components/goal/AppModal";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import BasicsForm from "@/components/selfeval/basics/BasicsForm";
import {
  type BasicsErrors,
  type BasicsForm as BasicsFormState,
  buildCreateInput,
  buildProfilePayload,
  classifySubmitError,
  formFromSession,
  initialForm,
  type SubmitErrorView,
  validateBasics,
} from "@/components/selfeval/basics/basicsLogic";
import {
  clearHandoff,
  readHandoffItemId,
} from "@/components/selfeval/basics/handoff";
import { saveBasicsProfile } from "@/components/selfeval/basics/profileApi";
import {
  useSelfevalScreenStep,
  useSelfevalShell,
} from "@/components/selfeval/SelfevalShellContext";
import {
  routeForStep,
  SELFEVAL_PATHS,
} from "@/components/selfeval/selfevalPaths";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import {
  createSession,
  discardSession,
  updateSession,
} from "@/lib/selfeval/api";
import { selfevalSessionQuery } from "@/lib/selfeval/queries";
import type { EntryResponse, SessionView } from "@/lib/selfeval/types";

// 자기평가서 기본 입력 화면(시안 07~13, 명세 No.20~25, 68, 70, 72, 74, 104~106). 경로: /app/selfeval/new
//   ?sessionId=  이미 만든 세션의 기본 입력을 고친다(활동 선택 화면의 이전 버튼). 활동을 고르기 전에만 가능하다.
//   ?manual=1    직접 입력으로 시작한다. 세션을 만든 뒤 활동 선택 화면에 그대로 넘겨 직접 입력 폼을 먼저 연다.
// 하단 고지는 SelfevalAppLayout 이 그린다.
const BODY = "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";
const LOCKED_MESSAGE =
  "활동을 고른 뒤에는 기본 입력을 바꿀 수 없어요. 파기하고 새로 시작해 주세요.";
const QUOTA_MESSAGE =
  "이용 가능 횟수가 없어요. 이용권을 구매하면 바로 시작할 수 있어요.";

type Entry = EntryResponse["entry"];

export default function NewSessionPage() {
  useSelfevalScreenStep(2);
  const [params] = useSearchParams();
  const sessionId = params.get("sessionId");
  const { entry, isEntryLoading, refetchEntry } = useSelfevalShell();
  const { userId } = useSession();
  const detail = useQuery(selfevalSessionQuery(userId, sessionId));

  const header = <GoalPageHeader title="어떤 자기평가서를 쓸까요" />;

  if (!entry) {
    return (
      <>
        {header}
        {isEntryLoading ? (
          <Loading />
        ) : (
          <Retry onRetry={() => void refetchEntry()} />
        )}
      </>
    );
  }
  if (sessionId) {
    if (detail.isPending) {
      return (
        <>
          {header}
          <Loading />
        </>
      );
    }
    if (!detail.data) {
      return (
        <>
          {header}
          <Retry onRetry={() => void detail.refetch()} />
        </>
      );
    }
    return (
      <>
        {header}
        <BasicsBody
          entry={entry}
          session={detail.data.session}
          manual={params.get("manual") === "1"}
        />
      </>
    );
  }
  return (
    <>
      {header}
      <BasicsBody
        entry={entry}
        session={null}
        manual={params.get("manual") === "1"}
      />
    </>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="불러오는 중" className={BODY}>
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={BODY}>
      <p className="text-app-body text-ink-sub">
        기본 입력 정보를 불러오지 못했어요.
      </p>
      <div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-10 px-5 text-app-label"
          onClick={onRetry}
        >
          다시 시도
        </Button>
      </div>
    </div>
  );
}

function BasicsBody({
  entry,
  session,
  manual,
}: {
  entry: Entry;
  /** 있으면 수정 모드, 없으면 새로 만든다. */
  session: SessionView | null;
  manual: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { userId } = useSession();
  const { refetchEntry } = useSelfevalShell();

  const [form, setForm] = useState<BasicsFormState>(() => {
    if (session) return formFromSession(session, entry);
    const base = initialForm(entry);
    // 성장설계 실행계획에서 넘어온 과제는 과제 카드의 초기 선택이 된다(새로 만들 때만).
    const handoffItemId = entry.growth
      ? readHandoffItemId(
          safeSessionStorage(),
          entry.growth.planItems.map((item) => item.id),
        )
      : null;
    return handoffItemId ? { ...base, planItemId: handoffItemId } : base;
  });
  // 전달값은 한 번만 쓴다. 지우지 않으면 다음에 직접 들어온 새 세션에도 같은 과제가 선택된다.
  useEffect(() => clearHandoff(safeSessionStorage()), []);
  const [errors, setErrors] = useState<BasicsErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<SubmitErrorView | null>(null);

  // 활동을 고른 뒤(단계 2 이상)에는 서버가 수정을 거절한다. 미리 막아 헛걸음을 줄인다.
  const locked = session !== null && session.currentStep >= 2;

  // 수정 모드의 성장설계 카드는 세션이 고정한 스냅샷과 같은 리포트일 때만 보여 준다.
  // 더 새 리포트가 나왔어도 이 세션의 방향은 바뀌지 않는다(서버가 생성 때 고정한다).
  const growth = session
    ? entry.growth && session.growthSnapshot?.reportId === entry.growth.reportId
      ? entry.growth
      : null
    : entry.growth;

  const patch = (next: Partial<BasicsFormState>) =>
    setForm((prev) => ({ ...prev, ...next }));

  function goActivities(id: string) {
    navigate(`${SELFEVAL_PATHS.activities(id)}${manual ? "?manual=1" : ""}`);
  }

  async function send() {
    const input = buildCreateInput(form);
    const result = session
      ? await updateSession(session.id, input)
      : await createSession(input);
    return { input, result };
  }

  async function submit() {
    if (submitting || locked) return;
    const found = validateBasics(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setProblem(null);
    setSubmitting(true);
    // 학생 공용 프로필을 먼저 올린다. 다음 진입 때 이 값이 초기값이 된다. 실패해도 작성은 계속한다.
    if (userId) {
      const saved = await saveBasicsProfile(userId, buildProfilePayload(form));
      if (!saved.ok) {
        toast.error(
          "학생 정보를 저장하지 못했어요. 자기평가서는 계속 만들 수 있어요.",
        );
      }
    }
    const { result } = await send();
    setSubmitting(false);
    if (result.kind === "ok") {
      await refetchEntry();
      goActivities(result.data.session.id);
      return;
    }
    setProblem(classifySubmitError(result));
  }

  // 작성 중인 세션이 있어 막혔을 때: 파기하고 같은 입력으로 다시 만든다.
  async function discardAndCreate(openSessionId: string | null) {
    const target = openSessionId ?? entry.openSession?.id ?? null;
    if (!target || submitting) {
      toast.error(
        "작성 중인 자기평가서를 찾지 못했어요. 처음 화면에서 확인해 주세요.",
      );
      return;
    }
    setSubmitting(true);
    const discarded = await discardSession(target);
    if (discarded.kind !== "ok") {
      setSubmitting(false);
      toast.error(
        "작성 중인 자기평가서를 파기하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      );
      return;
    }
    const { result } = await send();
    setSubmitting(false);
    if (result.kind === "ok") {
      await refetchEntry();
      setProblem(null);
      goActivities(result.data.session.id);
      return;
    }
    setProblem(classifySubmitError(result));
  }

  const open = problem?.kind === "open" ? problem : null;
  const resumeTo = entry.openSession
    ? routeForStep(entry.openSession.currentStep, entry.openSession.id)
    : SELFEVAL_PATHS.home;

  return (
    <div className={BODY}>
      {locked && (
        <p
          role="alert"
          className="rounded-xl bg-surface-04 px-5 py-4 text-app-label text-ink-strong"
        >
          {LOCKED_MESSAGE}
        </p>
      )}
      <BasicsForm
        form={form}
        errors={errors}
        entry={entry}
        growth={growth}
        profileMissing={session === null && entry.profile === null}
        disabled={submitting || locked}
        onChange={patch}
      />

      {problem && problem.kind !== "open" && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl bg-surface-04 px-5 py-4 text-app-label text-ink-strong"
        >
          <span>{problemMessage(problem)}</span>
          {problem.kind === "quota" && (
            <Link
              to="/pricing?service=selfeval"
              className="shrink-0 font-semibold text-accent underline underline-offset-2"
            >
              이용권 보러 가기
            </Link>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3">
        {session && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 px-5 text-app-label font-medium"
            onClick={() => navigate(SELFEVAL_PATHS.activities(session.id))}
          >
            이전
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          className="h-10 px-5 text-app-label font-semibold"
          disabled={submitting || locked}
          onClick={() => void submit()}
        >
          이 조건으로 활동 찾기
        </Button>
      </div>

      <AppModal
        open={open !== null}
        onClose={() => setProblem(null)}
        title="작성 중인 자기평가서가 있어요"
        subtitle="이어서 쓰거나, 파기하고 지금 입력한 조건으로 새로 만들 수 있어요. 이미 차감된 이용 횟수는 돌아오지 않아요."
        cancelLabel="이어서 하기"
        onCancel={() => navigate(resumeTo)}
        submitLabel="파기하고 새로 만들기"
        submitDisabled={submitting}
        onSubmit={() => void discardAndCreate(open?.openSessionId ?? null)}
      />
    </div>
  );
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function problemMessage(problem: Exclude<SubmitErrorView, { kind: "open" }>) {
  switch (problem.kind) {
    case "quota":
      return QUOTA_MESSAGE;
    case "locked":
      return LOCKED_MESSAGE;
    case "not_open":
      return "이 자기평가서는 더 이상 고칠 수 없어요. 처음 화면에서 새로 시작해 주세요.";
    case "message":
      return problem.message;
  }
}
