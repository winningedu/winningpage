// W14 교사 정보 입력관리. 교사 콘솔 /teacher/teachers. 담임은 셸(ConsoleLayout)이 막는다.
// 담당 학급마다 한 줄이고 같은 선생님은 같은 아이디로 나온다(교 #222). 휴대폰(768 미만)은 계정 생성, 삭제, 발급을 감춘다(결정 8).

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
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
import Chip from "../Chip";
import { gradeLabel } from "../classLabel";
import EmptyMessage from "../EmptyMessage";
import FilterSelect from "../FilterSelect";
import LoadMore from "../LoadMore";
import { CONSOLE_BASE } from "../menu";
import Notice from "../Notice";
import PageHeader from "../PageHeader";
import Pagination from "../Pagination";
import { gradesOf, useClasses } from "../useClasses";
import { useGroupOptions } from "../useGroups";
import { CONSOLE_LIST_KEY, usePagedList } from "../usePagedList";
import { usePageParam } from "../usePageParam";
import BulkDeleteDialog from "./BulkDeleteDialog";
import ConnectPreviewPanel from "./ConnectPreviewPanel";
import DeleteDialog from "./DeleteDialog";
import EditNameDialog from "./EditNameDialog";
import IssueDialog from "./IssueDialog";
import RegisterChoiceDialog from "./RegisterChoiceDialog";
import RegisterDialog from "./RegisterDialog";
import { gradeGroupLabel, type RosterRow, type TeacherSummary } from "./roster";

const PAGE_SIZE = 50;
const ALL = { value: "", label: "전체" };

