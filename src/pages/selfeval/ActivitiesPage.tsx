import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { CARD } from "@/components/growth/start/cardStyles";
import {
  academicYearOf,
  bannerFromSnapshot,
  type CandidateFilter,
  deriveRoles,
  filterCandidates,
  initialSelection,
  toggleSelection,
} from "@/components/selfeval/activities/activitiesLogic";
import CandidateCard from "@/components/selfeval/activities/CandidateCard";
import ManualEntryCard from "@/components/selfeval/activities/ManualEntryCard";
import { initialManualForm } from "@/components/selfeval/activities/manualForm";
import SourceFilterCard from "@/components/selfeval/activities/SourceFilterCard";
import GrowthDirectionBanner from "@/components/selfeval/GrowthDirectionBanner";
import {
  useSelfevalScreenStep,
  useSelfevalShell,
} from "@/components/selfeval/SelfevalShellContext";
import { SELFEVAL_PATHS } from "@/components/selfeval/selfevalPaths";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { GENERIC_ERROR_MESSAGE } from "@/lib/growth/apiResult";
import {
  type ApiResult,
  pickManual,
  pickSelect,
  updateSession,
} from "@/lib/selfeval/api";
import {
  SelfevalApiError,
  selfevalPickQuery,
  selfevalQueryKeys,
  selfevalSessionQuery,
} from "@/lib/selfeval/queries";
import type {
  HighGrade,
  ManualInput,
  PickListResponse,
  SessionView,
} from "@/lib/selfeval/types";

// 자기평가서 활동 선택 화면(시안 14~29, 명세 No.26~36, 73, 107~113, 129, 130, 132).
// 경로: /app/selfeval/s/:sessionId/activities
//   ?manual=1  직접 입력 폼을 먼저 연다(저장된 활동이 0건인 시작 화면에서 넘어온다, 명세 No.102).
// 하단 고지는 SelfevalAppLayout 이 그린다.
const BODY = "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";
const NOTE =
  "rounded-xl bg-surface-04 px-5 py-4 text-app-label text-ink-strong";

function failureMessage(result: Exclude<ApiResult<unknown>, { kind: "ok" }>) {
  return result.kind === "error" ? result.message : GENERIC_ERROR_MESSAGE;
}

