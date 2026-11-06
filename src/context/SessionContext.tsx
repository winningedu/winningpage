import type { Session, User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { Outlet } from "react-router";
import { useAuth } from "@/context/AuthProvider";
import { entitlementQueryOptions } from "@/lib/queryClient";
import type { TenantBlockReason } from "@/lib/tenantBlock";

// 인앱 셸 공유 세션 컨텍스트 — 명세서 §2.3.
//
// 왜 필요한가: 수행평가 셸은 사이드바 프로필, 진입 가드, 채팅 헤더, 회차 안내
// 배너(§5.20)가 **동시에** 같은 세션·이용권 값을 필요로 한다. 각자
// `supabase.auth.getSession()`과 `/api/check-service-access`를 따로 부르면
// 같은 화면 안에서 서로 다른 잔여 회차가 보이고(호출 시점 차이), 네트워크
// 왕복도 표면 수만큼 늘어난다. 그래서 판정을 여기 한 곳에서만 하고 나머지는
// 읽기만 한다.
//
// 세션 구독 자체는 AuthProvider(src/context/AuthProvider.tsx, 전역 단일 구독)에
// 위임한다(명세서 B-3) — 이 컨텍스트는 그 값을 읽어 entitlement 판정·guardState
// 계산만 얹는다. Header도 동일하게 AuthProvider를 구독한다(중복 구독 제거).
//
// ⚠️ 적용 범위는 `/app/performance/*` 하위로 **한정**한다(§2.3).
//    Header.jsx / LearningDiagnosis.jsx의 기존 중복 구독을 이 컨텍스트로
//    흡수하는 것은 명세서가 "이번 범위 밖"으로 못박았다 — 전역으로 올리면
//    마케팅 페이지 전체가 회귀 시험 대상이 된다. 기존 페이지는 손대지 않는다.
//
// 라우트 배선(수행평가 페이지가 생기는 슬라이스에서):
//
//   <Route element={<SessionProvider serviceKey="suhaeng" />}>
//     <Route element={<RequireEntitlement serviceKey="suhaeng" ... />}>
//       <Route element={<PerformanceAppLayout />}>
//         <Route path="/app/performance" element={<PerformanceChatPage />} />
//         ...
//
// SessionProvider가 가드보다 **바깥**이라야 한다. 그래야 가드가 자기 판정을
// 따로 하지 않고 이 컨텍스트 값을 읽고, 셸 안쪽 표면도 같은 값을 본다
// (가드가 안쪽이면 컨텍스트가 가드 결과를 알 수 없어 조회가 2벌이 된다).

type GuardState = "loading" | "guest" | "ok" | "forbidden" | "check-failed";

interface Entitlement {
  allowed: boolean | null;
  quotaRemaining: number | null;
  quotaTotal: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
  tenantReason: TenantBlockReason | null;
  limitKind: "month" | "term" | null;
}

interface SessionContextValue {
  serviceKey: string;
  guardState: GuardState;
  session: Session | null;
  user: User | null;
  userId: string | null;
  isSessionReady: boolean;
  isEntitlementReady: boolean;
  allowed: boolean | null;
  quotaRemaining: number | null;
  quotaTotal: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
  /** 스쿨멘토 기관 거부 사유와 한도 종류. 위닝은 null. */
  tenantReason: TenantBlockReason | null;
  limitKind: "month" | "term" | null;
  refreshEntitlement: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const EMPTY_ENTITLEMENT: Entitlement = {
  allowed: null,
  quotaRemaining: null,
  quotaTotal: null,
  planEndsAt: null,
  planLabel: null,
  tenantReason: null,
  limitKind: null,
};

/**
 * 컨텍스트가 없으면 throw. 셸 내부 컴포넌트(사이드바·헤더·배너)용.
 */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error(
      "useSession()은 <SessionProvider> 안에서만 쓸 수 있습니다.",
    );
  }
  return value;
}

/**
 * 컨텍스트가 없으면 null. 프로바이더 안팎에서 모두 쓰이는 공용 컴포넌트용
 * (RequireEntitlement가 이걸 쓴다 — 목표관리는 프로바이더 없이 마운트된다).
 */
export function useSessionOptional(): SessionContextValue | null {
  return useContext(SessionContext);
}

