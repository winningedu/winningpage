import { useEffect } from "react";
import { toastError } from "@/pages/admin/shared/adminToast";

/** 조회 실패를 콘솔과 토스트로 알린다. 원문은 화면에 올리지 않는다. */
export function useLoadErrorToast(error: unknown, title: string) {
  useEffect(() => {
    if (!error) return;
    console.error(error);
    toastError(`${title} 조회 실패`, "잠시 후 다시 시도해 주세요.");
  }, [error, title]);
}
