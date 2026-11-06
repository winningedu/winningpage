import { useRevalidator, useRouteError } from "react-router";
import ServiceBlockedNotice from "@/components/service/ServiceBlockedNotice";
import { queryClient } from "@/lib/queryClient";
import {
  AdminForbiddenError,
  RouteCheckFailedError,
  ServiceBlockedError,
} from "@/lib/routeMiddleware";

// src/lib/routeMiddleware.ts의 판정(middleware)과 짝을 이루는 UI 조각들.
// middleware는 redirect() 아니면 throw만 할 수 있어 화면을 그릴 수 없다 —
// "loading" 상태는 라우트의 HydrateFallback(첫 진입/하드 리로드에서만 노출,
// SPA 소프트 내비게이션 중에는 이전 화면이 유지된다 — App.jsx 배선 주석 참고),
// "그 자리에 머물러 재시도" 상태는 ErrorBoundary(+ useRevalidator)로 옮겼다.
// 마크업・문구는 전부 원본 컴포넌트(ProtectedRoute/ProtectedAdmin/
// RequireEntitlement/RequireGoalAccess)에서 그대로 가져왔다 — 신규 문구 아님.

export function AuthCheckingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
        로그인 상태 확인 중...
      </div>
    </main>
  );
}

export function AdminCheckingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
        관리자 권한 확인 중...
      </div>
    </main>
  );
}

export function AdminAccessBoundary() {
  const error = useRouteError();

  if (!(error instanceof AdminForbiddenError)) {
    throw error;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] px-6 pt-16 text-[#0D1B2A]">
      <div className="max-w-md rounded-3xl border border-[#0D1B2A]/10 bg-white p-8 text-center shadow-[0_22px_60px_rgba(13,27,42,0.12)]">
        <p className="text-2xl font-black">관리자 권한이 없습니다.</p>

        <p className="mt-3 text-sm font-bold leading-6 text-[#5B6573]">
          관리자 페이지는 profiles 테이블의 role 값이 admin인 계정만 접근할 수
          있습니다.
        </p>
      </div>
    </main>
  );
}

export function GoalAccessCheckingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
        이용 가능 여부 확인 중...
      </div>
    </main>
  );
}

// apiFetch(B-1) 도입 이후 이 판정 불가 상태는 대부분 15초 타임아웃이 원인이다
// (그 전에는 응답이 오지 않으면 무한 대기였다) — 문구에 "연결이 느립니다"를
// 실어 사용자가 재시도 버튼의 의미를 바로 알 수 있게 한다.
const GOAL_CHECK_FAILED_COPY = {
  entitlement: {
    title: "연결이 느립니다. 이용 가능 여부를 확인하지 못했습니다.",
    body: "네트워크 상태를 확인한 뒤 다시 시도해 주세요. 이미 결제하셨다면 곧 다시 확인됩니다.",
    role: "alert" as const,
  },
  onboarding: {
    title: "연결이 느립니다. 온보딩 완료 여부를 확인하지 못했습니다.",
    body: "네트워크 상태를 확인한 뒤 다시 시도해 주세요. 이미 온보딩을 마치셨다면 곧 다시 확인됩니다.",
    role: undefined,
  },
};

export function GoalAccessBoundary() {
  const error = useRouteError();
  const revalidator = useRevalidator();

  // 스쿨멘토 기관 설정으로 막힘(결정 99). 소속코드를 입력하면 진입 판정을 다시 한다.
  if (error instanceof ServiceBlockedError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-[#0D1B2A]">
        <ServiceBlockedNotice
          reason={error.reason}
          onJoined={() => revalidator.revalidate()}
          className="max-w-sm shadow-[0_18px_45px_rgba(13,27,42,0.10)]"
        />
      </main>
    );
  }

  if (!(error instanceof RouteCheckFailedError)) {
    throw error;
  }

  // 중첩 함수(retry) 안에서는 위 instanceof 좁히기가 유지되지 않는다 — TS가 클로저
  // 실행 시점의 재할당 가능성을 배제하지 못해서다. 좁혀진 값을 여기서 꺼내 둔다.
  const { reason } = error;
  const copy = GOAL_CHECK_FAILED_COPY[reason];

  // "다시 시도"는 middleware(routeMiddleware.ts)가 쓰는 query 캐시(entitlementQueryOptions/
  // goalStudentQueryOptions, staleTime 둘 다 15초)를 먼저 무효화한다 — 그냥
  // revalidate()만 하면 middleware의 ensureQueryData가 아직 fresh한 캐시를 그대로
  // 돌려줘 실제로는 재조회 없이 같은 실패가 반복될 수 있다.
  function retry() {
    queryClient.invalidateQueries({
      queryKey: reason === "entitlement" ? ["entitlement"] : ["goal"],
    });
    revalidator.revalidate();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-[#0D1B2A]">
      <div
        role={copy.role}
        className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-8 text-center shadow-[0_18px_45px_rgba(13,27,42,0.10)]"
      >
        <p className="text-sm font-extrabold">{copy.title}</p>
        <p className="text-xs text-[#0D1B2A]/60">{copy.body}</p>
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
