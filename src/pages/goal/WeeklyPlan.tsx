import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import GoalCard from "@/components/goal/GoalCard";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import {
  pickWeekdayDates,
  WEEKDAY_REPEAT_SCHEDULE,
} from "@/components/goal/goalFormOptions";
import AddTaskModal from "@/components/goal/modals/AddTaskModal";
import WeekdayPlanBoard from "@/components/goal/plan/WeekdayPlanBoard";
import {
  createGoalPlanTask,
  deleteGoalPlanTask,
  fetchGoalPlanTasks,
} from "@/lib/goalApi";
import {
  durationLabelToMinutes,
  formatWeekRangeLabel,
  getTodayShortKeyInWeek,
  getWeekDates,
  WEEKDAY_LABELS,
} from "@/lib/goalPlanUtils";

// 주간 학습 계획표(#27 빈 / #29 채움) — docs/figma-goal/part-09.md·part-10.md.
// 단계 E(임무 지시) 배선: GET /api/goal/plan-tasks로 이번 주 실데이터를 그리드에 채우고,
// "+ 추가"는 AddTaskModal을 거쳐 실제로 저장한다. 목업(mockWeeklyPlan)은 로딩·에러 표시
// 용도로만 남기지 않는다 — Dashboard.jsx가 이미 쓰는 "불러오는 중" 카드 패턴을 그대로
// 재사용한다.
//
// 주 이동(이전/다음 주) 컨트롤은 시안에 없다(part-09 §301 "고정 텍스트처럼 보인다") — 이번
// 단계에서 신설을 확정했다(임무 지시 "주 이동 이전/다음 화살표 추가 — 확정 결정"). 헤더
// meta 라벨 양옆에 화살표 2개를 GoalPageHeader의 actions 슬롯(Schedules.jsx 선례)에 얹는다.
// 오늘 요일 강조도 같은 이유로 신설이다(WeekdayPlanBoard.jsx todayKey prop).
// goal_plan_tasks 행(camelCase) — goalApi.js fetchGoalPlanTasks 계약.
type PlanTask = {
  id: string | number;
  planDate: string;
  title: string;
  subject: string;
  durationMinutes?: number;
  done?: boolean;
  sortOrder?: number;
  // 문제집 연결(QA 행286-B, 선택) — 연결이 없으면 workbookTitle이 null.
  workbookId?: number | null;
  pageFrom?: number | null;
  pageTo?: number | null;
  workbookTitle?: string | null;
};

type PlanTasksResult =
  | { kind: "success"; tasks: PlanTask[] }
  | { kind: "no-session" | "not-allowed" | "validation-error" | "error" };

