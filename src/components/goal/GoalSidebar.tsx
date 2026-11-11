import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppShellSidebar } from "@/components/app-shell/AppShellSidebar";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/context/AuthProvider";
import { kstYMD } from "@/lib/goal/calc/index.js";
import type { FetchTodayGoalRecordResult } from "@/lib/goalApi";
import {
  fetchGoalSchedules,
  fetchGoalTimer,
  heartbeatGoalTimer,
} from "@/lib/goalApi";
import {
  goalDailyRecordQueryOptions,
  goalStudentQueryOptions,
} from "@/lib/queryClient";
import GoalSidebarContent from "./GoalSidebarContent";

// "진행중" 뱃지 폴링 간격 — Timer.jsx 본문 폴링(20초)보다 느슨하게 둔다. 사이드바는
// GoalAppLayout에 상주해 어느 목표관리 화면에 있어도 계속 폴링되므로 과한 빈도는 낭비다.
const TIMER_BADGE_POLL_MS = 45 * 1000;

// 하트비트 간격 — 예전 Timer.jsx 로컬 상수와 같은 값(60초)을 그대로 옮겼다.
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/**
 * QA3 행305 후속 — "오늘의 공부 기록" 미기록 뱃지 판정. 순수 함수로 분리해
 * 단독 테스트한다(Dashboard.tsx buildTodayHeadline과 동일 관례). record.recordIndex가
 * null이 아니면(실제 daily_records 행 존재 — 타이머 시간만으로 합성된 프리필은
 * recordIndex:null이라 여기 해당 없다, api/_routes/goal/daily-record.ts mergeTimerIntoRecord
 * 계약) 오늘 이미 기록을 남긴 것이다. cooldown.active도 같은 결론(제출하지 않으면
 * 잠금 자체가 없다) — 자정을 갓 넘겨 오늘 행은 아직 없지만 어제 밤 제출로 잠금만
 * 남아 있는 경우까지 "기록함"으로 잡는다.
 */
export function deriveDailyRecordDone(
  result: FetchTodayGoalRecordResult | undefined,
): boolean {
  if (!result || result.kind !== "success") return false;
  return Boolean(result.record?.recordIndex != null || result.cooldown?.active);
}

