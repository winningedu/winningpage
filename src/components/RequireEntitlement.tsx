import { type ReactNode, useEffect, useState } from "react";
import { type Location, Navigate, Outlet, useLocation } from "react-router";
import { site } from "@/config/site";
import { useAuth } from "@/context/AuthProvider";
import { useSessionOptional } from "@/context/SessionContext";
import { markProgramEntry } from "@/lib/programEntry";
import { entitlementQueryOptions, queryClient } from "@/lib/queryClient";
import type { TenantBlockReason } from "@/lib/tenantBlock";
import PerformanceSkeleton from "./performance/PerformanceSkeleton";
import ServiceBlockedNotice from "./service/ServiceBlockedNotice";

// 유료 서비스 진입 가드 — 명세서 §2.2의 4상태(`loading`/`guest`/`forbidden`/`ok`)
// + 판정 불가 1상태(`check-failed`).
//
// 이 컴포넌트는 `RequireGoalAccess.jsx`(2026-08-10)에 있던 판정 본체를
// **서비스 키를 받는 형태로 일반화**한 것이다. 수행평가용으로 같은 로직을 또
// 만들면 "null(판정 불가)을 false로 다루면 안 된다" 같은 규칙이 2벌이 되고,
// 한쪽만 고쳐지는 순간 조용히 갈라진다. 목표관리 고유 단계(온보딩 완료 판정)는
// 여기 없다 — RequireGoalAccess가 children으로 감싸 유지한다.
//
// ── 5상태
//   loading       세션·이용권 조회 중. 판정 전에는 **절대 자식을 렌더하지 않는다**
//                 (깜빡임 + 미결제 사용자에게 셸이 한 프레임 보이는 문제).
//   guest         세션 없음        → /login?redirect=<현재 경로>
//   forbidden     세션 O, 이용권 X → forbiddenTo (+ 인라인 안내를 state로 전달)
//   check-failed  서버에 물어보지 못함 → **이동하지 않고** 그 자리에서 재시도.
//                 null을 false처럼 다뤄 결제 페이지로 보내면, 서버가 잠깐
//                 죽었을 뿐인 결제 완료 사용자가 튕겨 나가는 최악의 오탐이 된다.
//   ok            통과 → children(기본 <Outlet />)
//
// ── ⚠️ `quota_exhausted` 5번째 상태를 만들지 않는다 (§2.2 / §11.1 Q47)
//    잔여 회차 0은 **차단 사유가 아니다.** 사이드바 `저장 리포트`와 이미 차감이
//    끝난 진행 중 세션은 셸 안에 있고, 그건 이미 대가를 지불한 산출물이다.
//    또한 진입 시점 판정은 다른 탭·기기의 동시 소진을 막지 못한다 — 차감 권위는
//    항상 서버(consume_performance_credit RPC)에 있다. 잔여 회차는 가드가 아니라
//    SessionContext가 셸에 전달하는 컨텍스트이고, 안내는 §5.20의 배너·인라인
//    카드가 담당한다. 가드가 막는 것은 "이용권 미보유" 하나뿐이다.
//
// ── 데이터 출처 2경로
//    ① <SessionProvider> 안이면(수행평가 셸) 그 컨텍스트의 판정을 그대로 쓴다.
//       가드가 따로 조회하면 같은 화면에서 조회가 2벌이 되고 값이 어긋난다.
//    ② 프로바이더 밖이면(목표관리) 스스로 조회한다. 목표관리는 세션 컨텍스트를
//       도입하지 않았고(§2.3이 범위를 /app/performance/* 로 한정), 회귀를 만들지
//       않기 위해 그대로 둔다.
//    ⚠️ **컨텍스트의 `serviceKey`가 이 가드의 `serviceKey`와 다르면 ②로 떨어진다.**
//       프로바이더 존재만 보고 판정을 채택하면, 예컨대 suhaeng 프로바이더 안에
//       goal 가드를 두는 순간 goal 이용권이 없는 사용자가 suhaeng 판정으로 조용히
//       통과한다. 이용권 가드의 오탐 방향이 「열림」이 되는 건 허용할 수 없다.

type GuardState = "loading" | "guest" | "ok" | "forbidden" | "check-failed";

function currentPathWithQuery(location: Location) {
  return `${location.pathname}${location.search}${location.hash}`;
}

/**
 * 프로바이더 밖에서 쓰일 때만 동작하는 자체 조회. `disabled`면 아무것도 하지
 * 않는다(훅은 조건부로 호출할 수 없으므로 effect 안에서 끈다).
 */