export default function ActivitiesPage() {
  useSelfevalScreenStep(3);
  const { sessionId = null } = useParams();
  const { userId } = useSession();
  const pick = useQuery(selfevalPickQuery(userId, sessionId));
  const detail = useQuery(selfevalSessionQuery(userId, sessionId));

  if (pick.data && detail.data && sessionId) {
    return (
      <ActivitiesBody
        sessionId={sessionId}
        pick={pick.data}
        session={detail.data.session}
        refetchAll={async () => {
          await Promise.all([pick.refetch(), detail.refetch()]);
        }}
      />
    );
  }

  const failed = pick.error ?? detail.error;
  return (
    <>
      <GoalPageHeader title="활동을 골라 주세요" />
      {failed ? (
        <div className={BODY}>
          <section className={CARD} role="alert">
            <p className="text-app-card-title font-bold text-ink-strong">
              활동을 불러오지 못했어요
            </p>
            <p className="mt-1 text-app-label text-ink-sub">
              무엇이 잘못됐는지:{" "}
              {failed instanceof SelfevalApiError
                ? failureMessage(failed.result)
                : GENERIC_ERROR_MESSAGE}{" "}
              다시 시도해 주세요.
            </p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="mt-4 h-10 px-5 text-app-label"
              onClick={() => {
                void pick.refetch();
                void detail.refetch();
              }}
            >
              다시 시도
            </Button>
          </section>
        </div>
      ) : (
        <div role="status" aria-label="불러오는 중" className={BODY}>
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}
    </>
  );
}

type BodyProps = {
  sessionId: string;
  pick: PickListResponse;
  session: SessionView;
  refetchAll: () => Promise<void>;
};

function ActivitiesBody({ sessionId, pick, session, refetchAll }: BodyProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const { refetchEntry } = useSelfevalShell();
  const [params] = useSearchParams();

  // 학생이 체크를 바꾸기 전까지는 서버 값(저장된 선택, 없으면 자동 추천)을 그대로 쓴다.
  const [local, setLocal] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<CandidateFilter>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [directionDismissed, setDirectionDismissed] = useState(false);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);

  const selected = local ?? initialSelection(pick);
  const roles = deriveRoles(selected, pick.candidates);
  // 분석을 시작한 뒤(단계 3 이상)에는 서버가 선택 변경을 거절한다. 파기하고 새로 시작해야 한다.
  const locked = pick.currentStep >= 3;
  const growthApplied = pick.growthApplied;
  const snapshot = growthApplied ? session.growthSnapshot : null;

  const showManual =
    manualOpen ??
    (params.get("manual") === "1" || pick.candidates.length === 0);

  const visible = filterCandidates(pick.candidates, filter);
  const isChosen = (id: string) =>
    roles.coreId === id || roles.supportIds.includes(id);
  const roleOf = (id: string) =>
    roles.coreId === id
      ? "core"
      : roles.supportIds.includes(id)
        ? "support"
        : null;
  const order = (id: string) =>
    roles.coreId === id ? 0 : roles.supportIds.indexOf(id) + 1;
  const chosenRows = visible
    .filter((r) => isChosen(r.activity.id))
    .sort((a, b) => order(a.activity.id) - order(b.activity.id));
  const otherRows = visible.filter((r) => !isChosen(r.activity.id));

  const academicYears = [
    ...new Set(
      pick.candidates
        .map((r) => academicYearOf(r.activity.createdAt))
        .filter((y): y is number => y !== null),
    ),
  ].sort((a, b) => b - a);
  const grades = [
    ...new Set(
      pick.candidates
        .map((r) => r.activity.gradeLabel)
        .filter((g): g is HighGrade => g !== null),
    ),
  ].sort();
  const subjects = [
    ...new Set(
      pick.candidates
        .map((r) => r.activity.subject)
        .filter((s): s is string => s !== null),
    ),
  ];

  function toggle(id: string) {
    if (locked) return;
    const result = toggleSelection(selected, id, pick.candidates);
    setLocal(result.next);
    setNotice(result.notice);
  }

  async function afterConfirm() {
    await refetchEntry();
    await queryClient.invalidateQueries({
      queryKey: selfevalQueryKeys.session(userId, sessionId),
    });
    await queryClient.invalidateQueries({
      queryKey: selfevalQueryKeys.pick(userId, sessionId),
    });
    navigate(SELFEVAL_PATHS.analysis(sessionId));
  }

  async function confirm() {
    if (busy || roles.coreId === null) return;
    setBusy(true);
    const result = await pickSelect(sessionId, roles.coreId, roles.supportIds);
    setBusy(false);
    if (result.kind !== "ok") {
      toast.error(failureMessage(result));
      return;
    }
    for (const warning of result.data.warnings) toast.info(warning);
    await afterConfirm();
  }

  async function submitManual(input: ManualInput) {
    if (busy) return;
    setBusy(true);
    const result = await pickManual(sessionId, input);
    setBusy(false);
    if (result.kind !== "ok") {
      toast.error(failureMessage(result));
      return;
    }
    await afterConfirm();
  }

  // 방향이 이번 과목과 어긋날 때 방향을 풀고 추천을 다시 받는다(시안 25).
  async function releaseDirection() {
    if (busy) return;
    setBusy(true);
    const result = await updateSession(sessionId, { growthApplied: false });
    if (result.kind !== "ok") {
      setBusy(false);
      toast.error(failureMessage(result));
      return;
    }
    setLocal(null);
    await refetchAll();
    await refetchEntry();
    setBusy(false);
  }

  const emptyAfterAuto = selected.length === 0 && pick.candidates.length > 0;

  return (
    <>
      <GoalPageHeader
        title={
          growthApplied
            ? "이 방향에 맞는 활동을 골라뒀습니다"
            : "활동을 골라 주세요"
        }
        subcopy="추천을 해제하거나 다른 활동을 추가할 수 있습니다. 최종 선택은 학생입니다"
      />
      <div className={BODY}>
        {snapshot ? (
          <GrowthDirectionBanner
            tone="dark"
            banner={bannerFromSnapshot(snapshot, session.gradeLabel)}
          />
        ) : (
          !growthApplied && (
            <p className="text-app-label font-medium text-ink-sub">
              방향 없이 진행 중
            </p>
          )
        )}

        {pick.direction?.mismatch && !directionDismissed && (
          <section className={`${CARD} bg-surface-04`}>
            <p className="text-app-card-title font-bold text-ink-strong">
              성장설계 방향이 이번 과목과 어긋나요
            </p>
            <p className="mt-1 text-app-label text-ink-sub">
              방향을 그대로 쓰면 추천 활동이 이번 과목과 덜 맞을 수 있어요.
              방향을 풀면 이번 과목 기준으로 다시 추천해요.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-9 px-4 text-app-label"
                disabled={busy}
                onClick={() => setDirectionDismissed(true)}
              >
                그대로 쓰기
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-9 px-4 text-app-label font-semibold"
                disabled={busy}
                onClick={() => void releaseDirection()}
              >
                방향 해제
              </Button>
            </div>
          </section>
        )}

        {locked ? (
          <section className={`${CARD} bg-surface-04`}>
            <p className="text-app-card-title font-bold text-ink-strong">
              분석을 시작한 뒤에는 활동을 바꿀 수 없어요
            </p>
            <p className="mt-1 text-app-label text-ink-sub">
              다른 활동으로 쓰려면 자기평가서를 파기하고 새로 시작해 주세요.
            </p>
            <Button
              type="button"
              size="lg"
              className="mt-4 h-10 px-5 text-app-label font-semibold"
              onClick={() => navigate(SELFEVAL_PATHS.analysis(sessionId))}
            >
              분석 확인으로 가기
            </Button>
          </section>
        ) : (
          <>
            <SourceFilterCard
              counts={pick.sourceCounts}
              filter={filter}
              onFilter={setFilter}
              academicYears={academicYears}
              grades={grades}
              subjects={subjects}
              selectedCount={selected.length}
            />

            {notice && (
              <p role="status" aria-label="선택 안내" className={NOTE}>
                {notice}
              </p>
            )}
            {roles.coreMismatch && (
              <p className={NOTE}>
                작성 과목의 활동이 없어요. 선생님이 요구한 활동이 맞는지
                확인하세요
              </p>
            )}
            {emptyAfterAuto &&
              (pick.auto?.noneAboveThreshold && local === null ? (
                <p className={NOTE}>
                  적합도가 기준에 못 미쳐 자동으로 고르지 않았어요. 목록에서
                  직접 골라 주세요.
                </p>
              ) : (
                <p className={NOTE}>
                  고른 활동이 없어요. 한 건 이상 골라야 분석할 수 있어요.
                </p>
              ))}
            {pick.planItem && growthApplied && (
              <div className={NOTE}>
                <p>
                  실행계획 과제가 남아 있어요. 다른 활동으로 저장하면 과제는
                  완료로 보내지 않아요.
                </p>
                <p className="mt-1 text-ink-sub">과제: {pick.planItem.title}</p>
              </div>
            )}

            {chosenRows.length > 0 && (
              <section className="flex flex-col gap-3" aria-label="선택한 활동">
                <h2 className="text-app-label font-medium text-ink-sub">
                  {growthApplied
                    ? "방향에 맞는 활동, 자동 선택됨"
                    : "선택한 활동"}
                </h2>
                {chosenRows.map((row) => (
                  <CandidateCard
                    key={row.activity.id}
                    row={row}
                    activityRole={roleOf(row.activity.id)}
                    checked
                    disabled={busy}
                    onToggle={() => toggle(row.activity.id)}
                  />
                ))}
              </section>
            )}
            {otherRows.length > 0 && (
              <section
                className="flex flex-col gap-3"
                aria-label="그 밖의 활동"
              >
                <h2 className="text-app-label font-medium text-ink-sub">
                  이번에 고르지 않은 활동이에요. 직접 추가할 수 있어요
                </h2>
                {otherRows.map((row) => (
                  <CandidateCard
                    key={row.activity.id}
                    row={row}
                    activityRole={null}
                    checked={false}
                    disabled={busy}
                    onToggle={() => toggle(row.activity.id)}
                  />
                ))}
              </section>
            )}

            {showManual ? (
              <ManualEntryCard
                initial={initialManualForm(session)}
                busy={busy}
                onCancel={() => setManualOpen(false)}
                onSubmit={(input) => void submitManual(input)}
              />
            ) : (
              <section className={CARD}>
                <h2 className="text-app-card-title font-bold text-ink-strong">
                  추가로 넣을 자료
                </h2>
                <p className="mt-1 text-app-label text-ink-sub">
                  저장된 활동 말고 다른 활동을 직접 입력할 수 있어요. 넣은
                  활동은 다음 자기평가서에서도 재료로 쓸 수 있어요.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="mt-4 h-10 px-5 text-app-label"
                  onClick={() => setManualOpen(true)}
                >
                  직접 입력
                </Button>
              </section>
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-10 px-5 text-app-label font-medium"
                onClick={() =>
                  navigate(`${SELFEVAL_PATHS.new}?sessionId=${sessionId}`)
                }
              >
                이전
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-10 px-5 text-app-label font-semibold"
                disabled={busy || roles.coreId === null}
                onClick={() => void confirm()}
              >
                선택한 {selected.length}건 분석하기
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
