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
import { siteWording } from "@/config/wording";

// 수행평가 앱 좌측 고정 사이드바 — docs/수행평가-상세-명세.md §3.2(블록 실측) / §3.3(진행단계
// 상태 머신) / §3.4(메뉴 라벨 정본). 프로필 · 메뉴 · 진행단계 3블록으로 구성된다.
//
// ⚠️ **표시 전용 컴포넌트다.** 진행단계 상태는 계산하지 않고 `stepStates` prop으로 받는다 —
//    라이브 세션 상태에서 5스텝 상태를 파생하는 `deriveStepStates`는
//    `deriveStepStates.js`(P13, 순수 함수)이고, 호출부는 `PerformanceChatPage`다. 파생값은
//    `PerformanceShellContext`를 통해 `PerformanceAppLayout`이 이 컴포넌트로 내려보낸다
//    (외부 앱에 off-by-one 결함이 있던 지점이라 파생 규율을 별도 파일 주석에 못박아 뒀다 —
//    `deriveStepStates.js`, api/performance/bootstrap.js `deriveResumeStep` 주석 참고).
//
// ⚠️ 프로필·진행단계 값의 실제 소스는 `GET /api/performance/bootstrap`이다
//    (`profile.name` / `profile.schoolType`, 학년은 `lastSession.gradeLabel`). 그 호출은
//    `PerformanceAppLayout`이 `performanceBootstrapQueryOptions`(src/lib/queryClient.ts)
//    캐시를 구독해 붙이고, 이 컴포넌트는 **여전히 prop만 받는다**(P5 해소 — 배선 위치만
//    셸로 확정됐을 뿐 이 컴포넌트의 표시 전용 성격은 그대로다). 값이 없으면 그 줄을
//    렌더하지 않을 뿐, 가짜 이름·리터럴 기본값을 만들어 내지 않는다(§11 Q61-ⓔ).
//    `SessionContext`는 auth 세션과 이용권만 들고 있고 프로필 행은 갖고 있지 않다.
//
// shadcn Sidebar 전환(2026-09-06, 사용자 결정 "목표관리/수행평가 다 같은 스타일로") —
// 고정(스크롤해도 화면에 붙어 있음) 동작과 폭을 목표관리 사이드바(GoalSidebar.tsx)와
// 한 곳(AppShellSidebar.tsx)에서 공유하려고 이 파일이 shadcn `Sidebar` 프리미티브
// 기반으로 바뀌었다. 시안 절대좌표를 역산한 여백 계산은 더 이상 유효하지 않아 지웠다
// (구조 자체가 flex column + shadcn 표준 패딩으로 바뀌었기 때문) — 시안은 예시일
// 뿐이라는 원칙(design-is-example-not-pixel)에 따라 값(타이포·라벨·상태 규칙)만
// 정본으로 남기고 좌표 주석은 폐기했다.
//
// (QA 행279, 2026-09-06) 상단 "메인으로" 링크(QA 행318)·하단 "메인으로 나가기" 버튼
// (QA 행280, `window.confirm` 이탈 확인 포함)은 제거했다 — 앱 셸 최상단에 사이트 공통
// 헤더(PerformanceAppLayout.tsx 참고)가 새로 붙으면서 헤더 로고·메뉴가 메인 이동 통로
// 역할을 대신한다.

// §3.4 메뉴 라벨. 시안 원문은 `3754:3035` 한 노드만 `위닝 채팅`이고 나머지 전 인앱
// 노드가 `위닝 AI 채팅`이라 후자가 정본이었으나, 사용자 지시로 화면 문구에서 "AI" 표기를
// 전부 제거하며 `위닝 채팅`으로 확정한다(결과적으로 시안 예외 노드와 표기가 같아진다).
// 세 번째 항목 `설정`은 `3754:4872` 단독 출현이라 이번 범위에서 제외한다(§3.4, §11 Q3).
const MENU_ITEMS = [
  { label: "위닝 채팅", to: "/app/performance" },
  { label: "저장 리포트", to: "/app/performance/reports" },
];

// §3.3 스텝 라벨 원문. `작성・평가`의 가운뎃점은 U+30FB(・)이며 시안 원문 그대로다.
const PERFORMANCE_STEPS = [
  { step: 1, label: "기본 정보" },
  { step: 2, label: "안내문 입력" },
  { step: 3, label: "주제 추천" },
  { step: 4, label: "설계 리포트" },
  { step: 5, label: "작성・평가" },
];

// §3.3 3상태. 시안 자체는 활성 pill 유무 2상태뿐이라 완료/미도래가 구분되지 않는데,
// §3.3이 그 한계를 3상태로 확장하는 것을 정본으로 규정했다(배지 색·라벨 굵기·pill 표).
const STEP_STATE_STYLES: Record<
  "done" | "current" | "todo",
  { badge: string; label: string; pill: boolean }