// 사이드바 뱃지 소스 — 중요일정 카운트(GET /api/goal/schedules, due_date 오늘 이후 행 수)와
// 타이머 진행 여부(GET /api/goal/timer 45초 폴링), 오늘의 공부 기록 제출 여부
// (dailyRecordDone, QA3 행305 후속 — goalDailyRecordQueryOptions 공유 캐시)를
// 실데이터로 쓴다. GoalAppLayout이 props 없이 셸로 마운트하므로 이 컴포넌트가
// 직접 조회한다(StudyPlanRail 자체 조회 선례, 전역 상태 도입 없음).
//
// shadcn Sidebar 전환(2026-09-06, 사용자 결정 "목표관리/수행평가 다 같은 스타일로") —
// 데스크톱 고정·모바일 대응은 이제 AppShellSidebar(공통 래퍼, 수행평가와 공유)가
// 전담한다. 이 컴포넌트가 직접 갖고 있던 모바일 상단 앱바(제목·"메인으로" 링크)와
// Base UI Dialog 기반 드로어는 shadcn 내장 Sheet로 대체되며 제거했다 — 데이터
// 조회·폴링 책임(아래)만 그대로 이 컴포넌트에 남는다.
export default function GoalSidebar() {
  const [timerRunning, setTimerRunning] = useState(false);
  // 하트비트 effect가 setInterval 콜백 안에서 읽을 최신값 — effect 자체는 마운트 시
  // 한 번만 등록하고(빈 의존성 배열) 매 폴링마다 재구독하지 않으므로 state 클로저가
  // 아니라 ref로 최신 실행 여부를 넘긴다.
  const timerRunningRef = useRef(false);
  const [scheduleCount, setScheduleCount] = useState(0);
  // ['goal','student', userId] 쿼리 캐시(src/lib/queryClient.ts)를 그대로 구독한다 —
  // 목표관리 진입 시 미들웨어·Dashboard.tsx가 이미 채워둔 캐시를 재사용해 사이드바
  // 전용 재요청을 없앤다(명세 B-3 §5). 캐시 키의 userId는 리뷰 C1(계정 전환 캐시
  // 오염 방지). data가 없거나 kind가 'onboarded'가 아니면(방어적 분기, Dashboard.jsx와
  // 동일 사유) "나의 목표관리" 폴백 문구만 보여준다.
  const { userId } = useAuth();
  const { data: goalStudentResult } = useQuery(goalStudentQueryOptions(userId));
  const profile =
    goalStudentResult?.kind === "onboarded"
      ? goalStudentResult.student.profile
      : null;

  // QA3 행305 후속 — "오늘의 공부 기록" 미기록 뱃지(판정 로직은 deriveDailyRecordDone).
  const { data: dailyRecordResult } = useQuery(
    goalDailyRecordQueryOptions(userId),
  );
  const dailyRecordDone = deriveDailyRecordDone(dailyRecordResult);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const result = await fetchGoalTimer();
      if (!cancelled && result.kind === "success") {
        const running = Boolean(result.summary?.running);
        timerRunningRef.current = running;
        setTimerRunning(running);
      }
    };

    poll();
    const intervalId = setInterval(poll, TIMER_BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  // 열공 타이머 하트비트(QA 행286 "이탈 시 자동 마감" 수정) — 예전엔 Timer.jsx가 자신이
  // 마운트돼 있을 때만 하트비트를 보내, 타이머를 켠 채 다른 메뉴로 이동하면 하트비트가
  // 끊겨 서버 TIMER_STALE_MS(5분) 무하트비트 타임아웃으로 세션이 강제 마감됐다. 이 사이드바는
  // GoalAppLayout에 상주해 목표관리 앱 안 어느 화면에 있어도 마운트가 유지되므로, 여기서
  // 실행 중 세션이 있을 때만(timerRunningRef, 위 폴링이 45초마다 갱신) 하트비트를 보낸다 —
  // Timer.jsx는 더 이상 자체 하트비트를 보내지 않는다(이중 전송 방지). 탭을 완전히 닫으면
  // pagehide가 마지막으로 한 번 더 보내고, 그 이후는 서버 스테일 마감이 그대로 안전장치로
  // 남는다(의도된 동작, 유지).
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (timerRunningRef.current) heartbeatGoalTimer();
    }, HEARTBEAT_INTERVAL_MS);
    const onPageHide = () => {
      if (timerRunningRef.current) heartbeatGoalTimer({ keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    fetchGoalSchedules().then((result) => {
      if (!alive || result.kind !== "success") return;
      const today = kstYMD(new Date());
      const upcoming = result.schedules.filter(
        (schedule) => schedule.dueDate >= today,
      );
      setScheduleCount(upcoming.length);
    });

    return () => {
      alive = false;
    };
  }, []);

  const navBadgeData = { scheduleCount, dailyRecordDone, timerRunning };

  // 모바일 Sheet는 shadcn 기본 동작상 링크 클릭만으로 스스로 닫히지 않는다
  // (DialogClose가 아닌 일반 <a> 클릭은 Dialog를 닫지 않는다) — 옛 Base UI Dialog
  // 드로어가 onNavigate로 직접 닫아 주던 것과 같은 이유로 여기서도 명시적으로 닫는다.
  const { setOpenMobile } = useSidebar();

  return (
    <AppShellSidebar aria-label="목표관리 사이드바">
      <GoalSidebarContent
        profile={profile}
        navBadgeData={navBadgeData}
        onNavigate={() => setOpenMobile(false)}
      />
    </AppShellSidebar>
  );
}
