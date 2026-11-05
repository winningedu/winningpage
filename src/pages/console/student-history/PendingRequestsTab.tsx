// W13 승인 대기 탭. 표(768 이상)로 요청 목록을 보인다.

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { consoleRequest } from "../api";
import Chip from "../Chip";
import { PENDING_COUNT_KEY } from "../ConsoleLayout";
import EmptyMessage from "../EmptyMessage";
import Notice from "../Notice";
import { SAVE_FAILED_MESSAGE } from "../passwordRule";
import { useToast } from "../Toast";
import { type Slot, slotLabel } from "./format";
import { HISTORY_KEY, usePagedList } from "./usePagedList";

interface PendingRequest {
  changeId: string;
  studentId: string;
  studentName: string;
  from: Slot;
  to: Slot;
  gradeChanges: boolean;
}

export default function PendingRequestsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = usePagedList<PendingRequest>(
    "/api/console/enrollment-requests",
    {},
    1,
  );

  const approve = async (item: PendingRequest) => {
    setBusyId(item.changeId);
    try {
      const res = await consoleRequest(
        "/api/console/enrollment-requests/decide",
        {
          method: "POST",
          body: { changeId: item.changeId, approve: true },
        },
      );
      if (res.status !== 200) throw new Error(`decide ${res.status}`);
      const { studentName } = res.body as { studentName: string };
      toast.show({
        tone: "Success",
        message: `${studentName} 학생의 변경을 승인했어요`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
        queryClient.invalidateQueries({ queryKey: PENDING_COUNT_KEY }),
      ]);
    } catch {
      toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
    }
    setBusyId(null);
  };

  if (list.isError)
    return <Notice tone="Danger">신청 목록을 불러오지 못했어요</Notice>;
  if (!list.data) return null;
  return (
    <section className="flex flex-col">
      <h2 className="pt-5 pb-4 text-app-card-title font-bold text-ink-strong">
        {`승인 대기 ${list.data.total}건`}
      </h2>
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
              <TableCell>{item.studentName}</TableCell>
              <TableCell>{slotLabel(item.from)}</TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  {slotLabel(item.to)}
                  <Chip tone="Neutral">신청 중</Chip>
                </span>
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void approve(item)}
                >
                  승인
                </button>
                <button type="button">거절</button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {list.data.items.length === 0 && (
        <EmptyMessage body="승인 대기가 없어요. 학생 조회와 이력 탭에서 학생의 학년그룹과 반 이력을 볼 수 있어요" />
      )}
    </section>
  );
}