function useStandaloneEntitlement(
  serviceKey: string,
  disabled: boolean,
  retryToken: number,
): { state: GuardState; tenantReason: TenantBlockReason | null } {
  // 세션은 AuthProvider(전역 단일 구독)에서 읽는다 — 이 훅이 따로 getSession()을
  // 부르지 않아도 된다(명세 B-3 §4, 왕복 1회 절감).
  const { userId, isReady: isAuthReady } = useAuth();
  const [state, setState] = useState<GuardState>("loading");
  const [tenantReason, setTenantReason] = useState<TenantBlockReason | null>(
    null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) retryToken은 effect 안에서 읽지 않는 재시도 트리거 전용 값이다.
  useEffect(() => {
    if (disabled) return undefined;

    if (!isAuthReady) {
      setState("loading");
      return undefined;
    }

    if (!userId) {
      setState("guest");
      return undefined;
    }

    let alive = true;
    setState("loading");

    (async () => {
      // queryClient(src/lib/queryClient.ts)의 ['entitlement', userId, serviceKey] 캐시를
      // 그대로 쓴다 — goal 미들웨어(routeMiddleware.ts)·SessionContext와 같은 키를
      // 공유해 staleTime(15초) 내 재호출을 막는다(명세 B-2 §4·§6). "다시 시도"
      // 버튼(retry())이 invalidateQueries로 stale 처리한 뒤 이 effect를 다시
      // 태우므로, staleTime이 남아 있어도 재시도는 항상 새로 조회한다.
      //
      // ⚠️ 판정 불가(allowed===null)는 이제 ensureQueryData가 성공 데이터로 돌려주지
      // 않고 throw한다(queryClient.ts EntitlementCheckFailedError, 리뷰 H2) —
      // 캐치하지 않으면 이 Promise가 reject된 채로 끝나 loading 상태에 고착된다
      // (리뷰 M2). try/catch로 잡아 check-failed로 매핑한다.
      try {
        const { allowed, tenantReason: reason } =
          await queryClient.ensureQueryData(
            entitlementQueryOptions(serviceKey, userId),
          );
        if (!alive) return;
        setTenantReason(reason);

        if (allowed === true) setState("ok");
        else setState("forbidden");
      } catch {
        if (!alive) return;
        setState("check-failed");
      }
    })();

    return () => {
      alive = false;
    };
  }, [serviceKey, disabled, retryToken, isAuthReady, userId]);

  return { state, tenantReason };
}

type RequireEntitlementProps = {
  /** 이용권 조회 키(`'suhaeng'` | `'goal'`). 수행평가의 신규 자산 네이밍은 performance지만
   *  이 키는 운영 DB에 박힌 `'suhaeng'`이다. */
  serviceKey: string;
  /** 이용권 미보유 시 목적지. */
  forbiddenTo?: string | ((location: Location) => string);
  /** 목적지 화면에 띄울 인라인 안내 문구.
   *  `location.state.entitlementNotice`로 전달한다 — 현행 `alert()` 대신
   *  화면 안내로 승격하라는 §2.2 제안을 따른 것이며, 목적지가 아직 이 state를
   *  읽지 않아도 동작에는 영향이 없다. */
  forbiddenNotice?: string;
  /** 로딩 문구. */
  loadingLabel?: string;
  /** 이용개시 시작 로그(fn_mark_program_entry)를 남길 program_key. 생략하면 기록하지
   *  않는다 — 목표관리는 이 컴포넌트를 안 쓰고(routeMiddleware.ts에서 직접 기록)
   *  수행평가만 여기서 채워 쓴다(programEntry.ts 상단 주석 참고). */
  entryProgramKey?: string;
  /** 통과 시 렌더. 기본 `<Outlet />`. */
  children?: ReactNode;
};

