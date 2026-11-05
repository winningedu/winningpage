// W13 승인 대기 탭. 표(768 이상)로 요청 목록을 보인다.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Chip from "../Chip";
import Notice from "../Notice";
import { type Slot, slotLabel } from "./format";
import { usePagedList } from "./usePagedList";

interface PendingRequest {
  changeId: string;
  studentId: string;
  studentName: string;
  from: Slot;
  to: Slot;
  gradeChanges: boolean;
}

export default function PendingRequestsTab() {
  const list = usePagedList<PendingRequest>(
    "/api/console/enrollment-requests",
    {},
    1,
  );
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
                <button type="button">승인</button>
                <button type="button">거절</button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
