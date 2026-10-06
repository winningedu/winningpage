import { Link, useLocation } from "react-router";
import { AppShellSidebar } from "@/components/app-shell/AppShellSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { GrowthStep, GrowthStepStatus } from "./deriveGrowthSteps";
import { GROWTH_PATHS } from "./growthPaths";

// 성장설계 앱 좌측 고정 사이드바. 상단 학생 표시, 메뉴 2항목, 진행단계 6스텝으로 구성한다.
// 수행평가 사이드바(PerformanceSidebar.tsx)와 같은 구조와 토큰을 쓴다(같은 AppShellSidebar 위).
//
// ⚠️ 표시 전용이다. 이름, 학년, 단계 상태는 계산하지 않고 prop 으로 받는다. 단계 상태는
//    deriveGrowthSteps(순수)가 만들고 GrowthAppLayout 이 셸 컨텍스트에서 읽어 내려보낸다.
//    값이 없으면 그 줄을 렌더하지 않는다. 가짜 이름이나 기본 학년을 만들지 않는다.
//
// 메뉴 활성 판정: `지난 리포트`는 목록(/app/growth/reports) 정확히 일치일 때만 활성이다.
// 리포트 상세(/app/growth/reports/:id)는 진행단계 5 `리포트`라 흐름 안 화면이므로 `성장설계`가 활성이다.
// 두 항목은 상호 배타라 NavLink 의 prefix 매칭 대신 Link 와 직접 판정을 쓴다
// (PerformanceSidebar.tsx 의 aria-current 중복 회귀 주석 참고).

const MENU_ITEMS = [
  { label: "성장설계", to: GROWTH_PATHS.home },
  { label: "지난 리포트", to: GROWTH_PATHS.reports },
] as const;

// 단계 3상태 스타일(수행평가와 같은 토큰). upcoming 과 locked 는 표시가 같고 locked 는 링크가 없다.
const STEP_STATE_STYLES: Record<
  GrowthStepStatus,
  { badge: string; label: string; pill: boolean }
> = {
  done: {
    badge: "bg-surface-badge text-ink",
    label: "font-medium text-ink",
    pill: false,
  },
  current: {
    badge: "bg-accent text-white",
    label: "font-semibold text-ink",
    pill: true,
  },
  upcoming: {
    badge: "bg-surface-04 text-ink-sub",
    label: "font-medium text-ink-sub",
    pill: false,
  },
  locked: {
    badge: "bg-surface-04 text-ink-sub",
    label: "font-medium text-ink-sub",
    pill: false,
  },
};

const STEP_SR_LABEL: Record<GrowthStepStatus, string> = {
  done: " 완료",
  current: " 진행 중",
  upcoming: " 진행 전",
  locked: " 이전 단계를 마치면 열려요",
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3">
      <path
        d="M2.5 6.2 4.9 8.6 9.5 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type GrowthSidebarProps = {
  /** 로그인 학생 이름. 없으면 이름 줄을 그리지 않는다. */
  studentName?: string | null;
  /** 학년 라벨(고1 등). 없으면 학년 줄을 그리지 않는다. */
  gradeLabel?: string | null;
  /** deriveGrowthSteps 결과. */
  steps: GrowthStep[];
};

export default function GrowthSidebar({
  studentName = null,
  gradeLabel = null,
  steps,
}: GrowthSidebarProps) {
  const { pathname } = useLocation();
  // 모바일 Sheet 는 링크 클릭만으로 닫히지 않아 명시적으로 닫는다(PerformanceSidebar 와 같은 이유).
  const { setOpenMobile } = useSidebar();

  const normalized = pathname.replace(/\/+$/, "");
  const isReportsList = normalized === GROWTH_PATHS.reports;

  return (
    <AppShellSidebar aria-label="성장설계 사이드바">
      <SidebarHeader className="px-6 pt-6">
        {studentName && (
          <p className="text-app-card-title font-bold text-ink-strong">
            {studentName}의 성장설계
          </p>
        )}
        {gradeLabel && (
          <p className="mt-2 text-app-label text-ink-sub">{gradeLabel}</p>
        )}
      </SidebarHeader>

      <SidebarContent className="overflow-hidden">
        <ScrollArea className="min-h-0 flex-1">
          <SidebarGroup
            role="navigation"
            aria-labelledby="growth-nav-heading"
            className="px-4"
          >
            <SidebarGroupLabel
              id="growth-nav-heading"
              className="h-auto px-2 text-app-label font-medium text-ink-sub"
            >
              메뉴
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {MENU_ITEMS.map((item) => {
                  const isActive =
                    item.to === GROWTH_PATHS.reports
                      ? isReportsList
                      : !isReportsList;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        isActive={isActive}
                        className="h-9 px-3 text-app-label text-ink data-active:bg-sidebar-accent data-active:font-semibold data-active:text-ink-strong hover:bg-sidebar-accent/60"
                        render={
                          <Link
                            to={item.to}
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => setOpenMobile(false)}
                          />
                        }
                      >
                        {item.label}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup
            role="region"
            aria-labelledby="growth-steps-heading"
            className="px-4"
          >
            <SidebarGroupLabel
              id="growth-steps-heading"
              className="h-auto px-2 text-app-label font-medium text-ink-sub"
            >
              진행단계
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <ol className="flex flex-col gap-0.25">
                {steps.map((step, index) => {
                  const style = STEP_STATE_STYLES[step.status];
                  const content = (
                    <>
                      <span
                        className={[
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          "text-app-label font-medium leading-4.5",
                          style.badge,
                        ].join(" ")}
                      >
                        {step.status === "done" ? <CheckIcon /> : index + 1}
                      </span>
                      <span
                        className={["text-app-label", style.label].join(" ")}
                      >
                        {step.label}
                      </span>
                      <span className="sr-only">
                        {STEP_SR_LABEL[step.status]}
                      </span>
                    </>
                  );
                  const rowClass = [
                    "flex h-9 items-center gap-4 rounded-md px-3",
                    style.pill ? "bg-sidebar-accent" : "",
                  ].join(" ");

                  // 이미 끝났거나 들어갈 수 있는 단계만 링크다. 현재와 잠긴 단계는 표시만 한다.
                  const linkable =
                    step.to !== null &&
                    (step.status === "done" || step.status === "upcoming");

                  return (
                    <li
                      key={step.key}
                      aria-current={
                        step.status === "current" ? "step" : undefined
                      }
                    >
                      {linkable ? (
                        <Link
                          to={step.to as string}
                          className={`${rowClass} hover:bg-sidebar-accent/60`}
                          onClick={() => setOpenMobile(false)}
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className={rowClass}>{content}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
    </AppShellSidebar>
  );
}
