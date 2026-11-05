// W16 교사 계정 관리. 교사 콘솔 /teacher/teachers/accounts. 담임은 셸(ConsoleLayout)이 막는다.
// 계정이 있는 교사만 학교 전체 관리자 먼저, 이어서 학년과 반 순으로 보인다(교 #126). 비밀번호는 가림 표시다.
// 신규 발급은 휴대폰에서 감춘다(결정 8). 최근 로그인 열은 읽을 수 있는 값이 서버에 없어 그리지 않는다.

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
import { consoleRequest, errorCode, errorMessage } from "../api";
import Chip from "../Chip";
import EmptyMessage from "../EmptyMessage";
import LoadMore from "../LoadMore";
import Notice from "../Notice";
import PageHeader from "../PageHeader";
import Pagination from "../Pagination";
import { HISTORY_KEY, usePagedList } from "../student-history/usePagedList";
import { usePageParam } from "../student-history/usePageParam";
import AssignDialog from "./AssignDialog";
import IssueDialog from "./IssueDialog";
import IssuedPanel from "./IssuedPanel";
import type { IssuedRow } from "./issuedFile";
import { type AccountItem, classText } from "./roster";
import TeacherDialog from "./TeacherDialog";

const PAGE_SIZE = 50;
const SELF_MESSAGE = "본인 계정은 비활성화할 수 없어요";
const FAILED_MESSAGE = "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요";

const roleLabel = (t: AccountItem) =>
  t.role === "school_admin" ? "학교 전체 관리자" : "담임교사";

/** "2학년 3반(주) + 2학년 5반". 학교 전체 관리자는 전교다. */
function scopeText(t: AccountItem): string {
  if (t.role === "school_admin") return "전교";
  return t.classes
    .map((c) => `${classText(c)}${c.isPrimary ? "(주)" : ""}`)
    .join(" + ");
}

