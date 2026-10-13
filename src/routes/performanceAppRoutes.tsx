import type { RouteObject } from "react-router";
import RequireEntitlement from "@/components/RequireEntitlement";
import { SessionProvider } from "@/context/SessionContext";

// 수행평가 학생 앱(performance) — 목표관리와 같은 규칙으로 SiteLayout 밖에 둔다.
// (QA 행279, 2026-09-06) 셸 최상단에 사이트 공통 헤더가 붙었지만(PerformanceAppLayout.tsx가
// Header.tsx를 직접 렌더), 사이트 공통 푸터는 여전히 없고 셸이 자체 사이드바를 갖는다 —
// 그래서 SiteLayout(헤더+푸터 세트)을 그대로 씌우지 않고 이 그룹을 밖에 둔다
// (docs/수행평가-상세-명세.md §2.1 「/app/performance/*는 SiteLayout 밖」).
// `/services/performance`(마케팅 랜딩)와는 별개 라우트다.
// ⚠️ 신규 자산 네이밍은 performance지만 **이용권 조회 키는 'suhaeng'** 이다 —
//    운영 DB의 program_access.program_key에 이미 박힌 값이라 개명 대상이 아니다(§1.4).

// 수행평가 학생 앱 셸/페이지 공용 청크 로딩 폴백 — 이용권 없는 사용자가 대다수라
// 초기 번들에서 뺀다(Admin과 동일 패턴). route.lazy가 대기하는 동안 쓰이므로
// 정적 최상위 HydrateFallback으로 둔다(adminRoutes.tsx 주석 참고). 이 그룹은
// RR middleware를 쓰지 않아(SessionProvider/RequireEntitlement가 자체 판정)
// ErrorBoundary는 없다.
function PerformanceChunkLoadingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
        불러오는 중...
      </div>
    </main>
  );
}

// 수행평가 학생 앱 — 명세서 §2.1 라우트 표.
// 중첩 순서는 SessionContext.jsx 상단 배선 주석대로 SessionProvider가 가드보다
// **바깥**이다. 그래야 가드가 자기 판정을 따로 하지 않고 컨텍스트 값을 읽고,
// 셸 안쪽 표면(사이드바・회차 배너)도 같은 값을 본다.
// 가드는 이용권 미보유 하나만 막는다 — 잔여 회차 0은 차단 사유가 아니다
// (§2.2 / §11.1 Q47, 근거는 RequireEntitlement.jsx 상단 주석).
// ※ 레거시 리다이렉트(/page/services-ai-performance → /services/performance)와
//   랜딩 CTA의 외부 SSO 목적지는 건드리지 않는다 — 인앱 전환 플래그(§11 Q1)가
//   아직 off이므로 이 라우트 그룹은 직접 URL로만 도달한다.
// ※ QA 지적(2026-08-22): forbiddenTo가 이전에는 `/services/performance#pricing`
//   + `location.state.entitlementNotice` 인라인 배너였다. RequireEntitlement는
//   세션·이용권을 비동기 조회하는 동안 PerformanceSkeleton(수행평가 앱 골격)을
//   먼저 그린다 — 이용권이 없는 사용자에게는 "프로그램 화면이 잠깐 떴다가 랜딩으로
//   튕기고 안내 박스만 남는" 것처럼 보였고, 그 배너는 history.state에 실려 있어
//   새로고침해도 사라지지 않았다. 목표관리(requireGoalAccessMiddleware)는 같은
//   판정을 라우트 미들웨어로 하기 때문에 애초에 앱 화면을 그리지 않고 곧장
//   `/pricing`(이용요금 탭)으로 보낸다 — 그 목적지 하나만 맞춰 동일한 착지점을
//   만든다(로딩 골격 자체는 셸 공유 이유로 SessionProvider 구조를 유지, 상단
//   RequireEntitlement.tsx 주석 참고). PerformanceAssessment.jsx는 더 이상
//   entitlementNotice를 소비하지 않는다 — 가격 섹션 앵커(id="pricing")는
//   QuotaExhaustedBanner/Card의 "이용권 구매하기" 링크가 여전히 쓴다.
const performanceAppRoutes: RouteObject[] = [
  {
    Component: () => <SessionProvider serviceKey="suhaeng" />,
    children: [
      {
        Component: () => (
          <RequireEntitlement
            serviceKey="suhaeng"
            // 수행평가 현행 환불 산정은 회차 분기라 first_accessed_at을 읽지 않지만,
            // 약관 [별표 1]이 시작 로그 보관을 요구하고 혼합 상품이 기간제로
            // 재분류될 가능성에 대비해 기록해 둔다(programEntry.ts 상단 주석).
            entryProgramKey="suhaeng"
            forbiddenTo={(location) =>
              `/pricing?service=suhaeng&redirect=${encodeURIComponent(
                `${location.pathname}${location.search}${location.hash}`,
              )}`
            }
          />
        ),
        children: [
          // 셸(사이드바 + 페이지 타이틀)은 P4에서 구현됐다 — §3.1/§3.5.
          // TODO(P7~): 나머지 플레이스홀더(저장 리포트·세션 복구)를 실제 페이지로 교체한다.
          //   · P6 STEP1 기본 정보 폼(§5.5) — 아래로 배선 완료
          //   · P7~ STEP2 이후(§5.6~§5.17) · P12 저장 리포트(§5.18~§5.19)
          {
            lazy: async () => {
              const { default: PerformanceAppLayout } = await import(
                "@/components/performance/PerformanceAppLayout"
              );
              return { Component: PerformanceAppLayout };
            },
            HydrateFallback: PerformanceChunkLoadingFallback,
            children: [
              {
                path: "/app/performance",
                lazy: async () => {
                  const { default: PerformanceChatPage } = await import(
                    "@/pages/performance/PerformanceChatPage"
                  );
                  return { Component: PerformanceChatPage };
                },
              },
              // 저장 리포트는 모달이 아니라 라우트다(§11-Q65). 정적 세그먼트가
              // :sessionId보다 우선 매칭되므로 `reports`가 세션 id로 오인되지 않는다.
              {
                path: "/app/performance/reports",
                lazy: async () => {
                  const { default: PerformanceReportsPage } = await import(
                    "@/pages/performance/PerformanceReportsPage"
                  );
                  return { Component: PerformanceReportsPage };
                },
              },
              {
                path: "/app/performance/reports/:sessionId",
                lazy: async () => {
                  const { default: PerformanceReportsPage } = await import(
                    "@/pages/performance/PerformanceReportsPage"
                  );
                  return { Component: PerformanceReportsPage };
                },
              },
              // 새로고침 복구 진입점(§2.1). 외부 앱은 sessionId가 인메모리라 새로고침
              // 시 재로그인으로 떨어졌다. 세션 id는 인증 수단이 아니라 리소스 ID이므로
              // URL에 노출해도 안전하다 — 소유권은 서버가 auth.uid()로 판정한다.
              {
                path: "/app/performance/:sessionId",
                lazy: async () => {
                  const { default: PerformanceChatPage } = await import(
                    "@/pages/performance/PerformanceChatPage"
                  );
                  return { Component: PerformanceChatPage };
                },
              },
            ],
          },
        ],
      },
    ],
  },
];

export default performanceAppRoutes;
