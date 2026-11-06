import { useState } from "react";
import JoinTenantModal from "@/components/enrollment/JoinTenantModal";
import { queryClient } from "@/lib/queryClient";
import {
  TENANT_JOIN_LABEL,
  type TenantBlockReason,
  tenantBlockMessage,
} from "@/lib/tenantBlock";

// 스쿨멘토 서비스 막힘 안내(결정 99). 구매, 이용권 링크는 두지 않는다.
// 기타 소속이면 소속코드 입력 모달을 열고, 옮긴 뒤 이용권 조회를 모두 다시 한다.
export default function ServiceBlockedNotice({
  reason,
  onJoined,
  className = "",
}: {
  reason: TenantBlockReason | null;
  onJoined?: (() => void) | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      role="status"
      className={`flex flex-col items-center gap-3 rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-8 text-center ${className}`}
    >
      <p className="text-sm font-extrabold text-[#0D1B2A]">
        {tenantBlockMessage(reason)}
      </p>
      {reason === "catch_all" && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-[#0D1B2A] px-5 py-2 text-xs font-extrabold text-white"
          >
            {TENANT_JOIN_LABEL}
          </button>
          <JoinTenantModal
            open={open}
            onClose={() => setOpen(false)}
            onJoined={() => {
              queryClient.invalidateQueries({ queryKey: ["entitlement"] });
              onJoined?.();
            }}
          />
        </>
      )}
    </div>
  );
}
