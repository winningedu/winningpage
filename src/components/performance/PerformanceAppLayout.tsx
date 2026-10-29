import { useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router";
import {
  AppShellSidebarProvider,
  AppShellSidebarTrigger,
} from "@/components/app-shell/AppShellSidebar";
import Header from "@/components/Header";
import RouteLoadingOverlay from "@/components/ui/RouteLoadingOverlay";
import { SidebarInset } from "@/components/ui/sidebar";
import {
  PerformanceShellProvider,
  usePerformanceShell,
} from "@/context/PerformanceShellContext";
import { useSession } from "@/context/SessionContext";
import { ToastProvider } from "@/context/ToastContext";
import { pickKnownSchoolType } from "@/lib/performance/schoolType";
import { performanceBootstrapQueryOptions } from "@/lib/queryClient";
import PerformanceSidebar from "./PerformanceSidebar";
import QuotaExhaustedBanner from "./quota/QuotaExhaustedBanner";
import { useCondensedByScrollTop } from "./useCondensedByScrollTop";

// 수행평가 학생 앱 셸 — docs/수행평가-상세-명세.md §3.1(전체 골격) / §3.5(헤더).
//
// 시안 21개 인앱 노드가 전부 이 셸을 공유한다: 좌측 고정 사이드바 + 우측 채팅 캔버스.
// (QA 행279, 2026-09-06 개정) §3.5의 "사이트 공통 헤더를 쓰지 않는다" 단정은 폐기한다 —
// 디자이너 시안(Figma 3754-3562)이 공개 페이지와 같은 공통 헤더를 앱 화면 최상단에
// 두고 있고, 사용자가 그 시안대로 확정했다. 헤더는 새로 만들지 않고 공개 페이지 정본
// `Header.tsx`를 그대로 재사용한다(SiteLayout이 그리는 것과 같은 컴포넌트).
// **사이트 공통 푸터는 여전히 쓰지 않는다** — 앱 화면 하단은 그대로 캔버스로 끝난다.
// 이 결정으로 사이드바 상단 "메인으로" 링크·하단 "메인으로 나가기" 버튼(QA 행318/280)은
// 제거했다 — 헤더 로고·메뉴가 메인 이동 통로 역할을 대신한다.
// 그래서 App.jsx에서 이 라우트 그룹을 SiteLayout 밖에 둔다(목표관리 GoalAppLayout 선례와 동일).
//
// 세션 컨텍스트는 여기서 감싸지 않는다. App.jsx가
//   <SessionProvider> → <RequireEntitlement> → <PerformanceAppLayout>
// 순으로 이미 배선했고(SessionContext.jsx 상단 배선 주석이 정본), 셸이 다시 감싸면
// 이용권 조회가 2벌이 돼 같은 화면에서 잔여 회차가 갈라진다.
//
// GoalAppLayout과 코드 형태가 닮았지만 **레이아웃 전체를 공통 셸로 추출하지는
// 않았다.** 사이드바의 "고정·폭·모바일 전환" 규칙만 공통(AppShellSidebar.tsx,
// 2026-09-06 개정)이고, 사이드바 콘텐츠 구성(목표관리 4그룹 10항목 vs 수행평가
// 메뉴 2 + 진행단계 5스텝 상태머신)·캔버스 폭 규칙·페이지 타이틀 유무는 여전히 서로
// 다르고 시안도 독립적으로 개정된다. 이 두 컴포넌트(PerformanceAppLayout/
// GoalAppLayout) 자체를 하나로 합치면 공통 컴포넌트가 곧 분기 플래그 덩어리가 된다.
//
// 예외 하나: RouteLoadingOverlay(소프트 내비게이션 로딩 표시)는 순수 UI라 두 셸이
// 그대로 공유한다 — 사이드바・콘텐츠 폭 같은 화면 고유 규칙이 전혀 없고, 판정 방식이
// 다른(수행평가는 middleware가 아니라 RequireEntitlement) 두 셸에도 useNavigation()
// 훅 자체는 동일하게 동작하기 때문이다(App.tsx가 두 라우트 그룹을 같은
// createBrowserRouter 하나로 묶는다).
//
// (2026-09-06 개정) 사이드바 shadcn Sidebar 전환(AppShellSidebar.tsx, 사용자 결정
//   "목표관리/수행평가 다 같은 스타일로") 이후 모바일 대응이 더 이상 범위 밖이 아니다 —
//   768px 미만에서는 AppShellSidebarProvider가 내장 Sheet 드로어로 자동 전환한다.
//   데스크톱은 여전히 사이드바 고정 18rem(`--spacing-app-sidebar`), 캔버스는 좌 인셋
//   3.75rem + 콘텐츠 max-width 82.5rem 좌측 정렬(§3.1 제안 그대로).
export default function PerformanceAppLayout() {
  return (
    // ToastProvider는 P18 토스트 컨텍스트 배선 — src/context/ToastContext.jsx 참고.
    // 이 셸 하위 전 화면(STEP1~5, 리포트, 마이리포트)이 useToast()를 공유한다.
    <ToastProvider>
      {/* PerformanceShellProvider(P13) — 채팅 페이지(Outlet 자식)가 라이브 세션 상태에서
          파생한 진행단계 5스텝 상태를 이 셸의 사이드바로 올리는 통로. 값 자체는
          `PerformanceShellContent`가 컨텍스트에서 읽어 사이드바로 내려보낸다(주석은
          src/context/PerformanceShellContext.jsx 참고). */}
      <PerformanceShellProvider>
        <PerformanceShellContent />
      </PerformanceShellProvider>
    </ToastProvider>
  );
}

function PerformanceShellContent() {
  const { stepStates, quotaBannerVisible, sessionGradeLabel } =
    usePerformanceShell();
  // 사이드바 프로필 슬롯(P5) — `session`은 SessionProvider가 이미 판정해 둔 값을
  // 그대로 읽는다(이 셸이 새로 감싸지 않는 이유는 위 주석 참고, 이용권 조회 2벌
  // 방지와 같은 원칙). bootstrap 캐시는 채팅 페이지(Outlet 자식)의
  // `fetchQuery({ ...옵션, staleTime:0 })`가 이미 채워 두므로, 이 useQuery는 보통
  // 그 결과를 그대로 구독만 한다 — 저장 리포트 등 채팅 페이지를 거치지 않고 이
  // 셸에 먼저 진입하는 경로에서만 자체적으로 조회한다.
  const { session, userId } = useSession();
  const accessToken = session?.access_token || null;
  const { data: bootstrap } = useQuery(
    performanceBootstrapQueryOptions(userId, accessToken),
  );
  const { isCondensed, onScrollCapture } = useCondensedByScrollTop();
  const schoolType = pickKnownSchoolType(bootstrap?.profile.schoolType);
  // 학년 우선순위(PerformanceShellContext.tsx 주석) — 라이브 세션(이번 방문 STEP1
  // 입력값)이 bootstrap의 마지막 스냅샷보다 항상 우선한다. 채팅 페이지 밖(저장
  // 리포트 등)에서는 `sessionGradeLabel`이 null이라 자연히 bootstrap 값으로
  // 떨어진다.
  const gradeLabel =
    sessionGradeLabel ?? bootstrap?.lastSession?.gradeLabel ?? null;

  return (
    <>
      {/* 공개 페이지 정본 헤더(Header.tsx) 그대로 재사용 — `position:fixed h-16`(4rem)이라
          자기 자신은 레이아웃 흐름의 높이를 차지하지 않는다. 헤더 높이만큼 자리를
          잡는 스페이서·`--header-height` 정의는 `AppShellSidebarProvider`
          (AppShellSidebar.tsx, sidebar-16 공식 블록 구조) 한 곳뿐이다. */}
      <Header />
      <AppShellSidebarProvider>
        <div className="flex flex-1">
          {/* 사이드바는 표시 전용이라 prop을 받는다(프로필 이름·학교유형·학년, 진행단계 5스텝
            상태). 진행단계(stepStates)는 위 PerformanceShellProvider를 통해 채팅 페이지가
            배선했다(P13 해소). 프로필(이름·학교유형·학년, P5)은 이 컴포넌트가 bootstrap
            캐시(performanceBootstrapQueryOptions)를 직접 구독해 내려보낸다 — 값이 없으면
            undefined/null 그대로 넘긴다(§11 Q61-ⓔ, 가짜 이름·리터럴 학교유형 금지). */}
          <PerformanceSidebar
            profileName={bootstrap?.profile.name ?? null}
            schoolType={schoolType}
            gradeLabel={gradeLabel}
            stepStates={stepStates}
          />

          {/* `SidebarInset`(sidebar-16 공식 본문 자리, AppShellSidebar.tsx 주석 참고) —
            헤더 높이를 뺀 나머지 뷰포트 높이만 채우고 내부에서만 스크롤한다(채팅
            캔버스 고정 높이 스크롤 모델 유지). 모바일 1rem 대칭, `md`(고정 사이드바가
            나타나는 브레이크포인트, `AppShellSidebarTrigger`의 `md:hidden`과 동일
            기준) 이상만 좌기준선 3.75rem(`pl-perf-inset`)을 쓴다 — 좁은 화면에서
            `--spacing-perf-inset`(3.75rem, 로그인 버튼 높이 등과 공유하는 토큰)을
            그대로 좌우 인셋에 쓰면 375px 폭 기준 콘텐츠 실사용 폭이 320px대로 좁아져
            텍스트영역이 지나치게 좁았다(M3 compact 컴팩트 여백 16dp 관례에 맞춰
            1rem으로 낮춘다). 우측은 `md` 미만은 좌측과 대칭인 1rem, 이상은 콘텐츠
            max-width가 남긴 여백으로 처리한다(§7.3 「좌우 대칭 padding 금지」 규칙 —
            데스크톱에서만 적용된다). pr은 좁은 뷰포트에서 글자가 화면 우변에 붙지
            않게 하는 안전 여백일 뿐이다. */}
          <SidebarInset className="h-[calc(100svh-var(--header-height))] min-w-0 overflow-hidden">
            <AppShellSidebarTrigger />
            <div
              className="group/canvas relative flex min-h-0 flex-1 flex-col overflow-hidden px-4 md:pl-perf-inset md:pr-perf-inset"
              data-condensed={isCondensed}
              onScrollCapture={onScrollCapture}
            >
              <RouteLoadingOverlay />
              <div className="flex min-h-0 w-full max-w-perf-content flex-1 flex-col">
                {/* 회차 소진 배너(§5.20 (A), P15 [FIX]) — 페이지 타이틀 위, 캔버스 최상단.
                  조건 판정은 이 컴포넌트가 하지 않는다 — 채팅 페이지(Outlet 자식)가
                  `quotaRemaining === 0 && 진행 중 세션 없음`을 판정해 셸 컨텍스트로
                  올리고(PerformanceChatPage.jsx), 여기는 그 값을 그대로 읽어 렌더만 한다.
                  저장 리포트 등 판정 근거가 없는 화면은 기본값 false라 배너가 뜨지 않는다
                  (PerformanceShellContext.jsx 주석 참고). */}
                {quotaBannerVisible && <QuotaExhaustedBanner />}

                {/* 페이지 타이틀 — 공유 타입 스케일 `text-app-title`(목표관리 페이지 헤더와 동일).
                  TODO(P6): §3.5 제안의 `통합 설계 리포트` 보조 버튼(설계 리포트 생성 이후에만 노출)은
                  §11 Q7 미결이라 아직 만들지 않는다. */}
                {/* 타이틀 띠, 접힘 규칙(QA3 행81 개정): 채팅 뷰포트의 scrollTop이 접힘 임계
                    이상이면 상하 1rem으로 접히고 제목은 섹션 크기로 내려간다. 펼침은 더 작은
                    임계 이하일 때만(히스테리시스, useCondensedByScrollTop.ts). 컨테이너 넘침
                    여부(`data-scrollable`)로는 판정하지 않는다, 접힘이 넘침을 없애 펼침을
                    부르는 피드백 루프로 화면이 떨렸다. */}
                <div className="shrink-0 pb-6 pt-8 transition-[padding] duration-200 motion-reduce:transition-none group-data-[condensed=true]/canvas:py-4">
                  <h1 className="text-app-title font-semibold tracking-[-0.02rem] text-ink-strong transition-[font-size] duration-200 motion-reduce:transition-none group-data-[condensed=true]/canvas:text-app-section">
                    위닝 수행평가 서비스
                  </h1>
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                  <Outlet />
                </div>
              </div>
            </div>
          </SidebarInset>
        </div>
      </AppShellSidebarProvider>
    </>
  );
}
