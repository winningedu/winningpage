// W13a 학년도별 이력 창. 서버가 403 을 주거나 코칭을 열 수 없는 학생이면 안내를 보이고 코칭을 막는다(결정 35).
// 제목의 이름은 서버가 준 그대로이고, 아직 못 받았거나 403 이면 목록에서 본 이름을 쓴다.

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { gradeLabel } from "../classLabel";
import { CONSOLE_BASE } from "../menu";
import Notice from "../Notice";

// 서비스 표시 순서
const SERVICES = [
  ["diagnosis", "학습진단"],
  ["goal", "목표관리"],
  ["growth", "성장설계"],
  ["performance", "수행평가"],
  ["selfeval", "자기평가"],
  ["inquiry", "심화탐구"],
] as const;

interface EnrollmentHistory {
  name: string;
  linkedServices: string[];
  years: {
    schoolYear: number;
    grade: string | null;
    groupName: string | null;
    className: string | null;
    number: number | null;
    current: boolean;
  }[];
  canOpenCoaching: boolean;
}

type Loaded = EnrollmentHistory | "forbidden";

async function fetchHistory(studentId: string): Promise<Loaded> {
  const res = await consoleRequest(
    `/api/console/students/enrollment-history?studentId=${encodeURIComponent(studentId)}`,
  );
  if (res.status === 403) return "forbidden";
  if (res.status !== 200) throw new Error(`enrollment-history ${res.status}`);
  return res.body as EnrollmentHistory;
}

interface HistoryDialogProps {
  studentId: string;
  listName: string;
  /** 졸업생이면 코칭을 막는다(현재 담임이 없다). 안내 문구는 없다. */
  graduate?: boolean;
  onClose: () => void;
}

export default function HistoryDialog({
  studentId,
  listName,
  graduate = false,
  onClose,
}: HistoryDialogProps) {
  const navigate = useNavigate();
  const history = useQuery({
    queryKey: ["console", "enrollment-history", studentId],
    queryFn: () => fetchHistory(studentId),
    retry: false,
    gcTime: 0,
  });
  const data = history.data;
  const detail = data && data !== "forbidden" ? data : null;
  const noPermission =
    data === "forbidden" || detail?.canOpenCoaching === false;
  const services = detail
    ? SERVICES.filter(([key]) => detail.linkedServices.includes(key)).map(
        ([, label]) => label,
      )
    : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="gap-5 rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[32.5rem]"
      >
        <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
          {`${detail?.name ?? listName} 학년도별 이력`}
        </DialogTitle>
        {history.isError && (
          <Notice tone="Danger">이력을 불러오지 못했어요</Notice>
        )}
        {detail && (
          <div className="flex flex-col gap-3">
            <p className="text-app-label text-ink-strong">
              {`연결된 서비스 데이터: ${services.join(", ")}(${services.length}/${SERVICES.length}). 학년이나 반이 바뀌어도 기록은 그대로 이어져요`}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학년도</TableHead>
                  <TableHead>학년그룹, 그룹</TableHead>
                  <TableHead>반</TableHead>
                  <TableHead>번호</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.years.map((y) => (
                  <TableRow key={y.schoolYear}>
                    <TableCell>{y.schoolYear}</TableCell>
                    <TableCell>
                      {y.grade &&
                        `${gradeLabel(y.grade)}, ${y.groupName ?? "그룹 없음"}`}
                    </TableCell>
                    <TableCell>{y.className && `${y.className}반`}</TableCell>
                    <TableCell>
                      {y.number !== null && `${y.number}번`}
                    </TableCell>
                    <TableCell>
                      {y.current && <Chip tone="Info">현재</Chip>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {noPermission && (
          <Notice tone="Danger">
            <p>이 학생의 코칭 화면을 열람할 권한이 없습니다.</p>
            <p>현재 담임교사와 학교 전체 관리자만 열람할 수 있습니다.</p>
          </Notice>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
          >
            닫기
          </Button>
          <Button
            type="button"
            disabled={!detail || noPermission || graduate}
            onClick={() =>
              navigate(`${CONSOLE_BASE}/coaching?studentId=${studentId}`)
            }
            className="h-10 rounded-lg px-5 text-app-label font-semibold disabled:opacity-40"
          >
            코칭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
