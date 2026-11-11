import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthProvider";
import OnboardingProgress from "./OnboardingProgress";

type OnboardingUser = {
  user_metadata?: {
    name?: string;
    full_name?: string;
    student_name?: string;
  };
  email?: string;
};

// 로그인 사용자 이름 추출 — api/_routes/create-service-ticket.js의 getUserName()과 동일한 우선순위
// (user_metadata.name → full_name → student_name → email)를 프런트에서 재사용할 별도 헬퍼가
// 없어 그대로 이식했다.
function getUserDisplayName(user?: OnboardingUser | null) {
  const meta = user?.user_metadata || {};
  return String(
    meta.name || meta.full_name || meta.student_name || user?.email || "",
  ).trim();
}

type OnboardingStepShellProps = {
  current: number;
  total: number;
  children?: ReactNode;
};

// 온보딩 7스텝 공통 셸 — docs/figma-goal/00-INDEX.md §3 G1 / §5-3 `OnboardingStepShell`.
// 구조: 아이브로우("목표 관리 프로그램") → 인사 헤딩(2줄) → 진행 바 → 카드 스택 → 버튼 행.
// 스텝 바디(children — QuestionCard 1~2장 + WizardActions)만 교체된다.
// 헤더/푸터는 SiteLayout이 렌더하므로 이 컴포넌트는 그 사이 콘텐츠만 담당한다. Header가
// position:fixed(4rem)라 페이지 루트(Onboarding.jsx)에서 pt-16으로 겹침을 보정하고, 여기서는
// 그 안쪽 컨테이너 상단 여백(7.5rem)만 추가한다(00-INDEX.md §6-3 "컨테이너 상단 여백").
export default function OnboardingStepShell({
  current,
  total,
  children,
}: OnboardingStepShellProps) {
  // 이 라우트는 RequireGoalAccess가 로그인 세션을 이미 검증한 뒤에만 마운트되므로 세션 부재
  // 자체는 여기서 다시 방어하지 않는다 — 그래도 이름을 못 읽는 경우(메타데이터 미기재 등)를
  // 대비해 userName은 빈 문자열이면 기존 "학생님" 문구로 폴백한다.
  // 세션은 AuthProvider(전역 단일 구독)에서 읽는다 — 이 컴포넌트가 따로 getSession()을
  // 부르지 않는다(명세 B-3 §4).
  const { user } = useAuth();
  const userName = getUserDisplayName(user);

  // 페이지 배경(surface-04)은 부모(Onboarding.jsx의 전체 폭 루트 div)가 담당한다 — 이 div는
  // 콘텐츠 폭 제한(max-w-68.75rem) 전용이라 여기 배경을 주면 회색 패널이 페이지 위에 떠 보인다.
  return (
    <div className="mx-auto w-full max-w-275 px-4 pb-30">
      <div className="mt-30">
        <p className="text-app-card-title font-semibold text-accent">
          목표 관리 프로그램
        </p>
        <h1 className="mt-5 text-app-title font-bold text-ink-strong">
          {userName ? `${userName} 학생, 안녕하세요!` : "안녕하세요, 학생님!"}
          <br />
          입력하신 정보로 학습량을 계산해 드려요
        </h1>
        <OnboardingProgress current={current} total={total} className="mt-6" />
      </div>

      <div className="mt-10 flex flex-col gap-perf-inset">{children}</div>
    </div>
  );
}
