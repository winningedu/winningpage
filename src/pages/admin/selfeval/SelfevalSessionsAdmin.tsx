import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/http/client";
import AdminPagination from "@/pages/admin/shared/AdminPagination";
import { AdminTableFrame } from "@/pages/admin/shared/AdminTableFrame";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import {
  type StudentSearchItem,
  studentSearchQueryOptions,
} from "@/pages/admin/shared/studentSearch";
import {
  postSelfevalGrant,
  postSelfevalRecover,
  selfevalDetailQueryOptions,
  selfevalKeys,
  selfevalListQueryOptions,
} from "./api";
import {
  buildGrantBody,
  type GrantFormValues,
  validateGrantForm,
} from "./grantForm";
import { SELFEVAL_PATH } from "./paths";
import {
  parseSelfevalSessionsQuery,
  patchSelfevalSessionsParams,
} from "./query";
import {
  areaLabel,
  canRecover,
  ledgerLabel,
  SELFEVAL_STATUS_OPTIONS,
  statusLabel,
  stepLabel,
  terminalLabel,
} from "./row";

const REQUEST_ERROR = "요청에 실패했습니다.";
const SEARCH_ERROR = "학생 조회에 실패했습니다.";

const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.detail : fallback;

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR");
}

interface Props {
  config: { title: string; [key: string]: unknown };
}

// 섹션 라우트가 selfevalSessions/* 라 아래 Routes 가 나머지 경로를 맡는다.
// 목록과 상세는 같은 화면이라 선택 주소(:id?)로 묶어, 상세를 열고 닫아도 목록이 그대로 남는다.
export default function SelfevalSessionsAdmin({ config }: Props) {
  return (
    <Routes>
      <Route
        path=":id?"
        element={<SelfevalSessionsScreen title={config.title} />}
      />
      <Route path="*" element={<Navigate to={SELFEVAL_PATH} replace />} />
    </Routes>
  );
}

