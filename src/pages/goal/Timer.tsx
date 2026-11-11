import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import AddSubjectButton from "@/components/goal/study/AddSubjectButton";
import AddSubjectModal from "@/components/goal/study/AddSubjectModal";
import SessionRecordPanel from "@/components/goal/study/SessionRecordPanel";
import SubjectTimerCard from "@/components/goal/study/SubjectTimerCard";
import TimerSummaryBar from "@/components/goal/study/TimerSummaryBar";
import {
  DEFAULT_TIMER_SUBJECTS,
  TIMER_SUBJECT_CATALOG,
} from "@/components/goal/studyRecordOptions";
import { getSubjectLabel } from "@/components/goal/subjectTokens";
import { useAuth } from "@/context/AuthProvider";
import {
  getDayIndexFromYMDServer,
  kstYMD,
  VIRTUAL_DAY_NAMES,
} from "@/lib/goal/calc/index.js";
import {
  addGoalTimerSubject,
  fetchGoalTimer,
  setGoalTimerTarget,
  startGoalTimer,
  stopGoalTimer,
} from "@/lib/goalApi";
import { goalStudentQueryOptions } from "@/lib/queryClient";

const POLL_INTERVAL_MS = 20 * 1000; // GET 폴링 15~30초 범위(임무 지시)

// 열공 타이머(#25) 기본 4과목 스톱워치 2×2(420×241) + 전체 합계 바(860×100) + 오늘 세션
// 기록 패널(420×382). part-09 §45~144. QA B9(2026-08-27)로 "+ 과목 추가"가 생겨 카드
// 수는 더 이상 4로 고정이 아니다 — 카드는 GET /api/goal/timer의 visibleSubjects 순서
// 그대로 렌더한다(카탈로그 8종 중 학생이 노출을 늘린 만큼).
//
// 서버 시각이 유일 진실이다(임무 지시 확정 사항) — 이 컴포넌트는 GET /api/goal/timer가
// 준 진행 중 세션의 startedAt과 "추정 서버 현재 시각"(clockOffsetMs, 마지막 GET 응답의
// serverNow − Date.now())으로 매초 표시값만 다시 계산한다. 저장은 하지 않는다 —
// setInterval이 하는 일은 화면 갱신 트리거(tick)뿐이고, 실제 누적은 항상 서버 재조회로
// 확정된다(폴링·visibilitychange·start/stop 직후 reload).
// GET /api/goal/timer 응답(camelCase) — api/_routes/goal/timer.js 헤더 주석 참고.
type GoalTimerSummaryBody = {
  date: string;
  serverNow: string;
  running: { subject: string; startedAt: string } | null;
  subjects: Array<{ subject: string; seconds: number }>;
  totalSeconds: number;
  targets: Array<{ subject: string; targetHours: number }>;
  visibleSubjects: string[];
};

type TimerSummary = {
  date: string;
  running: { subject: string; startedAt: string } | null;
  subjectSeconds: Record<string, number>;
  subjectTargets: Record<string, number>;
  totalSeconds: number;
  visibleSubjects: string[];
};