export default function RequireEntitlement({
  serviceKey,
  forbiddenTo,
  forbiddenNotice,
  loadingLabel = "이용 가능 여부 확인 중...",
  entryProgramKey,
  children,
}: RequireEntitlementProps) {
  const location = useLocation();
  const sessionCtx = useSessionOptional();
  // retry()가 무효화할 캐시 키(['entitlement', userId, serviceKey], 리뷰 C1)를
  // 만들기 위해서만 필요하다 — 세션 판정 자체는 useStandaloneEntitlement 내부의
  // useAuth()가 담당한다.
  const { userId } = useAuth();
  const [retryToken, setRetryToken] = useState(0);

  // 키가 일치하는 컨텍스트만 채택한다(위 「데이터 출처 2경로」 ⚠️ 참고).
  const ctx = sessionCtx?.serviceKey === serviceKey ? sessionCtx : null;

  const standalone = useStandaloneEntitlement(
    serviceKey,
    Boolean(ctx),
    retryToken,
  );
  const status: GuardState = ctx ? ctx.guardState : standalone.state;
  const tenantReason = ctx ? ctx.tenantReason : standalone.tenantReason;

  // 이용개시 시작 로그(programEntry.ts) — status가 "ok"로 전이하는 시점에만 기록한다.
  // 렌더 중 호출하지 않는 이유는 리렌더마다 새 Promise가 뜨는 걸 피하기 위함이고,
  // 헬퍼 자체가 (userId, entryProgramKey) 단위로 dedupe하므로 이 effect가 status
  // "ok" 유지 중 여러 번 재실행돼도 무해하다.
  useEffect(() => {
    if (status === "ok" && entryProgramKey) {
      markProgramEntry(entryProgramKey);
    }
  }, [status, entryProgramKey]);

  function retry() {
    if (ctx) {
      ctx.refreshEntitlement();
      return;
    }
    // staleTime(15초) 안에 재시도를 눌러도 캐시가 아니라 항상 새로 조회하도록
    // 먼저 무효화한다 — retryToken만 올리면 ensureQueryData가 여전히 fresh한
    // 캐시를 그대로 돌려줘 재시도가 아무 효과도 없어 보일 수 있다.
    queryClient.invalidateQueries({
      queryKey: ["entitlement", userId, serviceKey],
    });
    setRetryToken((v) => v + 1);
  }

  if (status === "loading") {
    // 수행평가(§2.2)만 전체 화면 스켈레톤을 쓴다 — 골격이 수행평가 사이드바 실측
    // (프로필 1자리 + 메뉴 2자리 + 진행단계 5자리, 폭 20.25rem 고정)에 맞춰져 있어
    // 목표관리(4그룹 10항목) 등 다른 셸에 그대로 쓰면 모양이 어긋난다. 다른
    // 서비스는 기존 중앙 텍스트 카드를 유지한다 — 이 가드가 아직 모르는 셸에
    // 수행평가 전용 골격을 강제하지 않기 위해서다.
    if (serviceKey === "suhaeng") {
      return <PerformanceSkeleton />;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-[#0D1B2A]">
        {/* 가드가 조기 반환하면 이전 라우트 DOM이 통째로 언마운트되고 포커스도 옮겨지지
            않는다 — live region이 없으면 조회가 끝날 때까지 스크린리더에 아무 소리도
            나지 않는다. 로딩은 진행 안내이므로 polite(끼어들지 않음). */}
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]"
        >
          {loadingLabel}
        </div>
      </main>
    );
  }

  if (status === "guest") {
    const redirectPath = currentPathWithQuery(location);
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirectPath)}`}
        replace
      />
    );
  }

  if (status === "forbidden" && site.features.tenantServiceGate) {
    // 스쿨멘토는 결제 페이지로 보내지 않고 기관 설정 사유를 그 자리에서 안내한다(결정 99).
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-[#0D1B2A]">
        <ServiceBlockedNotice
          reason={tenantReason}
          onJoined={retry}
          className="max-w-sm shadow-[0_18px_45px_rgba(13,27,42,0.10)]"
        />
      </main>
    );
  }

  if (status === "forbidden") {
    const target =
      typeof forbiddenTo === "function"
        ? forbiddenTo(location)
        : forbiddenTo || "/pricing";

    return (
      <Navigate
        to={target}
        replace
        state={{
          entitlementNotice:
            forbiddenNotice || "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
          entitlementServiceKey: serviceKey,
          entitlementRedirect: currentPathWithQuery(location),
        }}
      />
    );
  }

  if (status === "check-failed") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-[#0D1B2A]">
        {/* `check-failed`는 **이동하지 않고 그 자리에 머무는** 상태다(위 5상태 주석).
            사용자가 알아채야 행동할 수 있으므로 assertive가 맞다 — role="alert"가
            aria-live="assertive"를 함축하며, 로딩의 polite와 구분해서 쓴다. */}
        <div
          role="alert"
          className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-8 text-center shadow-[0_18px_45px_rgba(13,27,42,0.10)]"
        >
          <p className="text-sm font-extrabold">
            연결이 느립니다. 이용 가능 여부를 확인하지 못했습니다.
          </p>
          <p className="text-xs text-[#0D1B2A]/60">
            네트워크 상태를 확인한 뒤 다시 시도해 주세요. 이미 결제하셨다면 곧
            다시 확인됩니다.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 rounded-full bg-[#0D1B2A] px-5 py-2 text-xs font-extrabold text-white"
          >
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  return children ?? <Outlet />;
}
