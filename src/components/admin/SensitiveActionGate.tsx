import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type AdminAccessAction,
  verifyAdminPassword,
  writeAdminAccessLog,
} from "@/lib/adminAccessLog";
import { ActionButton } from "@/pages/admin/shared/formFields";

// ---------------------------------------------------------------------------
// 개인정보 반출 게이트 (QA 268·270·228·223·271·269).
//
// 여섯 행의 요구가 하나로 겹친다: 다운로드/마스킹 해제 버튼 → 관리자 비밀번호
// 입력 + 사유 필수 기재 → 로그 저장 → 그제서야 실제 동작. 화면마다 따로 만들면
// 문구·검증·적재가 여섯 벌로 갈라지므로 모달 하나를 훅으로 감싸 6곳이 같은
// 물건을 쓴다.
//
// 쓰는 쪽:
//   const { requestAccess, gate } = useSensitiveActionGate();
//   ...
//   <button onClick={() => requestAccess({ ... , onGranted: 실제동작 })} />
//   {gate}
//
// 순서가 중요하다 — **로그를 먼저 남기고 그다음 동작**이다. 반대로 하면 적재가
// 실패했을 때 데이터는 이미 나간 뒤가 된다.
// ---------------------------------------------------------------------------

export type SensitiveAccessRequest = {
  action: AdminAccessAction;
  /** ADMIN_SECTION_KEYS 와 같은 메뉴 키. 로그의 resource_key 가 된다. */
  resourceKey: string;
  /** 모달 제목. 예: "회원 목록 다운로드" */
  title: string;
  /** 무엇이 나가는지 한 줄 설명. 예: "회원 1,234건의 개인정보가 CSV로 저장됩니다." */
  description: string;
  rowCount?: number | undefined;
  targetId?: string | undefined;
  onGranted: () => void | Promise<void>;
};

type GateState = {
  request: SensitiveAccessRequest;
  password: string;
  reason: string;
  error: string;
  busy: boolean;
};

export function useSensitiveActionGate() {
  const [state, setState] = useState<GateState | null>(null);
  // 같은 틱의 두 번째 제출은 직전 렌더의 state.busy 가 아직 false 라 막지 못한다.
  const inFlight = useRef(false);

  const requestAccess = useCallback((request: SensitiveAccessRequest) => {
    setState({
      request,
      password: "",
      reason: "",
      error: "",
      busy: false,
    });
  }, []);

  const close = useCallback(() => setState(null), []);

  async function submit() {
    if (!state || state.busy || inFlight.current) return;

    inFlight.current = true;
    try {
      const reason = state.reason.trim();
      if (!reason) {
        setState({ ...state, error: "다운로드 사유를 입력하세요." });
        return;
      }

      setState({ ...state, busy: true, error: "" });

      const verified = await verifyAdminPassword(state.password);
      if (!verified.ok) {
        setState((prev) =>
          prev ? { ...prev, busy: false, error: verified.message } : prev,
        );
        return;
      }

      const logged = await writeAdminAccessLog({
        action: state.request.action,
        resourceKey: state.request.resourceKey,
        reason,
        rowCount: state.request.rowCount,
        targetId: state.request.targetId,
      });
      if (!logged.ok) {
        setState((prev) =>
          prev ? { ...prev, busy: false, error: logged.message } : prev,
        );
        return;
      }

      const { onGranted } = state.request;
      setState(null);
      await onGranted();
    } finally {
      inFlight.current = false;
    }
  }

  const gate = state ? (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(open, eventDetails) => {
        if (open) return;
        // 확인 중에 닫으면 submit 이 이어서 로그 적재와 onGranted 까지 실행해 닫기가
        // 곧 승인이 된다. 확인 중에는 Esc 등 모든 닫기를 막는다.
        // eventDetails.cancel: @base-ui/react 1.9.0 internals/createBaseUIEventDetails.d.ts:55
        if (state.busy) {
          eventDetails.cancel();
          return;
        }
        // 닫기는 취소일 뿐이다. onGranted 는 submit 성공 경로에서만 부른다.
        close();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-105">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-[#111827]">
            {state.request.title}
          </DialogTitle>
          <DialogDescription className="font-bold text-gray-600">
            {state.request.description}
          </DialogDescription>
          <p className="text-xs font-bold text-red-500">
            비밀번호 확인과 사유는 기록으로 남습니다.
          </p>
        </DialogHeader>

        <label className="block text-xs font-black text-gray-500">
          관리자 비밀번호
          <input
            type="password"
            autoComplete="current-password"
            value={state.password}
            disabled={state.busy}
            onChange={(e) =>
              setState((prev) =>
                prev ? { ...prev, password: e.target.value } : prev,
              )
            }
            className="mt-1 h-9 w-full border border-gray-400 px-3 text-sm font-bold outline-hidden disabled:bg-gray-100"
          />
        </label>

        <label className="block text-xs font-black text-gray-500">
          사유 (필수)
          <textarea
            rows={3}
            value={state.reason}
            disabled={state.busy}
            placeholder="어떤 업무로 필요한지 적어 주세요."
            onChange={(e) =>
              setState((prev) =>
                prev ? { ...prev, reason: e.target.value } : prev,
              )
            }
            className="mt-1 w-full resize-none border border-gray-400 px-3 py-2 text-sm font-bold outline-hidden disabled:bg-gray-100"
          />
        </label>

        {state.error && (
          <p className="text-sm font-black text-red-600">{state.error}</p>
        )}

        <DialogFooter>
          <ActionButton variant="light" onClick={close} disabled={state.busy}>
            취소
          </ActionButton>
          <ActionButton onClick={submit} disabled={state.busy}>
            {state.busy ? "확인 중…" : "확인"}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { requestAccess, gate };
}