export default function WeeklyPlan() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // null = 로딩 중. 이후로는 discriminated union('success'|'not-allowed'|'error'|...) 그대로 보관한다
  // (Dashboard.jsx result 상태와 동일 패턴 — goalApi.js kind 계약을 다시 해석하는 지점을 좁힌다).
  const [result, setResult] = useState<PlanTasksResult | null>(null);

  const weekDates = getWeekDates(weekOffset);
  const todayKey = getTodayShortKeyInWeek(weekDates);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) weekDates는 weekOffset의 순함수라 weekOffset만 의존성으로 둔다 — 매 렌더 새 배열 참조 때문에 무한 재요청되는 것을 막는다.
  const loadTasks = useCallback(() => {
    setResult(null);
    // weekDates는 항상 getWeekDates()가 만든 7일치 배열이라 첫/끝 원소가 항상 존재한다.
    fetchGoalPlanTasks({ from: weekDates[0]!, to: weekDates[6]! }).then((r) =>
      setResult(r as PlanTasksResult),
    );
  }, [weekOffset]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  function handleAddTask(dayLabel: string, dateYmd: string) {
    setSelectedDay(dayLabel);
    setSelectedDate(dateYmd);
    setTaskModalOpen(true);
  }

  function handleCloseModal() {
    setTaskModalOpen(false);
    setSelectedDay(null);
    setSelectedDate(null);
  }

  // "일정" 셀렉트가 정하는 것은 반복 규칙이 아니라 "몇 개의 plan_date에 각각 1행씩 만들지"다
  // (sql/75_goal_plan_tasks.sql 헤더 주석, 판단 기록). 반복 예약(미래 주 자동 생성) 컬럼이
  // 없으므로 "매주 반복"은 "이번 주만"과 동일하게 현재 표시 중인 주 7일에만 만든다 —
  // 스키마를 넓히지 않고 안전(최대 7행)하게 담을 수 있는 유일한 해석이다.
  async function handleTaskSubmit({
    subject,
    taskText,
    duration,
    schedule,
    weekdays,
    workbookId,
    pageFrom,
    pageTo,
  }: {
    subject: string;
    taskText: string;
    duration: string;
    schedule: string;
    weekdays?: number[];
    workbookId?: number;
    pageFrom?: number;
    pageTo?: number;
  }) {
    // handleAddTask가 모달을 열기 전에 selectedDate를 항상 먼저 채운다("오늘만" 제출은
    // 이 흐름을 통해서만 도달한다).
    // "선택요일반복"은 표시 중인 주 중 고른 요일의 날짜만 만든다(미래 주 생성 없음).
    const targetDates =
      schedule === "오늘만"
        ? [selectedDate!]
        : schedule === WEEKDAY_REPEAT_SCHEDULE
          ? pickWeekdayDates(weekDates, weekdays ?? [])
          : weekDates;
    const durationMinutes = durationLabelToMinutes(duration);
    // 문제집 연결 과제는 여러 날짜로 못 펼치게 AddTaskModal이 이미 막지만(문제집
    // 연결 시 일정 select 자체를 비활성), API에도 같은 신호를 실어 보내 서버가
    // 한 번 더 확인하게 한다(임무 지시 정정, 2026-09-02 — "이번 주만" 복제도 포함).
    const repeatSchedule = schedule !== "오늘만";

    const results = await Promise.all(
      targetDates.map((planDate) =>
        createGoalPlanTask({
          planDate,
          title: taskText,
          subject,
          durationMinutes,
          ...(workbookId !== undefined ? { workbookId } : {}),
          ...(pageFrom !== undefined ? { pageFrom } : {}),
          ...(pageTo !== undefined ? { pageTo } : {}),
          ...(repeatSchedule ? { repeatSchedule } : {}),
        }),
      ),
    );

    const failed = results.filter((r) => r.kind !== "success");
    if (failed.length > 0) {
      console.error("[WeeklyPlan] 일부 과제 생성 실패:", failed);
    }

    loadTasks();

    if (failed.length === targetDates.length) {
      // 전량 실패면 모달을 닫지 않고 사용자가 다시 시도할 수 있게 예외를 던진다
      // (AddTaskModal.handleSubmit이 이 예외를 잡아 폼을 유지한다).
      throw new Error("과제 생성에 실패했습니다.");
    }
  }

  // 행280/321(계획) — 주간학습계획표 카드의 × → 인라인 확인까지 마친 뒤에만
  // 여기 도달한다(WeekdayPlanBoard.tsx). 대시보드 레일에는 삭제가 없다(행305).
  async function handleDeleteTask(task: { id: string | number }) {
    const deleted = await deleteGoalPlanTask(task.id as number);
    if (deleted.kind !== "success") {
      console.error("[WeeklyPlan] 과제 삭제 실패:", deleted);
    }
    loadTasks();
  }

  // weekDates(YYYY-MM-DD) → WeekdayPlanBoard가 기대하는 {day, date, dateYmd, tasks} 7개.
  function buildBoardDays(tasks: PlanTask[]) {
    const tasksByDate = new Map<string, PlanTask[]>();
    for (const task of tasks) {
      const list = tasksByDate.get(task.planDate) || [];
      list.push(task);
      tasksByDate.set(task.planDate, list);
    }

    return weekDates.map((dateYmd, i) => ({
      // weekDates는 7개 고정, WEEKDAY_LABELS도 7개 고정이라 i는 항상 유효 인덱스다.
      day: WEEKDAY_LABELS[i]!,
      date: Number(dateYmd.slice(8, 10)),
      dateYmd,
      tasks: (tasksByDate.get(dateYmd) || []).map((task) => ({
        id: task.id,
        subject: task.subject,
        title: task.title,
        workbookTitle: task.workbookTitle ?? null,
        pageFrom: task.pageFrom ?? null,
        pageTo: task.pageTo ?? null,
      })),
    }));
  }

  const headerActions = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setWeekOffset((prev) => prev - 1)}
        aria-label="이전 주"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => setWeekOffset((prev) => prev + 1)}
        aria-label="다음 주"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );

  return (
    <>
      <GoalPageHeader
        title="주간 학습 계획표"
        meta={formatWeekRangeLabel(weekDates)}
        actions={headerActions}
        subcopy="저장한 계획은 대시보드의 요일 학습 계획에 자동 반영됩니다."
      />
      <div className="max-w-goal-content px-4 pb-24 md:px-12">
        {result === null && (
          <GoalCard tone="neutral" className="px-8 py-7">
            <p className="text-app-body leading-[1.4] text-ink-sub">
              주간 계획을 불러오는 중입니다…
            </p>
          </GoalCard>
        )}

        {/* not-allowed(미결제)·no-session 등은 이 페이지가 스스로 처리하지 않는다 — RequireGoalAccess가
            이미 이 라우트를 3단계 게이트로 감싸므로(Dashboard.jsx §154 주석과 동일 전제) 정상 경로에선
            도달하지 않는 방어적 분기다. 크래시 대신 안내만 하고 게이트가 다음 진입 때 재판정하게 둔다. */}
        {result && result.kind !== "success" && (
          <GoalCard tone="neutral" className="px-8 py-7">
            <p className="text-app-body leading-[1.4] text-ink-sub">
              주간 계획을 불러오지 못했습니다. 새로고침해 주세요.
            </p>
          </GoalCard>
        )}

        {result?.kind === "success" && (
          <WeekdayPlanBoard
            days={buildBoardDays(result.tasks)}
            onAddTask={handleAddTask}
            onDeleteTask={handleDeleteTask}
            todayKey={todayKey}
          />
        )}
      </div>

      {selectedDay && (
        <span className="sr-only" aria-live="polite">
          {selectedDay} 과제 추가 모달 열림
        </span>
      )}
      <AddTaskModal
        open={taskModalOpen}
        onClose={handleCloseModal}
        // exactOptionalPropertyTypes: day는 명시적 undefined를 못 받는 optional prop이라
        // 값이 있을 때만 스프레드로 넘긴다.
        {...(selectedDay ? { day: selectedDay } : {})}
        onSubmit={handleTaskSubmit}
      />
    </>
  );
}
