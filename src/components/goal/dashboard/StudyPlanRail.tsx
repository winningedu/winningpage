import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import GoalCard from "@/components/goal/GoalCard";
import GoalChecklistRow from "@/components/goal/GoalChecklistRow";
import GoalEmptyState from "@/components/goal/GoalEmptyState";
import AddTaskModal from "@/components/goal/modals/AddTaskModal";
import {
  createGoalPlanTask,
  fetchGoalPlanTasks,
  updateGoalPlanTask,
} from "@/lib/goalApi";
import {
  durationLabelToMinutes,
  getTodayWeekdayLabel,
  getWeekDates,
  kstYMD,
  nextPlanTaskStatus,
  type PlanTaskStatus,
} from "@/lib/goalPlanUtils";

// 우측 레일 "OO요일 나의 학습 계획하기" 카드 — 데이터 유무에 따라 194↔342 가변(part-07 §272).
// 절대 좌표 대신 flex column + gap 20px(부모 GoalDashboard 레일 스택)로 쌓는다.
//
// goal_plan_tasks 행(camelCase, api/_lib/goal/repo.ts buildPlanTaskPayload), goalApi.js 헤더 주석 참고.
// status가 단일 원본(QA 행305) — done은 하위 호환 파생값이라 이 컴포넌트는 읽지 않는다.
type PlanTask = {
  id: number | string;
  planDate: string;
  title: string;
  subject: string;
  durationMinutes?: number;
  status: PlanTaskStatus;
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

// 이 위젯이 스스로 오늘(GET /api/goal/plan-tasks?from=to=오늘) 과제를 소유·조회한다
// (모달 오픈 상태를 스스로 소유하던 기존 관례를 데이터에도 그대로 확장 — 부모
// Dashboard.jsx를 건드리지 않는다).
//
// QA 행305 — ✓(체크)는 done↔pending, ✕는 fail↔pending을 토글하는 status 전환 PUT이다.
// 둘 다 삭제(DELETE)가 아니다 — "미달성 표시"가 곧 이 항목의 핵심 수정이다. 다음 status는
// nextPlanTaskStatus(goalPlanUtils.ts, 순수 함수)가 계산하고, 이 핸들러는 낙관적 갱신 후
// 실패 시 되돌린다(콘솔 에러 로그 + 재조회로 복구). 계획 카드 자체의 삭제는 여기(대시보드)가
// 아니라 주간학습계획표(WeekdayPlanBoard.tsx)에서만 한다(행280/행321).
export default function StudyPlanRail() {
  const [modalOpen, setModalOpen] = useState(false);
  // null = 로딩 중. 이후 discriminated union('success'|'not-allowed'|'error'|...) 그대로 보관.
  const [result, setResult] = useState<PlanTasksResult | null>(null);
  const today = kstYMD();

  const loadTasks = useCallback(() => {
    fetchGoalPlanTasks({ from: today, to: today }).then((r) =>
      setResult(r as PlanTasksResult),
    );
  }, [today]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const tasks = result?.kind === "success" ? result.tasks : [];
  const hasTasks = tasks.length > 0;

  async function setTaskStatus(task: PlanTask, action: "check" | "fail") {
    const nextStatus = nextPlanTaskStatus(task.status, action);
    const snapshot = tasks;
    // 낙관적 갱신 — 목록 안의 해당 id만 status를 뒤집는다.
    setResult((prev) =>
      prev?.kind === "success"
        ? {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === task.id ? { ...t, status: nextStatus } : t,
            ),
          }
        : prev,
    );

    // goal_plan_tasks.id 는 DB serial(number) — id: number|string 은 React key 겸용 방어 타입
    const updated = await updateGoalPlanTask(task.id as number, {
      status: nextStatus,
    });
    if (updated.kind !== "success") {
      console.error("[StudyPlanRail] 상태 전환 실패:", updated);
      setResult((prev) =>
        prev?.kind === "success" ? { ...prev, tasks: snapshot } : prev,
      );
    }
  }

  function handleCheck(task: PlanTask) {
    return setTaskStatus(task, "check");
  }

  function handleFail(task: PlanTask) {
    return setTaskStatus(task, "fail");
  }

  // "일정" 셀렉트 해석은 WeeklyPlan.jsx와 동일하다(판단 기록 — sql/75 헤더 주석 참고):
  // "오늘만"은 오늘 1건, "이번 주만"/"매주 반복"은 이번 주(월~일) 7건.
  async function handleTaskSubmit({
    subject,
    taskText,
    duration,
    schedule,
    workbookId,
    pageFrom,
    pageTo,
  }: {
    subject: string;
    taskText: string;
    duration: string;
    schedule: string;
    workbookId?: number;
    pageFrom?: number;
    pageTo?: number;
  }) {
    const targetDates = schedule === "오늘만" ? [today] : getWeekDates(0);
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
      console.error("[StudyPlanRail] 일부 과제 생성 실패:", failed);
    }

    loadTasks();

    if (failed.length === targetDates.length) {
      throw new Error("과제 생성에 실패했습니다.");
    }
  }

  // "오늘 학습 계획 저장하기" — 체크/삭제가 이미 개별 즉시 저장(PUT/DELETE)이라 이 버튼이
  // 다시 저장할 미확정 상태가 없다(임무 지시 판단 위임 절). 최신 서버 상태를 다시 끌어와
  // "저장 확인/새로고침" 역할로 재배정한다(판단 기록).
  // 재조회 도중에도 기존 목록을 그대로 보여준다(setResult(null)로 비우지 않는다) —
  // "로딩 중" 깜빡임 없이 loadTasks() 완료 시 최신 목록으로만 교체된다.
  function handleRefresh() {
    loadTasks();
  }

  return (
    <GoalCard tone="mint" className="flex flex-col gap-4 px-5 py-5">
      <h3 className="text-app-card-title font-bold text-ink-strong">
        {getTodayWeekdayLabel()} 나의 학습 계획하기
      </h3>

      {/* not-allowed(미결제)·no-session 등은 이 위젯이 스스로 처리하지 않는다 — RequireGoalAccess가
          대시보드 라우트를 이미 3단계 게이트로 감싸므로(Dashboard.jsx §154 주석과 동일 전제) 정상
          경로에선 도달하지 않는 방어적 분기다. */}
      {(() => {
        if (result === null)
          return (
            <p className="py-6 text-center text-app-label text-ink-sub">
              불러오는 중…
            </p>
          );
        if (result.kind !== "success")
          return (
            <p className="py-6 text-center text-app-label text-ink-sub">
              불러오지 못했습니다. 새로고침해 주세요.
            </p>
          );
        if (hasTasks)
          return (
            <>
              <ul className="flex flex-col gap-2">
                {tasks.map((task, index) => {
                  // 문제집 연결 캡션(QA 행286-B) — 연결이 없으면 undefined라 caption
                  // 자체를 넘기지 않는다(exactOptionalPropertyTypes, AddTaskModal
                  // day prop과 동일 관례).
                  const caption = task.workbookTitle
                    ? `${task.workbookTitle}${
                        task.pageFrom != null && task.pageTo != null
                          ? ` p.${task.pageFrom}–${task.pageTo}`
                          : ""
                      }`
                    : null;
                  return (
                    <GoalChecklistRow
                      key={task.id}
                      index={index + 1}
                      text={task.title}
                      {...(caption ? { caption } : {})}
                      status={task.status}
                      onCheck={() => handleCheck(task)}
                      onFail={() => handleFail(task)}
                    />
                  );
                })}
              </ul>
              {/* 항목이 있으면 안내 문장 대신 아이콘형 "+ 과제 추가" 버튼만 남긴다(임무 지시
                  §4) — part-06 §279의 상시 노출 안내문은 빈 상태(GoalEmptyState) 전용으로 좁혔다. */}
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex items-center justify-center gap-1 text-center text-app-caption text-ink-sub transition-colors hover:text-ink-strong"
              >
                <Plus size={12} aria-hidden="true" />
                과제 추가
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                className="h-9.5 w-full rounded-lg bg-[#4CAF6D] text-app-label font-semibold text-white"
              >
                오늘 학습 계획 저장하기
              </button>
            </>
          );
        return (
          <GoalEmptyState
            message="+ 버튼을 눌러 과제를 추가하세요"
            onAdd={() => setModalOpen(true)}
          />
        );
      })()}

      <AddTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleTaskSubmit}
      />
    </GoalCard>
  );
}
