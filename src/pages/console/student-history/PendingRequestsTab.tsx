// W13 승인 대기 탭. 표(768 이상)로 요청 목록을 보인다.

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { consoleRequest, errorCode, errorMessage } from "../api";
import Chip from "../Chip";
import { PENDING_COUNT_KEY } from "../ConsoleLayout";
import { gradeLabel } from "../classLabel";
import EmptyMessage from "../EmptyMessage";
import LoadMore from "../LoadMore";
import NameCell from "../NameCell";
import Notice from "../Notice";
import Pagination from "../Pagination";
import { SAVE_FAILED_MESSAGE } from "../passwordRule";
import { type Slot, slotLabel } from "../slotLabel";
import { useToast } from "../Toast";
import { CONSOLE_LIST_KEY, usePagedList } from "../usePagedList";
import { usePageParam } from "../usePageParam";
import RejectDialog from "./RejectDialog";

interface PendingRequest {
  changeId: string;
  studentId: string;
  studentName: string;
  from: Slot;
  to: Slot;
  gradeChanges: boolean;
}

const PAGE_SIZE = 50;
const CONFLICT_MESSAGE = "다른 분이 먼저 바꿨어요. 새로 고침해 주세요";

// 서버가 번호를 쓰는 학생(occupant)을 실어 보낸다. 가린 이름 여부는 서버가 정한다.
function numberTakenMessage(body: unknown, studentName: string): string {
  const { occupant } = body as {
    occupant?: {
      grade: string;
      className: string;
      number: number;
      displayName: string | null;
    };
  };
  if (!occupant) return errorMessage(body) ?? SAVE_FAILED_MESSAGE;
  const place = `${gradeLabel(occupant.grade)} ${occupant.className}반 ${occupant.number}번`;
  const holder = occupant.displayName ? `, ${occupant.displayName}` : "";
  return `이미 사용 중인 번호예요(${place}${holder}). ${studentName} 학생이 요청한 번호라 승인할 수 없어요. 거절 사유에 비어 있는 번호를 적어 다시 요청하게 해 주세요`;
}