function SelfevalSessionsScreen({ title }: { title: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  // 상세로 갈 때 목록 조건(search)을 달고 가서 닫을 때 그대로 돌려준다.
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const query = parseSelfevalSessionsQuery(searchParams);
  const [draft, setDraft] = useState(query.q);
  const [grantOpen, setGrantOpen] = useState(false);

  // 뒤로가기로 q 가 바뀌면 입력칸도 맞춘다.
  useEffect(() => {
    setDraft(query.q);
  }, [query.q]);

  const list = useQuery(selfevalListQueryOptions(query));
  const data = list.data;
  const error = list.error ? errorText(list.error, REQUEST_ERROR) : "";

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / query.pageSize));

  const openDetail = (rowId: string) =>
    navigate({
      pathname: `${SELFEVAL_PATH}/${encodeURIComponent(rowId)}`,
      search,
    });
  const closeDetail = () => navigate({ pathname: SELFEVAL_PATH, search });

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setSearchParams((prev) =>
                patchSelfevalSessionsParams(prev, { q: draft.trim() }),
              );
            }}
          >
            <div className="w-[10rem]">
              <Field label="상태">
                <Select
                  value={query.status}
                  onChange={(status) =>
                    setSearchParams((prev) =>
                      patchSelfevalSessionsParams(prev, { status }),
                    )
                  }
                >
                  <option value="">전체</option>
                  {SELFEVAL_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-[15rem]">
              <Field label="검색어">
                <TextInput
                  value={draft}
                  onChange={setDraft}
                  placeholder="이름, 이메일 또는 과목"
                />
              </Field>
            </div>
            <ActionButton type="submit">조회</ActionButton>
          </form>
          <ActionButton onClick={() => setGrantOpen(true)}>
            이용권 부여
          </ActionButton>
        </div>
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
        >
          {error}
        </div>
      )}

      {list.isPending ? (
        <div className="bg-white p-6 shadow-sm">
          <AdminTableSkeleton columns={11} label="세션 목록을 불러오는 중" />
        </div>
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="mb-4 text-sm font-medium text-gray-500">
            전체 <span className="text-blue-600">{total}</span>건
          </div>
          <AdminTableFrame
            label={title}
            className="min-w-[72rem] border-collapse"
          >
            <TableHeader>
              <TableRow className="border-y border-gray-300 hover:bg-transparent">
                {[
                  "학생",
                  "이메일",
                  "상태",
                  "단계",
                  "영역",
                  "과목 또는 활동",
                  "학년도 학기",
                  "재생성",
                  "마지막 활동",
                  "차감",
                  "종결 사유",
                ].map((label) => (
                  <TableHead
                    key={label}
                    scope="col"
                    className="whitespace-normal px-3 py-3 text-left font-semibold"
                  >
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data || data.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="py-12 text-center text-muted-foreground"
                  >
                    조회된 세션이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => openDetail(row.id)}
                    className="cursor-pointer border-b border-gray-100"
                  >
                    <TableCell className="whitespace-normal px-3 py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetail(row.id);
                        }}
                        className="text-left font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {row.studentName ?? "-"}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {row.email ?? "-"}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {statusLabel(row.status)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {stepLabel(row.currentStep)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {areaLabel(row.area)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {row.subject ?? row.activityName ?? "-"}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {row.academicYear
                        ? `${row.academicYear}년 ${row.semester ?? "-"}학기`
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {row.regenerateCount}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {formatDate(row.lastActivityAt)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {ledgerLabel(row)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {terminalLabel(row.terminal)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </AdminTableFrame>

          <AdminPagination
            page={query.page}
            totalPages={lastPage}
            onPageChange={(page) =>
              setSearchParams((prev) =>
                patchSelfevalSessionsParams(prev, { page }),
              )
            }
          />
        </div>
      )}

      <SessionDetailDialog
        key={id ?? "none"}
        id={id ?? null}
        onClose={closeDetail}
        onRecovered={() => {
          queryClient.invalidateQueries({ queryKey: selfevalKeys.lists() });
          closeDetail();
        }}
      />
      <GrantDialog open={grantOpen} onClose={() => setGrantOpen(false)} />
    </div>
  );
}

function SessionDetailDialog({
  id,
  onClose,
  onRecovered,
}: {
  id: string | null;
  onClose: () => void;
  onRecovered: () => void;
}) {
  const detailQuery = useQuery({
    ...selfevalDetailQueryOptions(id ?? ""),
    enabled: id !== null,
  });
  const recover = useMutation({ mutationFn: postSelfevalRecover });
  const busy = recover.isPending;
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  const detail = detailQuery.data;
  const shownMessage =
    message ||
    (detailQuery.error ? errorText(detailQuery.error, REQUEST_ERROR) : "");

  async function doRecover() {
    if (!id || busy) return;
    setMessage("");
    try {
      await recover.mutateAsync(id);
    } catch (error) {
      setMessage(errorText(error, REQUEST_ERROR));
      return;
    }
    onRecovered();
  }

  const alert = shownMessage && (
    <div
      role="alert"
      className="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
    >
      {shownMessage}
    </div>
  );

  return (
    <Dialog
      open={id !== null}
      disablePointerDismissal
      onOpenChange={(open, eventDetails) => {
        if (open) return;
        // 복구 요청이 나간 뒤에 닫으면 결과를 보지 못한 채 복구가 끝난다. 진행 중에는 모든 닫기를 막는다.
        if (busy) {
          eventDetails.cancel();
          return;
        }
        onClose();
      }}
    >
      <DialogContent className="sm:max-w-[34rem]">
        {id !== null &&
          (detail ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detail.studentName ?? "-"} (
                  {statusLabel(detail.session.status)})
                </DialogTitle>
                <DialogDescription>{detail.email ?? "-"}</DialogDescription>
              </DialogHeader>

              <div className="text-sm">
                <span className="font-semibold text-gray-500">세션 </span>
                {detail.session.id} / {stepLabel(detail.session.current_step)} /
                차감{" "}
                {ledgerLabel({
                  ledgerId: detail.session.ledger_id,
                  ledgerReversedAt: detail.session.ledger_reversed_at,
                })}
              </div>

              <ul className="divide-y divide-gray-100 border border-gray-200 text-sm">
                {detail.progress.map((p) => (
                  <li
                    key={p.step}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="font-medium">{p.label}</span>
                    <span className="text-gray-500">
                      {p.status}, 시도 {p.attempts}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="text-sm">
                <span className="font-semibold text-gray-500">종결 </span>
                {terminalLabel(detail.terminal)}
                {detail.terminal ? ` (${formatDate(detail.terminal.at)})` : ""}
              </div>

              <div className="text-sm">
                <span className="font-semibold text-gray-500">선택 활동 </span>
                {detail.activities.length === 0
                  ? "없음"
                  : detail.activities
                      .map(
                        (a) =>
                          `${a.role === "core" ? "핵심" : "보조"} ${a.activityRecordId.slice(0, 8)}`,
                      )
                      .join(", ")}
              </div>

              <div className="text-sm">
                <span className="font-semibold text-gray-500">리포트 </span>
                {detail.reports.length === 0
                  ? "없음"
                  : detail.reports
                      .map(
                        (r) =>
                          `${r.type} r${r.revision}${r.score === null ? "" : ` (${r.score}점)`}`,
                      )
                      .join(", ")}
              </div>

              {alert}

              {canRecover({
                status: detail.session.status,
                terminal: detail.terminal,
              }) &&
                (confirming ? (
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>새 세션을 만들어 복구합니다. 진행할까요?</span>
                    <ActionButton onClick={doRecover} disabled={busy}>
                      {busy ? "처리 중..." : "확인"}
                    </ActionButton>
                    <ActionButton
                      variant="light"
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                    >
                      취소
                    </ActionButton>
                  </div>
                ) : (
                  <div>
                    <ActionButton
                      variant="danger"
                      onClick={() => setConfirming(true)}
                    >
                      실패 세션 복구
                    </ActionButton>
                  </div>
                ))}
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>세션 상세</DialogTitle>
              </DialogHeader>
              {alert || (
                <AdminDetailSkeleton rows={4} label="세션 상세를 불러오는 중" />
              )}
            </>
          ))}
      </DialogContent>
    </Dialog>
  );
}

function GrantDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [userQuery, setUserQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [student, setStudent] = useState<StudentSearchItem | null>(null);
  const [sessionQuota, setSessionQuota] = useState("");
  const [months, setMonths] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [message, setMessage] = useState("");
  const [resultText, setResultText] = useState("");
  const studentSearch = useQuery(
    studentSearchQueryOptions("selfevalSessions", submittedQuery),
  );
  const grant = useMutation({ mutationFn: postSelfevalGrant });
  const busy = grant.isPending;

  // 검색어가 비어 있으면 요청하지 않아 결과도 없다(null). 실패하면 빈 목록으로 보인다.
  const results =
    studentSearch.data?.items ?? (studentSearch.error ? [] : null);
  const shownMessage =
    message ||
    (studentSearch.error ? errorText(studentSearch.error, SEARCH_ERROR) : "");

  useEffect(() => {
    if (open) return;
    setUserQuery("");
    setSubmittedQuery("");
    setStudent(null);
    setSessionQuota("");
    setMonths("");
    setEndsAt("");
    setMessage("");
    setResultText("");
    grant.reset();
  }, [open, grant.reset]);

  async function submit() {
    if (busy) return;
    const values: GrantFormValues = {
      profileId: student?.id ?? "",
      sessionQuota,
      months,
      endsAt,
    };
    const invalid = validateGrantForm(values);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setMessage("");
    try {
      const result = await grant.mutateAsync(buildGrantBody(values));
      setResultText(JSON.stringify(result.quota));
    } catch (error) {
      setMessage(errorText(error, REQUEST_ERROR));
    }
  }

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next, eventDetails) => {
        if (next) return;
        // 부여 요청이 나간 뒤에 닫으면 결과를 보지 못한 채 부여가 끝난다. 진행 중에는 모든 닫기를 막는다.
        // eventDetails.cancel(): Base UI onOpenChange 취소 API (SensitiveActionGate 와 같은 방식)
        if (busy) {
          eventDetails.cancel();
          return;
        }
        onClose();
      }}
    >
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>이용권 부여</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="학생 검색">
              <TextInput
                value={userQuery}
                onChange={setUserQuery}
                placeholder="이메일 또는 이름"
              />
            </Field>
          </div>
          <ActionButton onClick={() => setSubmittedQuery(userQuery)}>
            검색
          </ActionButton>
        </div>

        {results && (
          <ul className="max-h-[10rem] overflow-y-auto border border-gray-200 text-sm">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-muted-foreground">
                검색 결과가 없습니다.
              </li>
            ) : (
              results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setStudent(r)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50"
                  >
                    {r.name ?? "-"} / {r.email ?? "-"}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        <div className="text-sm font-medium">
          선택된 학생:{" "}
          {student
            ? `${student.name ?? "-"} (${student.email ?? "-"})`
            : "없음"}
        </div>

        <div className="flex gap-3">
          <Field label="회차 수">
            <TextInput value={sessionQuota} onChange={setSessionQuota} />
          </Field>
          <Field label="기간(개월)">
            <TextInput value={months} onChange={setMonths} />
          </Field>
          <Field label="종료일(YYYY-MM-DD)">
            <TextInput value={endsAt} onChange={setEndsAt} />
          </Field>
        </div>

        {shownMessage && (
          <div
            role="alert"
            className="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
          >
            {shownMessage}
          </div>
        )}
        {resultText && (
          <div className="border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            부여했습니다. quota: {resultText}
          </div>
        )}

        <div className="flex gap-2">
          <ActionButton onClick={submit} disabled={busy}>
            {busy ? "처리 중..." : "부여"}
          </ActionButton>
          <ActionButton variant="light" onClick={onClose} disabled={busy}>
            닫기
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
