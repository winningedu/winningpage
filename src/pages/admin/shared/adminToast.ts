import { toast } from "@/components/ui/toast";

// 예전 window.alert 를 대신하는 토스트 세 종류. 문구는 호출부가 그대로 넘긴다.
// alert 는 확인을 눌러야 닫혔으므로, 읽고 조치해야 하는 안내는 timeout 0(자동 닫힘
// 없음: @base-ui/react 1.9.0 toast/useToastManager.d.ts:32)과 high 우선순위로 둔다.

/** 저장, 변경 같은 완료 안내. 기본 시간 뒤 사라진다. */
export function toastSuccess(title: string, description?: string): void {
  toast.add({ type: "success", priority: "low", title, description });
}

/** 입력 검증, "먼저 ~하세요", 일부만 반영된 안내처럼 읽고 닫아야 하는 경고. */
export function toastWarning(title: string, description?: string): void {
  toast.add({
    type: "warning",
    priority: "high",
    timeout: 0,
    title,
    description,
  });
}

/** 매핑된 실패 문구. 오류 객체가 있으면 reportAdminError 를 쓴다. */
export function toastError(title: string, description?: string): void {
  toast.add({
    type: "error",
    priority: "high",
    timeout: 0,
    title,
    description,
  });
}