function LoginCell({
  row,
  onIssue,
}: {
  row: RosterRow;
  /** 휴대폰에서는 발급 버튼이 없다(결정 8). */
  onIssue?: (teacherId: string) => void;
}) {
  if (!row.teacher) return <span className="text-ink-sub">-</span>;
  if (row.accountStatus === "unissued") {
    const teacherId = row.teacher.id;
    return (
      <span className="flex items-center gap-2">
        <span className="text-ink-sub">미발급</span>
        {onIssue && (
          <Button
            type="button"
            onClick={() => onIssue(teacherId)}
            className="h-8 rounded-lg bg-surface-muted px-3 text-app-label font-semibold text-ink-strong hover:bg-surface-muted"
          >
            발급
          </Button>
        )}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{row.loginId}</span>
      <Chip tone={row.accountStatus === "active" ? "Info" : "Neutral"}>
        {row.accountStatus === "active" ? "활성" : "비활성"}
      </Chip>
      {row.classCount > 1 && (
        <span className="text-app-caption text-ink-sub">{`공통, ${row.classCount}개 반`}</span>
      )}
    </span>
  );
}

type DialogState =
  | { kind: "choice" }
  | { kind: "register" }
  | { kind: "bulk" }
  | { kind: "edit" | "delete"; teacherId: string }
  | { kind: "issue"; teacherId?: string };

export default function TeacherRosterPage() {
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = usePageParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = {
    grade: searchParams.get("grade") ?? "",
    groupId: searchParams.get("groupId") ?? "",
  };
  const classes = useClasses();
  const groups = useGroupOptions(classes.data ?? [], filters.grade);
  const list = usePagedList<RosterRow, { teachers: TeacherSummary[] }>(
    "/api/console/teachers/list",
    filters,
    page,
    mobile,
  );
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const setFilter = (patch: Partial<typeof filters>) =>
    setSearchParams(
      Object.fromEntries(
        Object.entries({ ...filters, ...patch }).filter(([, v]) => v),
      ),
    );
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: CONSOLE_LIST_KEY });
    void queryClient.invalidateQueries({ queryKey: ["console", "teachers"] });
  };
  const closeAndRefresh = () => {
    setDialog(null);
    refresh();
  };
  const teachers = list.data?.teachers ?? [];
  const target =
    dialog && "teacherId" in dialog && dialog.teacherId
      ? teachers.find((t) => t.id === dialog.teacherId)
      : undefined;
  const grayButton =
    "h-10 rounded-lg bg-surface-muted px-4 text-app-label font-semibold text-ink-strong hover:bg-surface-muted";
  const smallButton =
    "h-8 rounded-lg bg-surface-muted px-3 text-app-label font-semibold text-ink-strong hover:bg-surface-muted";

  return (
    <>
      <PageHeader
        title="교사 정보 입력관리"
        subtitle="선생님 이름, 학년그룹, 반을 등록해 학생 가입 때 학급 매칭에 사용합니다"
        notice="교사 등록, 삭제, 계정 발급은 PC나 태블릿에서 할 수 있어요"
      />
      <div className="flex max-w-content flex-col px-4 pb-24 md:px-8 lg:px-12">
        <div className="flex flex-wrap items-center gap-2.5 pb-6">
          {classes.data && (
            <>
              <FilterSelect
                label="학년그룹"
                value={filters.grade}
                options={[
                  ALL,
                  ...gradesOf(classes.data).map((g) => ({
                    value: g,
                    label: gradeLabel(g),
                  })),
                ]}
                onChange={(grade) => setFilter({ grade, groupId: "" })}
              />
              <FilterSelect
                label="그룹"
                value={filters.groupId}
                options={[
                  ALL,
                  ...groups.map((g) => ({
                    value: g.id,
                    label: g.name,
                  })),
                ]}
                onChange={(groupId) => setFilter({ groupId })}
              />
            </>
          )}
          <div className="flex flex-wrap gap-2 md:ml-auto">
            <Button
              type="button"
              aria-pressed={previewOpen}
              onClick={() => setPreviewOpen((open) => !open)}
              className={grayButton}
            >
              학생 가입 연결 미리보기
            </Button>
            {!mobile && (
              <>
                <Button
                  type="button"
                  onClick={() => setDialog({ kind: "bulk" })}
                  className={grayButton}
                >
                  선생님 삭제하기
                </Button>
                <Button
                  type="button"
                  onClick={() => setDialog({ kind: "choice" })}
                  className="h-10 rounded-lg px-4 text-app-label font-semibold"
                >
                  계정 생성하기
                </Button>
              </>
            )}
          </div>
        </div>
        {previewOpen && <ConnectPreviewPanel />}
        {list.isError && (
          <Notice tone="Danger">
            교사 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
          </Notice>
        )}
        {list.data && (
          <section className="flex flex-col">
            <h2 className="pb-4 text-app-card-title font-bold text-ink-strong">
              {`총 ${list.data.total}개 학급`}
            </h2>
            {mobile ? (
              <div className="flex flex-col">
                {list.data.items.map((item) => (
                  <div
                    key={item.classId ?? item.teacher?.id}
                    className="flex flex-col gap-2 border-b border-line py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-app-label font-semibold text-ink-strong">
                        {item.teacher?.name ?? "(미등록)"}
                      </span>
                      <LoginCell row={item} />
                    </div>
                    <span className="text-app-caption text-ink-sub">
                      {`${gradeGroupLabel(item.grade, item.groupName)} ${item.className ? `${item.className}반` : ""}`}
                    </span>
                    {item.teacher && (
                      <Button
                        type="button"
                        onClick={() =>
                          setDialog({
                            kind: "edit",
                            teacherId: (item.teacher as { id: string }).id,
                          })
                        }
                        className="h-11 w-full rounded-lg bg-surface-muted text-app-label font-semibold text-ink-strong hover:bg-surface-muted"
                      >
                        수정
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학년그룹</TableHead>
                    <TableHead>반</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead className="text-right">재학생 수</TableHead>
                    <TableHead>로그인 계정</TableHead>
                    <TableHead className="text-right">수정/삭제</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((item) => (
                    <TableRow key={item.classId ?? item.teacher?.id}>
                      <TableCell>
                        {gradeGroupLabel(item.grade, item.groupName)}
                      </TableCell>
                      <TableCell>
                        {item.className ? `${item.className}반` : "-"}
                      </TableCell>
                      <TableCell>
                        {item.teacher ? (
                          item.teacher.name
                        ) : (
                          <span className="text-ink-sub">(미등록)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.classId ? item.activeStudents : "-"}
                      </TableCell>
                      <TableCell>
                        <LoginCell
                          row={item}
                          onIssue={(teacherId) =>
                            setDialog({ kind: "issue", teacherId })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {item.teacher && (
                          <span className="flex justify-end gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                setDialog({
                                  kind: "edit",
                                  teacherId: (item.teacher as { id: string })
                                    .id,
                                })
                              }
                              className={smallButton}
                            >
                              수정
                            </Button>
                            <Button
                              type="button"
                              onClick={() =>
                                setDialog({
                                  kind: "delete",
                                  teacherId: (item.teacher as { id: string })
                                    .id,
                                })
                              }
                              className={smallButton}
                            >
                              삭제
                            </Button>
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {list.data.items.length === 0 && (
              <EmptyMessage body="등록된 선생님이 없어요" />
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
          </section>
        )}
      </div>
      {dialog?.kind === "choice" && (
        <RegisterChoiceDialog
          onBulk={() => navigate(`${CONSOLE_BASE}/teachers/excel`)}
          onSingle={() => setDialog({ kind: "register" })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "register" && (
        <RegisterDialog
          existing={teachers}
          onDone={refresh}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "edit" && target && (
        <EditNameDialog
          teacher={target}
          onSaved={closeAndRefresh}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete" && target && (
        <DeleteDialog
          teacher={target}
          onDeleted={closeAndRefresh}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "bulk" && (
        <BulkDeleteDialog
          teachers={teachers}
          onDeleted={closeAndRefresh}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "issue" && (
        <IssueDialog
          {...(dialog.teacherId ? { teacherId: dialog.teacherId } : {})}
          onIssued={refresh}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