export default function Timer() {
  const [summary, setSummary] = useState<TimerSummary | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [idealTodayHours, setIdealTodayHours] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [, setTick] = useState(0);
  const pendingRef = useRef(false);

  const applySummary = useCallback((body: GoalTimerSummaryBody) => {
    const subjectSeconds: Record<string, number> = {};
    for (const row of body.subjects || [])
      subjectSeconds[row.subject] = row.seconds;
    const subjectTargets: Record<string, number> = {};
    for (const row of body.targets || [])
      subjectTargets[row.subject] = row.targetHours;

    setSummary({
      date: body.date,
      running: body.running || null,
      subjectSeconds,
      subjectTargets,
      totalSeconds: body.totalSeconds ?? 0,
      visibleSubjects: body.visibleSubjects?.length
        ? body.visibleSubjects
        : DEFAULT_TIMER_SUBJECTS,
    });
    setClockOffsetMs(new Date(body.serverNow).getTime() - Date.now());
    setLoadError(false);
  }, []);

  const reload = useCallback(async () => {
    const result = await fetchGoalTimer();
    if (result.kind === "success") {
      applySummary(result.summary);
    } else if (result.kind !== "no-session" && result.kind !== "not-allowed") {
      setLoadError(true);
    }
  }, [applySummary]);

  // 최초 로드(타이머 요약)는 reload()가, 오늘 요일 이상 목표 총합(과목별 목표
  // 기본값 산출용, 저장하지 않는 파생값)은 ['goal','student'] 쿼리 캐시(아래
  // useQuery)가 각각 맡는다.
  useEffect(() => {
    reload();
  }, [reload]);

  // 캐시(src/lib/queryClient.ts)를 그대로 구독한다 — goal 진입 시 미들웨어·
  // Dashboard.tsx가 이미 채워둔 응답을 재사용해 이 페이지 전용 재요청을 없앤다
  // (명세 B-3 §5, 캐시 키의 userId는 리뷰 C1).
  const { userId } = useAuth();
  const { data: goalStudentResult } = useQuery(goalStudentQueryOptions(userId));

  useEffect(() => {
    if (goalStudentResult?.kind !== "onboarded") return;
    // goalApi.ts는 weeklySchedule을 Record<string, unknown>으로만 선언한다(넓은 계약) —
    // 실제 값 모양은 Dashboard.tsx가 이미 쓰는 {ideal, min} 레코드와 같다.
    const weeklySchedule = (goalStudentResult.student?.weeklySchedule ||
      {}) as Record<string, { ideal: number; min: number } | undefined>;
    // getDayIndexFromYMDServer는 항상 0~6을 반환하고 VIRTUAL_DAY_NAMES는 7개 고정이다.
    const dayName =
      VIRTUAL_DAY_NAMES[getDayIndexFromYMDServer(kstYMD(new Date()))]!;
    const idealToday = weeklySchedule?.[dayName]?.ideal;
    setIdealTodayHours(typeof idealToday === "number" ? idealToday : null);
  }, [goalStudentResult]);

  // 노출 과목 목록(GET /api/goal/timer visibleSubjects, QA B9) — "+ 과목 추가"로 늘어날
  // 수 있어 요일 목표 총합을 나눌 분모가 더 이상 고정 4가 아니다. summary가 아직 없으면
  // (최초 로딩 중) 기본 4과목으로 잠깐 보여준다.
  const visibleSubjects = summary?.visibleSubjects ?? DEFAULT_TIMER_SUBJECTS;

  // visibleSubjects는 매 렌더 새 배열 참조(summary?.visibleSubjects ?? DEFAULT_TIMER_SUBJECTS)라
  // length만 의존성으로 둔다 — 값이 같으면(과목 수가 안 바뀌면) 재계산하지 않는다.
  const defaultTargetHours = useMemo(() => {
    if (idealTodayHours == null || visibleSubjects.length === 0) return null;
    return idealTodayHours / visibleSubjects.length;
  }, [idealTodayHours, visibleSubjects.length]);

  // GET 폴링(15~30초) + 탭 복귀 시 refetch.
  useEffect(() => {
    const intervalId = setInterval(reload, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  // 표시용 1초 틱 — 서버 재조회 없이 진행 중 카드의 경과 표시만 갱신한다.
  useEffect(() => {
    const intervalId = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(intervalId);
  }, []);

  // 하트비트(60초 간격 + pagehide keepalive)는 더 이상 이 페이지가 보내지 않는다 —
  // GoalAppLayout에 상주하는 GoalSidebar가 대신 보낸다(QA 행286, "타이머 이탈 시
  // 자동 마감" 수정). 이 페이지에 있을 때만 하트비트가 나가면 다른 메뉴로 이동한
  // 순간 서버 TIMER_STALE_MS(5분) 타임아웃으로 세션이 강제 마감됐다 — 이제는 goal
  // 앱 안 어디에 있어도 실행 중 세션이 있으면 계속 하트비트가 나간다(이중 전송
  // 방지를 위해 이 페이지 쪽 발송은 제거).

  const estimatedNowMs = Date.now() + clockOffsetMs;
  const runningSubject = summary?.running?.subject ?? null;
  const runningStartedAtMs = summary?.running?.startedAt
    ? new Date(summary.running.startedAt).getTime()
    : null;
  const liveElapsedSeconds =
    runningStartedAtMs != null
      ? Math.max(0, Math.floor((estimatedNowMs - runningStartedAtMs) / 1000))
      : 0;

  // 배타 실행: 진행 중인 카드를 다시 누르면 종료, 그 외 카드를 누르면 서버가 자동으로
  // 이전 과목을 전환 마감한다(part-09 §133 "다른 과목을 시작하면 이전 과목은 자동으로 멈춥니다").
  const handleToggle = async (subjectId: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      if (runningSubject === subjectId) {
        await stopGoalTimer();
      } else {
        await startGoalTimer(subjectId);
      }
      await reload();
    } finally {
      pendingRef.current = false;
    }
  };

  const handleTargetChange = async (subjectId: string, hours: number) => {
    const result = await setGoalTimerTarget(subjectId, hours);
    if (result.kind === "success") {
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              subjectTargets: { ...prev.subjectTargets, [subjectId]: hours },
            }
          : prev,
      );
    }
  };

  // "+ 과목 추가"(QA B9) — 성공하면 reload()로 visibleSubjects를 포함한 전체 요약을
  // 다시 가져온다(모달 자체는 낙관적 갱신을 하지 않는다, 실패 시 모달이 에러를 보여준다).
  const canAddMoreSubjects =
    visibleSubjects.length < TIMER_SUBJECT_CATALOG.length;

  const handleAddSubject = async (subjectId: string) => {
    const result = await addGoalTimerSubject(subjectId);
    if (result.kind !== "success") {
      throw new Error(`add-subject-failed:${result.kind}`);
    }
    await reload();
  };

  const cards = visibleSubjects.map((id) => {
    const accumulatedSeconds = summary?.subjectSeconds?.[id] ?? 0;
    const running = runningSubject === id;
    const hasCustomTarget = summary?.subjectTargets?.[id] != null;
    // hasCustomTarget이 이미 summary.subjectTargets[id] != null을 확인했다.
    const targetHours = hasCustomTarget
      ? summary!.subjectTargets![id]!
      : (defaultTargetHours ?? 0);

    return {
      id,
      label: getSubjectLabel(id),
      targetHours,
      isDefaultTarget: !hasCustomTarget,
      elapsedSeconds: running
        ? accumulatedSeconds + liveElapsedSeconds
        : accumulatedSeconds,
      running,
    };
  });

  const totalSeconds = (summary?.totalSeconds ?? 0) + liveElapsedSeconds;

  return (
    <>
      <GoalPageHeader
        title="열공 타이머"
        subcopy="측정한 시간은 종료 시 오늘의 공부 기록과 순공 시간에 자동 반영됩니다."
      />
      <div className="max-w-goal-content px-4 pb-24 md:px-12">
        <p className="mb-6 text-app-body leading-[1.4] text-ink-sub">
          한 번에 한 과목만 측정돼요. 다른 과목을 시작하면 이전 과목은 자동으로
          멈춥니다.
        </p>
        {loadError && (
          <p className="mb-6 text-app-body leading-[1.4] text-error">
            타이머 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        {/* 카드 그리드(860px) + 우측 세션 패널(420px=26.25rem) — part-09 §54~63. 고정 rem 컬럼은
            반응형 범위 밖이지만(작업 지시 확정 사항 §6) grid/flex 기반이라 추후 브레이크포인트를
            얹기 쉽다. */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_26.25rem]">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {cards.map((subject) => (
                <SubjectTimerCard
                  key={subject.id}
                  label={subject.label}
                  colorKey={subject.id}
                  targetHours={subject.targetHours}
                  isDefaultTarget={subject.isDefaultTarget}
                  elapsedSeconds={subject.elapsedSeconds}
                  running={subject.running}
                  onToggle={() => handleToggle(subject.id)}
                  onTargetChange={(hours) =>
                    handleTargetChange(subject.id, hours)
                  }
                />
              ))}
            </div>
            {canAddMoreSubjects && (
              <AddSubjectButton onClick={() => setAddSubjectOpen(true)} />
            )}
            <TimerSummaryBar totalSeconds={totalSeconds} />
          </div>
          <SessionRecordPanel subjects={cards} />
        </div>
      </div>
      <AddSubjectModal
        open={addSubjectOpen}
        onClose={() => setAddSubjectOpen(false)}
        visibleSubjects={visibleSubjects}
        onAdd={handleAddSubject}
      />
    </>
  );
}
