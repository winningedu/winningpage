// /teacher 아래 모든 화면의 입구(스펙 1.5 Boot). me 를 읽어 로그인, 콘솔 권한, 임시 비밀번호 상태를 가른다.
// 임시 비밀번호 상태는 어느 콘솔 화면에서든 첫 비밀번호 화면으로 보내고, 아니면 그 화면에서 /teacher 로 돌려보낸다.

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import {
  CONSOLE_ME_KEY,
  ConsoleMeContext,
  useConsoleMeQuery,
} from "./useConsoleMe";

export const FIRST_PASSWORD_PATH = "/teacher/first-password";

function GateMessage({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 pt-16 text-center">
      <h1 className="text-app-section font-bold text-ink-strong">{title}</h1>
      {children}
    </div>
  );
}

export default function ConsoleGate() {
  const query = useConsoleMeQuery();
  const queryClient = useQueryClient();
  const { pathname, search } = useLocation();
  const value = useMemo(
    () =>
      query.data?.state === "ok"
        ? {
            me: query.data.me,
            reload: () =>
              queryClient.invalidateQueries({ queryKey: CONSOLE_ME_KEY }),
          }
        : null,
    [query.data, queryClient],
  );

  if (query.isError) {
    return (
      <GateMessage title="정보를 불러오지 못했어요">
        <Button onClick={() => void query.refetch()}>다시 시도</Button>
      </GateMessage>
    );
  }
  if (!query.data) {
    return <GateMessage title="불러오는 중이에요" />;
  }
  if (query.data.state === "unauth") {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(pathname + search)}`}
        replace
      />
    );
  }
  if (query.data.state === "noaccess" || !value) {
    return (
      <GateMessage title="이용 권한이 없어요">
        <p className="text-app-body text-ink-sub">
          선생님 계정으로 로그인했는지 확인해 주세요.
        </p>
      </GateMessage>
    );
  }

  const mustChange = value.me.mustChangePassword;
  const atFirstPassword = pathname === FIRST_PASSWORD_PATH;
  if (mustChange && !atFirstPassword) {
    return <Navigate to={FIRST_PASSWORD_PATH} replace />;
  }
  if (!mustChange && atFirstPassword) {
    return <Navigate to="/teacher" replace />;
  }

  return (
    <ConsoleMeContext.Provider value={value}>
      <Outlet />
    </ConsoleMeContext.Provider>
  );
}
