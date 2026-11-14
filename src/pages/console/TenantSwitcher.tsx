// 본사 대행 중 콘솔 왼쪽 위의 학교 이름. 대행할 수 있는 학교 목록이 있으면 드롭다운이 되고,
// 다른 학교를 고를 때마다 사유를 새로 받아 대행을 끝내고(proxy/end) 다시 시작한다(proxy/start).
// 새 대행이 열리면 이전 학교의 콘솔 데이터를 모두 비우고, 열지 못하면 학교 고르기로 보낸다.

import { type Query, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { consoleRequest } from "./api";
import { PROXY_SELECT_PATH } from "./ConsoleGate";
import { CONSOLE_BASE, findMenuItem } from "./menu";
import ProxyReasonField, { type Reason } from "./proxy-select/ProxyReasonField";
import { useProxyTenants } from "./proxy-select/useProxyTenants";
import { useToast } from "./Toast";
import { CONSOLE_ME_KEY } from "./useConsoleMe";

const SWITCH_FAILED_STATE = { proxySwitchFailed: true } as const;

// 학교마다 다른 콘솔 데이터. me 와 대행 가능 학교 목록은 학교와 무관하다.
const isTenantData = (query: Query) =>
  query.queryKey[0] === "console" &&
  query.queryKey[1] !== CONSOLE_ME_KEY[1] &&
  query.queryKey[1] !== "proxy-tenants";

interface TenantSwitcherProps {
  current: { id: string; name: string };
  className?: string;
}

export default function TenantSwitcher({
  current,
  className,
}: TenantSwitcherProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const tenants = useProxyTenants();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [reason, setReason] = useState<Reason | null>(null);
  const [switching, setSwitching] = useState(false);

  const list = tenants.data;
  if (!list?.some((t) => t.id === current.id)) {
    return <p className={className}>{current.name}</p>;
  }

  const close = () => {
    setTarget(null);
    setReason(null);
  };

  const change = async () => {
    if (!target || !reason) return;
    setSwitching(true);
    try {
      const ended = await consoleRequest("/api/console/proxy/end", {
        method: "POST",
      });
      if (ended.status !== 200) {
        toast.show({
          tone: "Error",
          message: "바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요",
        });
        return;
      }
      await queryClient.cancelQueries();
      const started = await consoleRequest("/api/console/proxy/start", {
        method: "POST",
        body: { tenantId: target.id, reason },
      });
      if (started.status !== 200) {
        queryClient.removeQueries({ predicate: isTenantData });
        close();
        navigate(PROXY_SELECT_PATH, {
          replace: true,
          state: SWITCH_FAILED_STATE,
        });
        return;
      }
      await queryClient.resetQueries({ predicate: isTenantData });
      await queryClient.invalidateQueries({ queryKey: CONSOLE_ME_KEY });
      close();
      // 학생 상세처럼 학교에 묶인 주소는 새 학교에서 열 수 없어 콘솔 홈으로 간다.
      navigate(
        findMenuItem(pathname)?.to === pathname ? pathname : CONSOLE_BASE,
        {
          replace: true,
        },
      );
    } catch {
      toast.show({
        tone: "Error",
        message: "바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요",
      });
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <select
        aria-label="학교 바꾸기"
        value={current.id}
        onChange={(e) => {
          const next = list.find((t) => t.id === e.target.value);
          if (next && next.id !== current.id) setTarget(next);
        }}
        className={className}
      >
        {list.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !switching) close();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>학교 바꾸기</DialogTitle>
          <DialogDescription>
            {`바꿀 학교: ${target?.name ?? ""}`}
            <br />
            지금 대행은 끝나고, 고른 사유로 새 대행이 시작돼요.
          </DialogDescription>
          <ProxyReasonField reason={reason} onChange={setReason} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={switching}
              onClick={close}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={!reason || switching}
              onClick={() => void change()}
            >
              바꾸기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
