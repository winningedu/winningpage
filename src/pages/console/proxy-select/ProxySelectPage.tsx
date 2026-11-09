// W5a 학교 고르기(/teacher/proxy). 본사 관리자가 대행할 학교와 사유 하나를 골라 8시간 대행을 시작한다.
// 사이드바 없이 사이트 헤더만 있는 카드 한 장이다. 시작하면 me 를 다시 읽어 대시보드(대행 띠)로 간다.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { consoleRequest } from "../api";
import EmptyMessage from "../EmptyMessage";
import Notice from "../Notice";
import TextField from "../TextField";
import { useToast } from "../Toast";
import { CONSOLE_ME_KEY } from "../useConsoleMe";
import { useProxyTenants } from "./useProxyTenants";

const REASONS = [
  { value: "admin_absent", label: "관리자 부재" },
  { value: "roster_proxy", label: "명단 대행" },
  { value: "incident_support", label: "장애 지원" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

const START_FAILED = "대행을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요";

function TenantRow({
  name,
  code,
  checked,
  onSelect,
}: {
  name: string;
  code: string;
  checked: boolean;
  onSelect: () => void;
}) {
  const nameId = useId();
  const codeId = useId();
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2",
        checked
          ? "border-primary bg-surface-info"
          : "border-line bg-background",
      )}
    >
      <input
        type="radio"
        name="tenant"
        checked={checked}
        onChange={onSelect}
        aria-labelledby={nameId}
        aria-describedby={codeId}
        className="size-4 accent-primary"
      />
      <span id={nameId} className="text-app-body font-semibold text-ink-strong">
        {name}
      </span>
      <span id={codeId} className="ml-auto text-app-label text-ink-sub">
        {code}
      </span>
    </label>
  );
}

export default function ProxySelectPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const tenants = useProxyTenants();
  const [keyword, setKeyword] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [starting, setStarting] = useState(false);

  // 방금 끝낸 대행 세션이 me 에 남아 있지 않게 다시 읽는다.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: CONSOLE_ME_KEY });
  }, [queryClient]);

  const query = keyword.trim().toLowerCase();
  const shown = (tenants.data ?? []).filter(
    (t) =>
      t.name.toLowerCase().includes(query) ||
      t.code.toLowerCase().includes(query),
  );

  const start = async () => {
    if (!tenantId || !reason) return;
    setStarting(true);
    try {
      const res = await consoleRequest("/api/console/proxy/start", {
        method: "POST",
        body: { tenantId, reason },
      });
      if (res.status !== 200) throw new Error(`proxy start ${res.status}`);
      await queryClient.invalidateQueries({ queryKey: CONSOLE_ME_KEY });
      navigate("/teacher", { replace: true });
    } catch {
      toast.show({ tone: "Error", message: START_FAILED });
      setStarting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
        className="flex w-full max-w-[40rem] flex-col gap-6 rounded-2xl border border-border bg-card p-6 md:p-8"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-app-title font-bold text-ink-strong">
            대행할 학교 고르기
          </h1>
          <p className="text-app-body text-ink-sub">
            학교를 고르고 대행 사유를 하나 골라 주세요.
          </p>
        </div>

        <TextField
          label="학교 검색"
          placeholder="학교 이름이나 소속코드를 입력하세요"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        {tenants.isError && (
          <Notice tone="Danger">
            학교 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
          </Notice>
        )}
        {tenants.data && (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {shown.length === 0 ? (
              <EmptyMessage body="찾는 학교가 없어요. 이름이나 소속코드를 바꿔 보세요" />
            ) : (
              shown.map((t) => (
                <TenantRow
                  key={t.id}
                  name={t.name}
                  code={t.code}
                  checked={tenantId === t.id}
                  onSelect={() => setTenantId(t.id)}
                />
              ))
            )}
          </div>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-app-label font-medium text-ink-sub">
            대행 사유
          </legend>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className="flex items-center gap-2 text-app-body text-ink-strong"
              >
                <input
                  type="radio"
                  name="reason"
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="size-4 accent-primary"
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        {tenantId && reason && (
          <Notice tone="Info">
            대행은 8시간 뒤 자동으로 끝나요. 모든 조회와 수정은 본사 직원
            이름으로 기록돼요.
          </Notice>
        )}

        <Button
          type="submit"
          disabled={!tenantId || !reason || starting}
          className="h-11 rounded-lg text-app-body font-semibold"
        >
          대행 시작
        </Button>
      </form>
    </div>
  );
}