> = {
  // 완료: 배지 #d1e8ff(surface-badge) + 체크, 라벨 #525252 w500, pill 없음.
  done: {
    badge: "bg-surface-badge text-ink",
    label: "font-medium text-ink",
    pill: false,
  },
  // 진행 중: 배지 #0b84fd(accent) + 흰 숫자, 라벨 #525252 w600, pill #eaecef(sidebar-accent).
  current: {
    badge: "bg-accent text-white",
    label: "font-semibold text-ink",
    pill: true,
  },
  // 미도래: 배지 #f5f5f7(surface-04) + ink-sub 숫자, 라벨 ink-sub w500, pill 없음.
  // `ink-sub`가 #6b6b6b로 상향되며 배지(14px on surface-04 = 4.89:1)·라벨(16px on
  // sidebar #f9f8f7 = 5.02:1) 모두 WCAG AA(4.5:1)를 충족한다(tailwind.config.js
  // `ink.sub` 주석 참고). 과거 `TODO(P19, §11.3 Q30)`는 해소되어 제거했다.
  todo: {
    badge: "bg-surface-04 text-ink-sub",
    label: "font-medium text-ink-sub",
    pill: false,
  },
};

// 저장 리포트 화면(`3754:3077` / `3754:3121`)은 **활성 스텝이 0개**다(§3.3 노드별 표).
// 그래서 기본값이 「전부 미도래」이고, 활성 스텝 없음은 예외가 아니라 정상 입력이다.
const DEFAULT_STEP_STATES = ["todo", "todo", "todo", "todo", "todo"];

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

type PerformanceSidebarProps = {
  /** 로그인 학생 이름 — `bootstrap.profile.name`. */
  profileName?: string | null;
  /** 학교유형 — `profiles.school_type`(§11 Q61-ⓔ 결정). */
  schoolType?: string | null;
  /** 학년 — STEP1 세션 입력값(`performance_sessions.grade_label`). */
  gradeLabel?: string | null;
  /** 5스텝 상태. 길이 5를 기대하며 모자란 자리·모르는 값은 `todo`로 떨어진다. 파생은
   * 호출부(`deriveStepStates.js` + `PerformanceChatPage`) 책임이다. */
  stepStates?: Array<"done" | "current" | "todo">;
};

