// 리포트 읽기와 자동 만들기(명세 No.133, 201). 저장된 리포트가 없으면(404) 한 번만 자동으로 만든다.
// 실패해도 최종 저장은 그대로이고, 다시 만들기만 사람이 누른다(자동 재시도 없음).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { buildReport } from "@/lib/selfeval/api";
import {
  SelfevalApiError,
  selfevalQueryKeys,
  selfevalReportQuery,
} from "@/lib/selfeval/queries";
import type { ReportPayload, ReportView } from "@/lib/selfeval/reportTypes";

const REFETCH_WHILE_BUILDING_MS = 3000;

type ReportPhase = "loading" | "building" | "ready" | "failed";

export function useSelfevalReport(sessionId: string) {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const stored = useQuery({
    ...selfevalReportQuery(userId, sessionId),
    // 다른 요청이 만드는 중이면 끝날 때까지 다시 읽는다.
    refetchInterval: (query) =>
      query.state.data?.status === "building"
        ? REFETCH_WHILE_BUILDING_MS
        : false,
  });
  const [building, setBuilding] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const autoTried = useRef(false);

  async function rebuild() {
    setBuilding(true);
    setBuildFailed(false);
    const result = await buildReport(sessionId);
    if (result.kind === "ok") {
      queryClient.setQueryData(
        selfevalQueryKeys.report(userId, sessionId),
        result.data.report,
      );
    } else if (result.kind === "error" && result.code === "REPORT_BUSY") {
      // 다른 요청이 만드는 중이다. 실패로 두지 않고 저장본을 다시 읽는다.
      await queryClient.invalidateQueries({
        queryKey: selfevalQueryKeys.report(userId, sessionId),
      });
    } else {
      setBuildFailed(true);
    }
    setBuilding(false);
  }

  const missing =
    stored.error instanceof SelfevalApiError &&
    stored.error.result.kind === "error" &&
    stored.error.result.code === "REPORT_NOT_FOUND";
  useEffect(() => {
    if (!missing || autoTried.current) return;
    autoTried.current = true;
    void rebuild();
  });

  const view: ReportView | null = stored.data ?? null;
  let phase: ReportPhase;
  if (building || view?.status === "building") phase = "building";
  else if (view?.status === "ready" && view.payload) phase = "ready";
  else if (view || buildFailed || (stored.error && !missing)) phase = "failed";
  else phase = "loading";
  const payload: ReportPayload | null =
    phase === "ready" ? (view?.payload ?? null) : null;

  return { phase, payload, rebuild };
}