// serviceKey: 이용권 조회 키. 수행평가는 'suhaeng'이다 — 신규 자산 네이밍은 performance지만
// 이 값은 운영 DB의 program_access.program_key / SERVICE_CONFIGS에 이미 박혀 있어 개명
// 대상이 아니다(명세서 §1.4, §9.4).
// children: 없으면 <Outlet />을 렌더한다(라우트 element로 바로 쓸 수 있게).
export function SessionProvider({
  serviceKey,
  children,
}: {
  serviceKey: string;
  children?: ReactNode;
}) {
  // ── 세션은 AuthProvider(전역 단일 구독)에서 읽기만 한다.
  const { session, user, userId, isReady: isSessionReady } = useAuth();

  // ── 이용권·회차 조회. queryClient(src/lib/queryClient.ts)의 ['entitlement', serviceKey]
  // 캐시를 그대로 구독한다 — RequireEntitlement의 standalone 조회, goal 미들웨어와
  // 같은 캐시를 공유해 같은 세션 안에서 5분 내 재호출을 막는다(명세 B-2 §4).
  // 세션이 없으면(비로그인) 아예 조회하지 않는다 — "이용권 없음"이 아니라
  // "물어볼 대상이 없음"이라 allowed:false로 내리면 가드가 guest 대신 forbidden으로
  // 잘못 분기한다(아래 entitlement 파생 참고).
  const entitlementQuery = useQuery({
    ...entitlementQueryOptions(serviceKey, userId),
    enabled: isSessionReady && !!userId,
  });

  const entitlement: Entitlement = userId
    ? (entitlementQuery.data ?? EMPTY_ENTITLEMENT)
    : EMPTY_ENTITLEMENT;

  // 세션 확인 전에는 항상 로딩. 세션은 있는데 로그인하지 않았으면 물어볼 게
  // 없으므로 즉시 준비 완료. 로그인 상태면 쿼리가 아직 첫 응답을 못 받은
  // 동안만(isPending) 로딩으로 본다 — enabled:false인 쿼리는 isPending이 계속
  // true로 남으므로 비로그인 분기를 반드시 먼저 걸러야 한다.
  const isEntitlementReady = !isSessionReady
    ? false
    : !userId
      ? true
      : !entitlementQuery.isPending;

  // 차감 후 잔여 회차 갱신·"다시 시도" 버튼이 부르는 강제 재조회. staleTime(5분)을
  // 우회해 즉시 새로 조회해야 하므로 refetch()를 쓴다(invalidateQueries만으로는
  // "즉시" 재요청을 보장하지 않는다 — 다음 마운트/포커스까지 미뤄질 수 있다).
  const refreshEntitlement = useCallback(() => {
    entitlementQuery.refetch();
  }, [entitlementQuery.refetch]);

  const value = useMemo(() => {
    // 가드 4상태(명세서 §2.2) + 판정 불가 1상태를 여기서 한 번만 계산한다.
    // 여러 표면이 각자 조합하면 규칙이 갈라진다.
    //
    // ⚠️ `quota_exhausted` 5번째 상태는 **만들지 않는다**(§2.2 / §11.1 Q47).
    //    회차를 다 쓴 사용자도 셸에 들어와야 한다 — 저장 리포트 열람과 이미
    //    차감된 세션 이어가기는 이미 대가를 지불한 산출물이기 때문이다.
    //    잔여 회차는 차단 사유가 아니라 아래 quota* 필드로 셸에 전달되는
    //    컨텍스트이고, 막는 것은 "새 세션 시작" 하나뿐이다.
    let guardState: GuardState;
    if (!isSessionReady || !isEntitlementReady) guardState = "loading";
    else if (!userId) guardState = "guest";
    else if (entitlement.allowed === true) guardState = "ok";
    else if (entitlement.allowed === false) guardState = "forbidden";
    // allowed === null: 서버에 물어보지 못했다. forbidden과 반드시 구분한다 —
    // 서버 장애 중인 결제 사용자를 결제 페이지로 튕기는 오탐을 막기 위해서다.
    else guardState = "check-failed";

    return {
      serviceKey,
      guardState,
      session,
      user,
      userId,
      isSessionReady,
      isEntitlementReady,
      allowed: entitlement.allowed,
      // null = 무제한(0 아님). 판정 불가·회차 미설정도 null이다.
      quotaRemaining: entitlement.quotaRemaining,
      quotaTotal: entitlement.quotaTotal,
      planEndsAt: entitlement.planEndsAt,
      planLabel: entitlement.planLabel,
      tenantReason: entitlement.tenantReason,
      limitKind: entitlement.limitKind,
      // 차감이 일어난 뒤(api/performance/* 가 quotaRemaining을 돌려준 직후)
      // 화면 값을 맞추는 수단이다. 클라이언트가 임의로 -1 하지 않는다 —
      // 서버가 권위이므로 서버에 다시 물어 덮는다.
      refreshEntitlement,
    };
  }, [
    serviceKey,
    session,
    user,
    userId,
    isSessionReady,
    isEntitlementReady,
    entitlement,
    refreshEntitlement,
  ]);

  return (
    <SessionContext.Provider value={value}>
      {children ?? <Outlet />}
    </SessionContext.Provider>
  );
}