export default function TeacherAccountsPage() {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const [page, setPage] = usePageParam();
  const list = usePagedList<AccountItem>(
    "/api/console/teachers/accounts",
    {},
    page,
    mobile,
  );
  const [error, setError] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [reissued, setReissued] = useState<IssuedRow[] | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["console", "teachers"] });
  };

  const toggleStatus = async (t: AccountItem) => {
    setError(null);
    const res = await consoleRequest("/api/console/teachers/status", {
      method: "POST",
      body: {
        teacherId: t.id,
        status: t.status === "active" ? "inactive" : "active",
      },
    });
    if (res.status === 200) {
      refresh();
      return;
    }
    setError(
      errorCode(res.body) === "SELF_CHANGE"
        ? SELF_MESSAGE
        : (errorMessage(res.body) ?? FAILED_MESSAGE),
    );
  };

  const reissue = async (t: AccountItem) => {
    setError(null);
    const res = await consoleRequest("/api/console/teachers/reissue", {
      method: "POST",
      body: { teacherId: t.id },
    });
    const temp = (res.body as { tempPassword?: string } | null)?.tempPassword;
    if (res.status !== 200 || !temp) {
      setError(errorMessage(res.body) ?? FAILED_MESSAGE);
      return;
    }
    const first = t.classes[0];
    setReissued([
      {
        name: t.name,
        phoneLast4: t.phoneLast4,
        grade: first ? `${first.grade.slice(1)}학년` : "",
        className: first ? `${first.name}반` : "",
        loginId: t.loginId,
        tempPassword: temp,
      },
    ]);
    refresh();
  };

  const assignTarget = list.data?.items.find((t) => t.id === assignId);
  const small =
    "h-8 rounded-lg bg-surface-muted px-3 text-app-label font-semibold text-ink-strong hover:bg-surface-muted";
  const statusChip = (t: AccountItem) => (
    <Chip tone={t.status === "active" ? "Info" : "Neutral"}>
      {t.status === "active" ? "활성" : "비활성"}
    </Chip>
  );

  return (
    <>
      <PageHeader
        title="교사 계정 관리"
        subtitle="담임교사와 학교 전체 관리자의 로그인 아이디를 발급하고 관리합니다"
        actions={
          mobile ? undefined : (
            <Button
              type="button"
              onClick={() => setIssuing(true)}
              className="h-10 rounded-lg px-5 text-app-label font-semibold"
            >
              신규 계정 발급
            </Button>
          )
        }
        notice="신규 계정 발급은 PC나 태블릿에서 할 수 있어요"
      />
      <div className="flex max-w-content flex-col gap-4 px-4 pb-24 md:px-8 lg:px-12">
        {error && <Notice tone="Danger">{error}</Notice>}
        {list.isError && (
          <Notice tone="Danger">교사 계정 목록을 불러오지 못했어요</Notice>
        )}
        {list.data && (
          <section className="flex flex-col">
            <h2 className="pb-4 text-app-card-title font-bold text-ink-strong">
              {`교사 계정 ${list.data.total}개`}
            </h2>
            {mobile ? (
              <div className="flex flex-col">
                {list.data.items.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-2 border-b border-line py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex flex-col">
                        <span className="text-app-label font-semibold text-ink-strong">
                          {t.name}
                        </span>
                        <span className="text-app-caption text-ink-sub">
                          {roleLabel(t)}
                        </span>
                      </span>
                      {statusChip(t)}
                    </div>
                    <span className="text-app-label text-ink">
                      {scopeText(t)}
                    </span>
                    <span className="text-app-label text-ink">{t.loginId}</span>
                    <span className="text-app-label text-ink-sub">••••••</span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => void toggleStatus(t)}
                        className="h-11 flex-1 rounded-lg bg-surface-muted text-app-label font-semibold text-ink-strong hover:bg-surface-muted"
                      >
                        {t.status === "active" ? "비활성화" : "활성화"}
                      </Button>
                      {t.role === "homeroom" && (
                        <Button
                          type="button"
                          onClick={() => setAssignId(t.id)}
                          className="h-11 flex-1 rounded-lg bg-surface-muted text-app-label font-semibold text-ink-strong hover:bg-surface-muted"
                        >
                          담당 변경/추가
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>구분</TableHead>
                    <TableHead>담당</TableHead>
                    <TableHead>아이디</TableHead>
                    <TableHead>비밀번호</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{roleLabel(t)}</TableCell>
                      <TableCell>{scopeText(t)}</TableCell>
                      <TableCell>{t.loginId}</TableCell>
                      <TableCell className="text-ink-sub">••••••</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {statusChip(t)}
                          <Button
                            type="button"
                            onClick={() => void toggleStatus(t)}
                            className={small}
                          >
                            {t.status === "active" ? "비활성화" : "활성화"}
                          </Button>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex gap-2">
                          {t.role === "homeroom" && (
                            <Button
                              type="button"
                              onClick={() => setAssignId(t.id)}
                              className={small}
                            >
                              담당 변경/추가
                            </Button>
                          )}
                          {!t.passwordSet && (
                            <Button
                              type="button"
                              onClick={() => void reissue(t)}
                              className={small}
                            >
                              임시 비밀번호 재발급
                            </Button>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {list.data.items.length === 0 && (
              <EmptyMessage body="발급된 교사 계정이 없어요" />
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
      {assignTarget && (
        <AssignDialog
          teacher={assignTarget}
          onChanged={refresh}
          onClose={() => setAssignId(null)}
        />
      )}
      {issuing && (
        <IssueDialog onIssued={refresh} onClose={() => setIssuing(false)} />
      )}
      {reissued && (
        <TeacherDialog
          title="임시 비밀번호를 다시 발급했어요"
          onClose={() => setReissued(null)}
        >
          <IssuedPanel rows={reissued} onClose={() => setReissued(null)} />
        </TeacherDialog>
      )}
    </>
  );
}
