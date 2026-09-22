import { useCallback, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import { isValidTenantCodeFormat, normalizeTenantCode } from "@/lib/tenantCode";
import MyPageModalShell from "./MyPageModalShell";
import ModalFooter from "./modal/ModalFooter";

// 소속코드 입력 모달 — 가입 시 소속코드를 입력하지 않은 학생이 나중에 1회
// 입력할 수 있게 한다(2026-09-01, 2026-09-22 tenant 전환으로 fn_set_my_tenant
// RPC 경유로 전면 교체). 입력하면 결제 화면에서 소속 한정 특가가 노출된다
// (products.tenant_id 매칭, fn_matched_tenant_ids).
//
// profiles.tenant_id는 이제 직접 update가 트리거(fn_profiles_lock_tenant,
// WC070)로 막힌다 — 반드시 fn_set_my_tenant RPC를 거쳐야 한다. 이미 소속이
// 설정된 사용자는 ProfileTab이 이 모달 진입 버튼 자체를 숨긴다(1회 입력 원칙)
// — 그래도 레이스(다른 탭에서 먼저 설정)로 여기까지 열릴 수 있어 WC071도
// 방어적으로 처리한다.
const ORG_CODE_MAX_LENGTH = 20;

const FIELD_CLASS =
  "h-13 w-full rounded-xl border border-line px-4 text-[0.9375rem] text-ink outline-hidden focus:border-accent";

// fn_set_my_tenant가 raise하는 errcode → 사용자 문구
// (supabase/migrations/20260922002935_tenant_id_columns_backfill.sql,
// 20260922002929_tenants_core.sql). RefundRequestModal.tsx의 REFUND_ERROR_TEXT와
// 동일 패턴(error.code로 매칭).
const TENANT_ERROR_TEXT: Record<string, string> = {
  // WC071: 이미 소속이 설정됨(재설정은 어드민 경로 전용).
  WC071: "이미 소속이 설정되어 있어요.",
  // WC068: 최근 1시간 실패 시도 10회 초과(레이트리밋).
  WC068: "시도 횟수를 초과했어요. 잠시 후 다시 시도해 주세요.",
};
const TENANT_UNKNOWN_ERROR_TEXT =
  "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";

type OrgCodeModalProps = {
  open: boolean;
  profileId?: string | undefined;
  onClose: () => void;
  onChanged?: (tenantName: string) => void;
};

export default function OrgCodeModal({
  open,
  profileId,
  onClose,
  onChanged,
}: OrgCodeModalProps) {
  const [orgCode, setOrgCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setOrgCode("");
    setSaving(false);
    setErrorMsg("");
  }, [open]);

  const trimmed = orgCode.trim();
  const canSubmit = !saving && profileId !== undefined && trimmed !== "";

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || profileId === undefined) return;

    // 형식 검증 — "존재하는 코드인지"는 서버만 판정하므로 여기서는 8자
    // 허용 알파벳 형식만 막는다(src/pages/signup 폼들과 동일 규칙).
    if (!isValidTenantCodeFormat(trimmed)) {
      setErrorMsg("소속코드 형식을 확인해 주세요. (영문·숫자 8자)");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const { data, error } = await supabase.rpc("fn_set_my_tenant", {
      p_code: normalizeTenantCode(trimmed),
    });

    setSaving(false);

    if (error) {
      console.error("소속코드 저장 실패:", error);
      setErrorMsg(TENANT_ERROR_TEXT[error.code] ?? TENANT_UNKNOWN_ERROR_TEXT);
      return;
    }

    // 0행 = 존재하지 않는 코드(에러 아님, raise하면 레이트리밋 기록이 롤백돼
    // 무력화되므로 서버가 의도적으로 0행을 돌려준다 — 마이그레이션 주석 참고).
    const row = Array.isArray(data) ? data[0] : undefined;
    if (!row) {
      setErrorMsg("존재하지 않는 소속코드입니다. 코드를 다시 확인해 주세요.");
      return;
    }

    onChanged?.(row.name);
    onClose();
  }, [canSubmit, profileId, trimmed, onChanged, onClose]);

  if (!open) return null;

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="sm"
      title="소속코드를 입력해주세요"
      footer={
        <ModalFooter
          buttons={[
            {
              key: "cancel",
              label: "취소",
              variant: "neutral",
              onClick: onClose,
            },
            {
              key: "submit",
              label: saving ? "저장 중..." : "저장",
              variant: "primary",
              disabled: !canSubmit,
              onClick: handleSubmit,
            },
          ]}
        />
      }
    >
      <ScrollArea className="flex-1 px-6">
        <label className="mt-6 block">
          <span className="text-[0.8125rem] font-semibold text-ink">
            소속코드
          </span>
          <input
            type="text"
            value={orgCode}
            onChange={(e) => {
              setOrgCode(e.target.value);
              setErrorMsg("");
            }}
            placeholder="영문·숫자 8자리 소속코드 입력"
            maxLength={ORG_CODE_MAX_LENGTH}
            className={`mt-2 ${FIELD_CLASS}`}
          />
        </label>
        <p className="mt-2 text-xs text-ink-sub">
          소속코드는 한 번 설정하면 스스로 변경할 수 없어요.
        </p>

        {errorMsg && (
          <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
        )}
      </ScrollArea>
    </MyPageModalShell>
  );
}
