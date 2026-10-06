import { useState } from "react";
import { useNavigate } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { CARD, CARD_TITLE } from "@/components/growth/start/cardStyles";
import {
  type ArchiveFilter,
  archivedSessions,
  archiveOptions,
  archiveTitle,
  filterSessions,
  rowAction,
  rowMeta,
  STATE_LABELS,
  sessionState,
} from "@/components/selfeval/archive/archiveLogic";
import DiscardConfirmModal from "@/components/selfeval/DiscardConfirmModal";
import {
  useSelfevalScreenStep,
  useSelfevalShell,
} from "@/components/selfeval/SelfevalShellContext";
import { PAGE_BODY } from "@/components/selfeval/SessionDetailGate";
import {
  routeForStep,
  SELFEVAL_PATHS,
} from "@/components/selfeval/selfevalPaths";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/context/ToastContext";
import { discardSession } from "@/lib/selfeval/api";
import {
  AREA_LABELS,
  type Area,
  type SessionListItem,
} from "@/lib/selfeval/types";

// 보관함(시안 56~57, 명세 No.66, 126, 127, 15). 경로: /app/selfeval/archive
// 하단 고지는 SelfevalAppLayout 이 그린다.

const SELECT =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-app-label text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const STATE_TONE: Record<string, string> = {
  writing: "bg-surface-02 text-ink-strong",
  completed: "bg-emerald-100 text-emerald-800",
  expired: "bg-surface-04 text-ink-sub",
  terminal: "bg-surface-04 text-ink-sub",
  discarded: "bg-surface-04 text-ink-natural",
};

export default function ArchivePage() {
  useSelfevalScreenStep(null);
  const navigate = useNavigate();
  const toast = useToast();
  const { sessions, openSession, isEntryLoading, refetchEntry } =
    useSelfevalShell();
  const [filter, setFilter] = useState<ArchiveFilter>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function startOver() {
    // 열린 세션이 있으면 서버가 새 세션을 막는다. 먼저 파기할지 묻는다(시안 57).
    if (openSession) setDiscardOpen(true);
    else navigate(SELFEVAL_PATHS.new);
  }

  async function discardAndStart() {
    if (!openSession || busy) return;
    setBusy(true);
    const result = await discardSession(openSession.id);
    if (result.kind !== "ok") {
      setBusy(false);
      toast.error(
        "작성 중인 자기평가서를 파기하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      );
      return;
    }
    await refetchEntry();
    setBusy(false);
    setDiscardOpen(false);
    navigate(SELFEVAL_PATHS.new);
  }

  function act(item: SessionListItem) {
    switch (rowAction(item)) {
      case "resume":
        return navigate(routeForStep(item.currentStep, item.id));
      case "view":
        return navigate(SELFEVAL_PATHS.done(item.id));
      case "restart":
        return startOver();
      case null:
        return;
    }
  }

  const header = <GoalPageHeader title="보관함" />;
  if (sessions === null) {
    return (
      <>
        {header}
        {isEntryLoading ? (
          <div role="status" aria-label="불러오는 중" className={PAGE_BODY}>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <div className={PAGE_BODY}>
            <section className={CARD} role="alert">
              <p className={CARD_TITLE}>보관함을 불러오지 못했어요</p>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="mt-4 h-10 px-5 text-app-label"
                onClick={() => void refetchEntry()}
              >
                다시 시도
              </Button>
            </section>
          </div>
        )}
      </>
    );
  }

  const archived = archivedSessions(sessions);
  if (archived.length === 0) {
    return (
      <>
        {header}
        <div className={PAGE_BODY}>
          <section className={CARD}>
            <p className={CARD_TITLE}>아직 자기평가서가 없어요</p>
            <Button
              type="button"
              size="lg"
              className="mt-4 h-10 px-5 text-app-label font-semibold"
              onClick={() => navigate(SELFEVAL_PATHS.new)}
            >
              새로 만들기
            </Button>
          </section>
        </div>
      </>
    );
  }

  const options = archiveOptions(archived);
  const visible = filterSessions(archived, filter);
  const numberOrUndefined = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <>
      {header}
      <div className={PAGE_BODY}>
        <div className="flex flex-wrap gap-3">
          <select
            aria-label="학년도"
            className={SELECT}
            value={filter.academicYear ?? ""}
            onChange={(e) =>
              setFilter({
                ...filter,
                academicYear: numberOrUndefined(e.target.value),
              })
            }
          >
            <option value="">학년도 전체</option>
            {options.academicYears.map((y) => (
              <option key={y} value={y}>
                {y}학년도
              </option>
            ))}
          </select>
          <select
            aria-label="학기"
            className={SELECT}
            value={filter.semester ?? ""}
            onChange={(e) =>
              setFilter({
                ...filter,
                semester: numberOrUndefined(e.target.value) as
                  | 1
                  | 2
                  | undefined,
              })
            }
          >
            <option value="">학기 전체</option>
            {options.semesters.map((s) => (
              <option key={s} value={s}>
                {s}학기
              </option>
            ))}
          </select>
          <select
            aria-label="과목 영역"
            className={SELECT}
            value={filter.area ?? ""}
            onChange={(e) =>
              setFilter({
                ...filter,
                area: (e.target.value || undefined) as Area | undefined,
              })
            }
          >
            <option value="">영역 전체</option>
            {options.areas.map((a) => (
              <option key={a} value={a}>
                {AREA_LABELS[a]}
              </option>
            ))}
          </select>
          <select
            aria-label="상태"
            className={SELECT}
            value={filter.state ?? ""}
            onChange={(e) =>
              setFilter({
                ...filter,
                state: (e.target.value || undefined) as ArchiveFilter["state"],
              })
            }
          >
            <option value="">상태 전체</option>
            {options.states.map((s) => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {visible.length === 0 ? (
          <p className="text-app-label text-ink-sub">
            조건에 맞는 자기평가서가 없어요
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((item) => {
              const state = sessionState(item);
              const action = rowAction(item);
              return (
                <li
                  key={item.id}
                  className={`${CARD} flex items-center justify-between gap-4`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={CARD_TITLE}>{archiveTitle(item)}</p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-app-caption font-semibold ${STATE_TONE[state]}`}
                      >
                        {STATE_LABELS[state]}
                      </span>
                    </div>
                    <ul className="mt-1 flex flex-wrap gap-x-3 text-app-label text-ink-sub">
                      {rowMeta(item).map((meta) => (
                        <li key={meta}>{meta}</li>
                      ))}
                    </ul>
                  </div>
                  {action && (
                    <Button
                      type="button"
                      variant={action === "resume" ? "default" : "outline"}
                      size="lg"
                      className="h-10 shrink-0 px-5 text-app-label font-semibold"
                      onClick={() => act(item)}
                    >
                      {action === "resume"
                        ? "이어서 작성하기"
                        : action === "view"
                          ? "다시 보기"
                          : "새로 시작하기"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <DiscardConfirmModal
        open={discardOpen}
        busy={busy}
        onClose={() => setDiscardOpen(false)}
        onConfirm={() => void discardAndStart()}
      />
    </>
  );
}
