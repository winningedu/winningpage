// 콘솔 셸. 대행 띠, 역할별 사이드바(1024 이상) 또는 서랍(1023 이하), 본문 outlet.
// 유휴 로그아웃은 이 셸에서만 건다(P22). 사이트 헤더는 라우트 쪽 ConsoleHeaderFrame 이 그린다.

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { consoleRequest } from "./api";
import ConsoleBar from "./ConsoleBar";
import ConsoleNav from "./ConsoleNav";
import { CONSOLE_BASE, canOpen, findMenuItem } from "./menu";
import NoPermission from "./NoPermission";
import ProxyBanner from "./ProxyBanner";
import { useToast } from "./Toast";
import { useConsoleMe } from "./useConsoleMe";
import { useIdleLogout } from "./useIdleLogout";

export const PENDING_COUNT_KEY = ["console", "pending-count"] as const;
const MAX_TIMER_MS = 2 ** 31 - 1;
const PROXY_PICK_PATH = `${CONSOLE_BASE}/proxy`;

async function fetchPendingCount(): Promise<number> {
  const res = await consoleRequest("/api/console/enrollment-requests/count");
  const count = (res.body as { count?: unknown } | null)?.count;
  if (res.status !== 200 || typeof count !== "number")
    throw new Error("pending count unavailable");
  return count;
}

export default function ConsoleLayout() {
  const { me } = useConsoleMe();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  useIdleLogout();

  // 읽지 못하면 배지를 그리지 않는다(기본값을 만들어 내지 않는다).
  const pending = useQuery({
    queryKey: PENDING_COUNT_KEY,
    queryFn: fetchPendingCount,
    retry: false,
  });

  const expiresAt = me.proxySession?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const expiry = new Date(expiresAt).getTime();
    const timer = window.setTimeout(
      () => {
        // 타이머 최대 지연을 넘는 만료는 일찍 깨어날 수 있어 시각을 다시 확인한다.
        if (Date.now() >= expiry) navigate(PROXY_PICK_PATH, { replace: true });
      },
      Math.min(Math.max(expiry - Date.now(), 0), MAX_TIMER_MS),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt, navigate]);

  const item = findMenuItem(pathname);
  const blocked = item !== null && !canOpen(item, me.kind);
  if (blocked && !item.noPermissionView) {
    return <Navigate to={CONSOLE_BASE} replace />;
  }

  const endProxy = async () => {
    setEnding(true);
    try {
      const res = await consoleRequest("/api/console/proxy/end", {
        method: "POST",
      });
      if (res.status !== 200) throw new Error(`proxy end ${res.status}`);
      navigate(PROXY_PICK_PATH);
    } catch {
      toast.show({
        tone: "Error",
        message: "종료하지 못했어요. 잠시 뒤 다시 시도해 주세요",
      });
      setEnding(false);
    }
  };

  const nav = (onNavigate?: () => void) => (
    <ConsoleNav
      me={me}
      pendingCount={pending.data ?? 0}
      activePath={pathname}
      {...(onNavigate ? { onNavigate } : {})}
    />
  );

  return (
    <>
      {me.proxySession && (
        <ProxyBanner
          tenantName={me.proxySession.tenantName}
          onEnd={() => void endProxy()}
          ending={ending}
        />
      )}
      <div className="lg:flex">
        <aside className="hidden w-app-sidebar shrink-0 overflow-y-auto bg-sidebar px-5 py-6 lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)]">
          {nav()}
        </aside>
        <div className="min-w-0 flex-1 bg-background">
          <ConsoleBar
            currentPage={item?.label ?? ""}
            onOpenMenu={() => setDrawerOpen(true)}
          />
          <main key={me.tenant.id} className="pb-12 lg:pb-24">
            {blocked ? <NoPermission /> : <Outlet />}
          </main>
        </div>
      </div>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
          className="w-app-sidebar overflow-y-auto bg-sidebar px-5 pt-2 pb-6"
        >
          <SheetTitle className="sr-only">메뉴</SheetTitle>
          <div className="flex h-11 justify-end">
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setDrawerOpen(false)}
              className="flex size-11 items-center justify-center"
            >
              <X aria-hidden className="size-6" />
            </button>
          </div>
          {nav(() => setDrawerOpen(false))}
        </SheetContent>
      </Sheet>
    </>
  );
}
