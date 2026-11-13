// W6a 학생 상세 창. 실명 제목, 학년과 반 이력, 서비스 이용, 월과 학기 사용 횟수를 읽기만 한다.
// 여는 일은 서버가 접근 로그에 남긴다(교 #36). 범위 밖 학생은 서버가 404 를 주므로 불러오기 실패로 다룬다.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { consoleRequest } from "../api";
import { kstDaysAgoText } from "../date";
import { CONSOLE_BASE } from "../menu";
import Notice from "../Notice";
import { slotLabel } from "../slotLabel";
import { useGradeLabel } from "../useConsoleMe";
import { CONSOLE_LIST_KEY } from "../usePagedList";
import { SERVICES, type ServiceKey } from "./services";

interface Slot {
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
}

interface StudentDetail {
  studentId: string;
  name: string;
  flagged: boolean;
  lastSeenAt: string | null;
  enrollment: Slot & { homeroomName: string | null };
  summaries: Record<ServiceKey, string | null>;
  history: (Slot & { schoolYear: number })[];
  services: Record<ServiceKey, boolean>;
  usage: {
    key: ServiceKey;
    monthUsed: number | null;
    monthLimit: number | null;
    monthRemaining: number | null;
    termLimit: number | null;
    termRemaining: number | null;
  }[];
}

const NOT_APPLICABLE = "해당 없음";
const USAGE_CAPTION =
  "이번 달 남은 횟수는 매월 1일에, 학기 남은 횟수는 학기가 바뀔 때 새로 채워져요. 횟수는 본사에서 정하고 여기서는 볼 수만 있어요.";
const LOG_NOTICE = "학생 정보를 연 기록이 남아요";

async function fetchDetail(studentId: string): Promise<StudentDetail> {
  const res = await consoleRequest(
    `/api/console/students/detail?studentId=${encodeURIComponent(studentId)}`,
  );
  if (res.status !== 200) throw new Error(`student detail ${res.status}`);
  return res.body as StudentDetail;
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-app-body font-semibold text-ink-strong">{title}</h3>
      {children}
    </section>
  );
}

interface StudentDetailDialogProps {
  studentId: string;
  onClose: () => void;
}

export default function StudentDetailDialog({
  studentId,
  onClose,
}: StudentDetailDialogProps) {
  const gradeLabel = useGradeLabel();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["console", "student-detail", studentId],
    queryFn: () => fetchDetail(studentId),
    retry: false,
    gcTime: 0,
  });
  const queryClient = useQueryClient();
  const detail = query.data;
  const [flagOverride, setFlagOverride] = useState<boolean | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [flagError, setFlagError] = useState(false);
  const flagged = flagOverride ?? detail?.flagged ?? false;

  const toggleFlag = async () => {
    setFlagging(true);
    setFlagError(false);
    try {
      const res = await consoleRequest(
        flagged
          ? `/api/console/students/flag?studentId=${encodeURIComponent(studentId)}`
          : "/api/console/students/flag",
        flagged
          ? { method: "DELETE" }
          : { method: "POST", body: { studentId } },
      );
      if (res.status !== 200) throw new Error(`flag ${res.status}`);
      setFlagOverride(!flagged);
      void queryClient.invalidateQueries({ queryKey: CONSOLE_LIST_KEY });
    } catch {
      setFlagError(true);
    }
    setFlagging(false);
  };
  const usageOf = (key: ServiceKey) => detail?.usage.find((u) => u.key === key);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[37rem] lg:max-w-[40rem] lg:px-7"
      >
        <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
          {detail?.name ?? "학생 상세"}
        </DialogTitle>
        {query.isError && (
          <Notice tone="Danger">
            학생 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
          </Notice>
        )}
        {!detail && !query.isError && (
          <Skeleton aria-busy="true" className="h-40 rounded" />
        )}
        {detail && (
          <>
            <p className="text-app-label text-ink-sub">
              {[
                slotLabel(detail.enrollment, gradeLabel),
                detail.enrollment.homeroomName &&
                  `담임 ${detail.enrollment.homeroomName}`,
                detail.lastSeenAt &&
                  `최근 접속 ${kstDaysAgoText(detail.lastSeenAt, new Date())}`,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            <Block title="학년, 반 이력">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학년도</TableHead>
                    <TableHead>학년그룹</TableHead>
                    <TableHead>반</TableHead>
                    <TableHead>번호</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.history.map((h) => (
                    <TableRow key={h.schoolYear}>
                      <TableCell>{h.schoolYear}</TableCell>
                      <TableCell>
                        {h.grade &&
                          (h.groupName
                            ? `${gradeLabel(h.grade)}-${h.groupName}`
                            : gradeLabel(h.grade))}
                      </TableCell>
                      <TableCell>{h.className && `${h.className}반`}</TableCell>
                      <TableCell>
                        {h.number !== null && `${h.number}번`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Block>
            <Block title="서비스 이용">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>서비스</TableHead>
                    <TableHead>이용 현황</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SERVICES.map(({ key, label, Icon, color }) => (
                    <TableRow key={key}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <Icon
                            aria-hidden
                            className={cn(
                              "size-4",
                              detail.services[key] ? color : "text-neutral-400",
                            )}
                          />
                          {label}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          !detail.services[key] && "text-neutral-400",
                        )}
                      >
                        {detail.services[key]
                          ? (detail.summaries[key] ?? "이용 중")
                          : "이용 전"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Block>
            <Block title="이번 달과 학기 사용 횟수">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>서비스</TableHead>
                    <TableHead>이번 달 이용 횟수</TableHead>
                    <TableHead>이번 달 남은 횟수</TableHead>
                    <TableHead>학기 남은 횟수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SERVICES.map(({ key, label }) => {
                    const usage = usageOf(key);
                    return (
                      <TableRow key={key}>
                        <TableCell>{label}</TableCell>
                        <TableCell>
                          {usage?.monthUsed ?? NOT_APPLICABLE}
                        </TableCell>
                        <TableCell>
                          {usage?.monthLimit == null
                            ? NOT_APPLICABLE
                            : usage.monthRemaining}
                        </TableCell>
                        <TableCell>
                          {usage?.termLimit == null
                            ? NOT_APPLICABLE
                            : usage.termRemaining}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="text-app-caption text-ink-sub">{USAGE_CAPTION}</p>
            </Block>
            <Notice tone="Info">{LOG_NOTICE}</Notice>
            {flagError && (
              <Notice tone="Danger">특이학생 지정을 바꾸지 못했어요</Notice>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!detail || flagging}
            onClick={() => void toggleFlag()}
            className="mr-auto h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary disabled:opacity-40"
          >
            {flagged ? "특이학생 해제" : "특이학생으로 지정"}
          </Button>
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
            disabled={!detail}
            onClick={() =>
              navigate(`${CONSOLE_BASE}/coaching?studentId=${studentId}`)
            }
            className="h-10 rounded-lg px-5 text-app-label font-semibold disabled:opacity-40"
          >
            개인종합코칭으로
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
