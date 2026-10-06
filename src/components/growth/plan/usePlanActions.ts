import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { type PlanResponse, patchPlanItem } from "@/lib/growth/api";
import { growthQueryKeys } from "@/lib/growth/queries";
import {
  applyOptimisticCheck,
  applyServerChange,
  checkFailureOutcome,
  findItem,
  rollbackItem,
  toDeadlinePayload,
} from "./planLogic";

// 실행계획 항목 변경. 체크는 낙관적 갱신 뒤 PATCH, 실패하면 그 항목만 롤백한다.
// 캐시는 growthPlanQuery(userId) 와 같은 키(최신 완료 회차)를 직접 갱신한다.
export function usePlanActions(userId: string | null) {
  const queryClient = useQueryClient();
  const key = growthQueryKeys.plan(userId);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  /** 서버 응답으로 지표를 막 다시 계산했는지("방금 다시 계산함" 표시). */
  const [recalculated, setRecalculated] = useState(false);

  const setPending = useCallback((id: string, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const check = useCallback(
    async (itemId: string, done: boolean) => {
      const before = queryClient.getQueryData<PlanResponse>(key);
      const original = before ? findItem(before.plan, itemId) : undefined;
      if (!before || !original) return;

      setNotice(null);
      setPending(itemId, true);
      queryClient.setQueryData<PlanResponse>(key, (cur) =>
        cur
          ? {
              ...cur,
              plan: applyOptimisticCheck(
                cur.plan,
                itemId,
                done,
                new Date().toISOString(),
              ),
            }
          : cur,
      );

      const result = await patchPlanItem({ action: "check", itemId, done });
      setPending(itemId, false);

      if (result.kind === "ok") {
        queryClient.setQueryData<PlanResponse>(key, (cur) =>
          cur
            ? { ...cur, plan: applyServerChange(cur.plan, result.data) }
            : cur,
        );
        setRecalculated(true);
        return;
      }

      const outcome = checkFailureOutcome(
        result.kind === "error" ? result.code : null,
      );
      queryClient.setQueryData<PlanResponse>(key, (cur) =>
        cur ? { ...cur, plan: rollbackItem(cur.plan, original) } : cur,
      );
      setNotice(outcome.message);
      if (outcome.refetch) {
        await queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient, key, setPending],
  );

  const setDeadline = useCallback(
    async (itemId: string, value: string) => {
      const deadline = toDeadlinePayload(value);
      if (deadline === undefined) {
        setNotice("마감일은 YYYY-MM-DD 형식의 날짜로 입력해 주세요.");
        return;
      }
      setNotice(null);
      setPending(itemId, true);
      const result = await patchPlanItem({
        action: "set-deadline",
        itemId,
        deadline,
      });
      setPending(itemId, false);

      if (result.kind === "ok") {
        queryClient.setQueryData<PlanResponse>(key, (cur) =>
          cur
            ? { ...cur, plan: applyServerChange(cur.plan, result.data) }
            : cur,
        );
        return;
      }
      const code = result.kind === "error" ? result.code : null;
      setNotice(
        code === "CONFLICT" || code === "REPORT_NOT_LATEST"
          ? checkFailureOutcome(code).message
          : "마감일을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      if (code === "CONFLICT" || code === "REPORT_NOT_LATEST") {
        await queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient, key, setPending],
  );

  return { pendingIds, notice, recalculated, check, setDeadline };
}