export default function PerformanceSidebar({
  profileName = null,
  schoolType = null,
  gradeLabel = null,
  stepStates = DEFAULT_STEP_STATES as Array<"done" | "current" | "todo">,
}: PerformanceSidebarProps) {
  const { pathname } = useLocation();

  // `/app/performance/:sessionId`(새로고침 복구)도 채팅 화면이므로 `위닝 채팅`이 활성이어야
  // 한다. NavLink의 `end`만으로는 그 경로에서 활성이 꺼지므로 경로 판정을 직접 한다.
  // 두 항목은 상호 배타다 — `3754:3121`에서 pill이 `저장 리포트`로 **이동**하고
  // `위닝 채팅` 쪽 pill은 사라진다.
  const isReports = pathname.startsWith("/app/performance/reports");

  // §11 Q61-ⓔ 결정: 부제는 `{학년}・{학교유형}` 조합이며 **학년 값이 없으면 학년 조각만
  // 미렌더**한다. 외부 앱의 리터럴 기본값 `'일반고'`는 이식 금지 항목이라 여기서도
  // 만들지 않는다 — 둘 다 없으면 부제 줄 자체를 렌더하지 않는다.
  const subtitle = [gradeLabel, schoolType].filter(Boolean).join("・");

  // 모바일 Sheet는 링크 클릭만으로 스스로 닫히지 않는다(DialogClose가 아닌 일반
  // <a> 클릭은 Dialog를 닫지 않는다) — GoalSidebar.tsx와 같은 이유로 명시적으로 닫는다.
  const { setOpenMobile } = useSidebar();

  return (
    <AppShellSidebar aria-label="수행평가 사이드바">
      {/* 프로필 — 같은 인앱 셸인 목표관리 사이드바(GoalSidebarContent.tsx)와 타이포를
          맞춘다: 이름 1.125rem/w700(font-bold)/ink-strong, 부제 0.875rem/w400/ink-sub,
          gap mt-2(0.5rem). 값이 없으면 그 줄 자체를 렌더하지 않는다(§11 Q61-ⓔ). */}
      <SidebarHeader className="px-6 pt-6">
        {/* §11 Q79 확정: 이 화면은 수행평가 앱(/app/performance)이고 목표관리는 별개
            제품이다. 시안 원문 `목표관리`는 목표관리 시안에서 셸을 가져온 흔적으로 보이며,
            사용자가 지금 어느 제품에 있는지 오인하게 만드는 문구는 시안 충실도보다
            우선순위가 낮다고 판단해 `수행평가`로 확정한다. */}
        {profileName && (
          <p className="text-app-card-title font-bold text-ink-strong">
            {profileName}의 수행평가
          </p>
        )}
        {subtitle && (
          <p className="mt-2 text-app-label text-ink-sub">{subtitle}</p>
        )}
      </SidebarHeader>

      {/* 스크롤은 공용 `ScrollArea`(OverlayScrollbars)에 맡긴다 — 목표관리 사이드바
          (GoalSidebarContent.tsx)와 같은 이유·같은 구조(전역 scrollbar-width: none 때문에
          네이티브 스크롤바가 안 보여 스크롤 단서가 없음). 두 인앱 셸의 동작을 맞춘다. */}
      <SidebarContent className="overflow-hidden">
        <ScrollArea className="min-h-0 flex-1">
          {/* 메뉴 — 활성/비활성 텍스트 색이 같고 배경 pill 하나로만 구분하는 것이
            시안 정본이다(§3.2 단정). */}
          <SidebarGroup
            role="navigation"
            aria-labelledby="perf-nav-heading"
            className="px-4"
          >
            <SidebarGroupLabel
              id="perf-nav-heading"
              className="h-auto px-2 text-app-label font-medium text-ink-sub"
            >
              메뉴
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {MENU_ITEMS.map((item) => {
                  const isActive =
                    item.to === "/app/performance" ? !isReports : isReports;
                  return (
                    <SidebarMenuItem key={item.to}>
                      {/* ⚠️ NavLink가 아니라 Link다. NavLink는 `aria-current` prop을 자기
                        기본값(`'page'`)으로 흡수하고 **라우터 자체 prefix 매칭**으로
                        다시 계산해 내보낸다. `to="/app/performance"`에 `end`가 없으면
                        `/app/performance/reports`도 prefix로 걸려 두 항목이 동시에
                        `aria-current="page"`가 된다 — pill은 하나인데 스크린리더는
                        둘 다 현재 페이지라고 읽는다. 활성 판정이 아래처럼 커스텀이고 두
                        항목이 상호 배타이므로, prop을 그대로 흘리는 Link를 `render`로
                        넘긴다(회귀 검증: PerformanceSidebar.test.tsx). */}
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

          {/* 진행단계 — 링크가 아닌 상태 표시라 SidebarMenu가 아니라 순서 목록(ol)으로
            둔다. 그룹 자체를 `role="region"`으로 named landmark화해 "진행단계"와의
            관계를 스크린리더에도 준다(이전 <section aria-labelledby> 관례와 동일 의도). */}
          <SidebarGroup
            role="region"
            aria-labelledby="perf-steps-heading"
            className="px-4"
          >
            <SidebarGroupLabel
              id="perf-steps-heading"
              className="h-auto px-2 text-app-label font-medium text-ink-sub"
            >
              {siteWording("진행단계")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <ol className="flex flex-col gap-0.25">
                {PERFORMANCE_STEPS.map(({ step, label }, index) => {
                  const stepState = stepStates[index];
                  const state =
                    stepState && STEP_STATE_STYLES[stepState]
                      ? stepState
                      : "todo";
                  const style = STEP_STATE_STYLES[state];

                  return (
                    <li
                      key={step}
                      aria-current={state === "current" ? "step" : undefined}
                      className={[
                        "flex h-9 items-center gap-4 rounded-md px-3",
                        style.pill ? "bg-sidebar-accent" : "",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          "text-app-label font-medium leading-4.5",
                          style.badge,
                        ].join(" ")}
                      >
                        {/* 완료는 숫자 대신 체크. 스크린리더에는 상태를 말로 남긴다. */}
                        {state === "done" ? <CheckIcon /> : step}
                      </span>
                      <span
                        className={["text-app-label", style.label].join(" ")}
                      >
                        {label}
                      </span>
                      <span className="sr-only">
                        {state === "done"
                          ? " 완료"
                          : state === "current"
                            ? " 진행 중"
                            : " 진행 전"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>

      {/* 회차(잔여 이용 횟수) UI는 여기 두지 않는다 — 인앱 21개 노드 어디에도 사이드바 회차
          표시가 없고(슬라이스 x<324 영역 텍스트 전수 확인), 회차 소진 안내 표면은 §5.20이
          정한 채팅 상단 배너 + STEP3 인라인 카드 2곳뿐이다(P15). */}
    </AppShellSidebar>
  );
}
