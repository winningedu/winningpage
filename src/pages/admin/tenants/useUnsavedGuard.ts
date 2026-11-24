import { useCallback, useEffect } from "react";
import { type Location, useBeforeUnload, useBlocker } from "react-router";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";

// 고친 내용이 있는 동안만 화면 이동, 새로고침, 탭 닫기를 막는다. 깨끗하면 아무것도 막지 않는다.
// stays 가 true 인 이동(같은 화면 안의 탭 전환)은 입력이 남으므로 막지 않는다.
export function useUnsavedGuard(
  dirty: boolean,
  stays: (next: Location) => boolean = () => false,
) {
  const blocker = useBlocker(
    ({ nextLocation }) => dirty && !stays(nextLocation),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let alive = true;
    confirmAdmin({
      title: "저장하지 않은 변경이 있어요",
      description: "이 화면을 나가면 고친 내용이 사라져요.",
      confirmLabel: "나가기",
      cancelLabel: "계속 수정",
      destructive: true,
    }).then((leave) => {
      if (!alive) return;
      if (leave) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      alive = false;
    };
  }, [blocker]);

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) event.preventDefault();
      },
      [dirty],
    ),
  );
}