export default function PendingRequestsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingRequest | null>(null);
  const mobile = useIsMobile();
  const [page, setPage] = usePageParam();
  const list = usePagedList<PendingRequest>(
    "/api/console/enrollment-requests",
    {},
    page,
    mobile,
  );

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CONSOLE_LIST_KEY }),
      queryClient.invalidateQueries({ queryKey: PENDING_COUNT_KEY }),
    ]);

  const approve = async (item: PendingRequest) => {
    setBusyId(item.changeId);
    setNotice(null);
    try {
      const res = await consoleRequest(
        "/api/console/enrollment-requests/decide",
        { method: "POST", body: { changeId: item.changeId, approve: true } },
      );
      const code = errorCode(res.body);
      if (res.status === 200) {
        const { studentName } = res.body as { studentName: string };
        toast.show({
          tone: "Success",
          message: `${studentName} 학생의 변경을 승인했어요`,
        });
        await refresh();
      } else if (code === "NUMBER_TAKEN") {
        setNotice(numberTakenMessage(res.body, item.studentName));
      } else if (code === "VERSION_CONFLICT" || code === "REQUEST_NOT_FOUND") {
        setNotice(CONFLICT_MESSAGE);
        await refresh();
      } else {
        setNotice(errorMessage(res.body) ?? SAVE_FAILED_MESSAGE);
      }
    } catch {
      setNotice(SAVE_FAILED_MESSAGE);
    }
    setBusyId(null);
  };

  // 거절 확정. 처리됐거나 이미 바뀐 신청이면 창을 닫고, 사유 문제와 그 밖의 오류는 창에 남긴다.
  const reject = async (
    item: PendingRequest,
    reason: string,
  ): Promise<"blank" | string | null> => {
    setNotice(null);
    try {
      const res = await consoleRequest(
        "/api/console/enrollment-requests/decide",
        {
          method: "POST",
          body: {
            changeId: item.changeId,
            approve: false,
            rejectReason: reason,
          },
        },
      );
      const code = errorCode(res.body);
      if (res.status === 200) {
        const { studentName } = res.body as { studentName: string };
        toast.show({
          tone: "Success",
          message: `${studentName} 학생의 변경을 거절했어요`,
        });
      } else if (code === "REJECT_REASON_REQUIRED") {
        return "blank";
      } else if (code === "VERSION_CONFLICT" || code === "REQUEST_NOT_FOUND") {
        setNotice(CONFLICT_MESSAGE);
      } else {
        return errorMessage(res.body) ?? SAVE_FAILED_MESSAGE;
      }
    } catch {
      return SAVE_FAILED_MESSAGE;
    }
    setRejecting(null);
    await refresh();
    return null;
  };

  const actions = (item: PendingRequest, size: string) => (
    <>
      <Button
        type="button"
        disabled={busyId !== null}
        onClick={() => void approve(item)}
        className={cn(size, "rounded-lg px-3 text-sm font-medium")}
      >
        승인
      </Button>
      <Button
        type="button"
        disabled={busyId !== null}
        onClick={() => setRejecting(item)}
        className={cn(
          size,
          "rounded-lg bg-surface-muted px-4 text-app-label font-semibold text-ink-strong hover:bg-surface-muted",
        )}
      >
        거절
      </Button>
    </>
  );

  if (list.isError)
    return <Notice tone="Danger">신청 목록을 불러오지 못했어요</Notice>;
  if (!list.data) return null;
  return (
    <section className="flex flex-col gap-4">
      {notice && <Notice tone="Danger">{notice}</Notice>}
      <h2 className="pt-5 pb-4 text-app-card-title font-bold text-ink-strong">
        {`승인 대기 ${list.data.total}건`}
      </h2>
      {mobile ? (
        <div className="flex flex-col">
          {list.data.items.map((item) => (
            <div
              key={item.changeId}
              className="flex flex-col gap-3 border-b border-line pt-4 pb-4"
            >
              <NameCell name={item.studentName} />
              <div className="flex items-center justify-between gap-3">
                <span className="text-app-caption text-ink-sub">
                  기존 학년그룹/반/번호
                </span>
                <span className="text-app-label font-semibold text-ink">
                  {slotLabel(item.from)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-app-caption text-ink-sub">
                  요청한 학년그룹/반/번호
                </span>
                <span className="flex items-center gap-2 text-app-label font-semibold text-ink">
                  {slotLabel(item.to)}
                  <Chip tone="Neutral">신청 중</Chip>
                </span>
              </div>
              <div className="flex gap-2">{actions(item, "h-11 flex-1")}</div>
            </div>
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>학생명</TableHead>
              <TableHead>기존 학년그룹/반/번호</TableHead>
              <TableHead>요청한 학년그룹/반/번호</TableHead>
              <TableHead>처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data.items.map((item) => (
              <TableRow key={item.changeId}>
                <TableCell>
                  <NameCell name={item.studentName} />
                </TableCell>
                <TableCell>{slotLabel(item.from)}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {slotLabel(item.to)}
                    <Chip tone="Neutral">신청 중</Chip>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex justify-end gap-2">
                    {actions(item, "h-8")}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {list.data.items.length === 0 && (
        <EmptyMessage body="승인 대기가 없어요. 학생 조회와 이력 탭에서 학생의 학년그룹과 반 이력을 볼 수 있어요" />
      )}
      {mobile ? (
        <LoadMore
          shown={list.data.items.length}
          total={list.data.total}
          unit="건"
          onMore={list.fetchMore}
        />
      ) : (
        list.data.pageCount > 0 && (
          <Pagination
            page={list.data.page}
            pageCount={list.data.pageCount}
            total={list.data.total}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        )
      )}
      {list.data.items
        .filter((item) => item.gradeChanges)
        .map((item) => (
          <p key={item.changeId} className="text-app-body text-ink-sub">
            {`${item.studentName}: 학년이 바뀌면 목표관리 D-day와 내신 기준이 바뀌어요`}
          </p>
        ))}
      {rejecting && (
        <RejectDialog
          onConfirm={(reason) => reject(rejecting, reason)}
          onClose={() => setRejecting(null)}
        />
      )}
    </section>
  );
}
