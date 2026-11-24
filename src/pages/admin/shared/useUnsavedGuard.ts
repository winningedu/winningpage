import { useCallback, useEffect } from "react";
import { type Location, useBeforeUnload, useBlocker } from "react-router";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";

// 저장하지 않은 폼을 들고 화면을 나갈 때만 막는다. 폼 말고는 아무것도 막지 않는다.
// stays 는 같은 화면 안의 이동(회원 상세의 탭 전환)을 걸러내는 판정이다.
export function useUnsavedGuard(
  dirty: boolean,
  stays: (nextLocation: Location) => boolean,
): void {
  const blocker = useBlocker(
    ({ nextLocation }) => dirty && !stays(nextLocation),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    confirmAdmin({
      title: "저장하지 않은 변경이 있어요",
      description: "이 화면을 나가면 고친 내용이 사라져요.",
      confirmLabel: "나가기",
      cancelLabel: "계속 수정",
    }).then((leave) => {
      if (leave) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker]);

  // 새로고침과 탭 닫기는 라우터가 못 잡아서 브라우저 확인창에 맡긴다.
  useBeforeUnload(
    useCallback(
      (event) => {
        if (dirty) event.preventDefault();
      },
      [dirty],
    ),
  );
}
