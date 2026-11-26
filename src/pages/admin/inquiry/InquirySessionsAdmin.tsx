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
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  fetchInquirySession,
  fetchInquirySessions,
  inquiryErrorText,
  inquirySessionKeys,
  postInquiryGrant,
  postInquiryRecover,
} from "./api";
import {
  buildGrantBody,
  type InquiryGrantFormValues,
  validateGrantForm,
} from "./grantForm";
import { INQUIRY_SESSIONS_PATH } from "./paths";
import {
  parseInquirySessionsParams,
  patchInquirySessionsParams,
} from "./query";
import {
  canRecover,
  INQUIRY_STATUS_OPTIONS,
  type InquirySessionItem,
  ledgerLabel,
  modeRows,
  statusLabel,
  stepLabel,
  terminalLabel,
} from "./row";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR");
}

interface Props {
  config: { title: string; [key: string]: unknown };
}

// 섹션 라우트가 inquirySessions/* 라 아래 Routes 가 나머지 경로를 맡는다. 목록과 상세는 같은 화면이라
// :id 가 있든 없든 한 엘리먼트로 그려 목록이 다시 마운트되지 않는다.
export default function InquirySessionsAdmin({ config }: Props) {
  return (
    <Routes>
      <Route path=":id?" element={<InquirySessionsScreen config={config} />} />
      <Route
        path="*"
        element={<Navigate to={INQUIRY_SESSIONS_PATH} replace />}
      />
    </Routes>
  );
}

function InquirySessionsScreen({ config }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = parseInquirySessionsParams(searchParams);
  // 입력 중인 검색어. 조회를 눌러야 주소에 반영된다.
  const [draft, setDraft] = useState(params.q);
  const [grantOpen, setGrantOpen] = useState(false);

  // 뒤로가기로 q 가 바뀌면 입력칸도 맞춘다.
  useEffect(() => setDraft(params.q), [params.q]);

  const listQuery = useQuery({
    queryKey: inquirySessionKeys.list(params),
    queryFn: ({ signal }) => fetchInquirySessions(params, signal),
  });
  const detailQuery = useQuery({
    queryKey: inquirySessionKeys.detail(id ?? ""),
    queryFn: ({ signal }) => fetchInquirySession(id ?? "", signal),
    enabled: id !== undefined,
  });

  const data = listQuery.data;
  const loading = listQuery.isPending;
  const error = listQuery.error ? inquiryErrorText(listQuery.error) : "";
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / params.pageSize));

  // 상세는 목록 조건을 달고 오가서 닫거나 뒤로 가면 같은 목록이 열린다.
  const openDetail = (sessionId: string) =>
    navigate({
      pathname: `${INQUIRY_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`,
      search,
    });
  const closeDetail = () =>
    navigate({ pathname: INQUIRY_SESSIONS_PATH, search });

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setSearchParams((prev) =>
                patchInquirySessionsParams(prev, { q: draft.trim() }),
              );
            }}
          >
            <div className="w-[10rem]">
              <Field label="상태">
                <Select
                  value={params.status}
                  onChange={(status) =>
                    setSearchParams((prev) =>
                      patchInquirySessionsParams(prev, { status }),
                    )
                  }
                >
                  <option value="">전체</option>
                  {INQUIRY_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
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
                  placeholder="이름 또는 이메일"
                />
              </Field>
            </div>
            <ActionButton type="submit">조회</ActionButton>
          </form>
          <ActionButton onClick={() => setGrantOpen(true)}>
            이용권 부여
          </ActionButton>
        </div>
        <h1 className="mt-4 text-xl font-semibold">{config.title}</h1>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white p-6 shadow-sm">
          <AdminTableSkeleton columns={9} label="세션 목록을 불러오는 중" />
        </div>
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="mb-4 text-sm font-medium text-gray-500">
            전체 <span className="text-blue-600">{total}</span>건
          </div>
          <AdminTableFrame
            label={config.title}
            className="min-w-[64rem] border-collapse"
          >
            <TableHeader>
              <TableRow className="border-y border-gray-300 hover:bg-transparent">
                {[
                  "학생",
                  "이메일",
                  "상태",
                  "단계",
                  "과목",
                  "주제",
                  "최근 활동",
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
                    colSpan={9}
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
                    <TableCell className="px-3 py-3">
                      {statusLabel(row.status)}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      {stepLabel(row.currentStep)}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {row.subject}
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3">
                      {row.topicTitle ?? "-"}
                    </TableCell>
                    <TableCell className="px-3 py-3">
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
            page={params.page}
            totalPages={lastPage}
            onPageChange={(page) =>
              setSearchParams((prev) =>
                patchInquirySessionsParams(prev, { page }),
              )
            }
          />
        </div>
      )}

      <SessionDetailDialog
        key={id ?? "none"}
        open={id !== undefined}
        row={detailQuery.data ?? null}
        loading={detailQuery.isPending}
        error={detailQuery.error ? inquiryErrorText(detailQuery.error) : ""}
        onClose={closeDetail}
      />
      <GrantDialog open={grantOpen} onClose={() => setGrantOpen(false)} />
    </div>
  );
}

function SessionDetailDialog({
  open,
  row,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  row: InquirySessionItem | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [confirming, setConfirming] = useState(false);
  const recover = useMutation({
    mutationFn: postInquiryRecover,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inquirySessionKeys.all });
      navigate({ pathname: INQUIRY_SESSIONS_PATH, search });
    },
  });
  const busy = recover.isPending;

  return (
    <Dialog
      open={open}
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
      <DialogContent className="sm:max-w-[32rem]">
        {!row ? (
          <>
            <DialogHeader>
              <DialogTitle>세션 상세</DialogTitle>
              <DialogDescription className="sr-only">
                심화탐구 세션 상세
              </DialogDescription>
            </DialogHeader>
            {loading ? (
              <AdminDetailSkeleton rows={4} label="세션 상세를 불러오는 중" />
            ) : (
              <div
                role="alert"
                className="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
              >
                {error}
              </div>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {row.studentName ?? "-"} ({statusLabel(row.status)})
              </DialogTitle>
              <DialogDescription>{row.email ?? "-"}</DialogDescription>
            </DialogHeader>

            <ul className="divide-y divide-gray-100 border border-gray-200 text-sm">
              {modeRows(row).map((m) => (
                <li key={m.mode} className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-gray-500">
                      {m.status}, 시도 {m.attempts}
                    </span>
                  </div>
                  {m.issues.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
                      {m.issues.map((issue, n) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: 이슈 문자열은 중복될 수 있고 목록은 정적이다.
                        <li key={n}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            <div className="text-sm">
              <span className="font-semibold text-gray-500">종결 </span>
              {terminalLabel(row.terminal)}
              {row.terminal ? ` (${formatDate(row.terminal.at)})` : ""}
            </div>

            {recover.error && (
              <div
                role="alert"
                className="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
              >
                {inquiryErrorText(recover.error)}
              </div>
            )}

            {canRecover(row) &&
              (confirming ? (
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>
                    새 세션을 만들어 복구합니다. 주제 추천부터 다시 시작합니다.
                    진행할까요?
                  </span>
                  <ActionButton
                    onClick={() => recover.mutate(row.id)}
                    disabled={busy}
                  >
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
        )}
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
  const queryClient = useQueryClient();
  const [userQuery, setUserQuery] = useState("");
  // 검색 버튼을 눌러 확정한 검색어. 입력 중에는 요청하지 않는다.
  const [term, setTerm] = useState("");
  const [student, setStudent] = useState<StudentSearchItem | null>(null);
  const [sessionQuota, setSessionQuota] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [resultText, setResultText] = useState("");
  const search = useQuery(studentSearchQueryOptions("inquirySessions", term));
  const grant = useMutation({
    mutationFn: postInquiryGrant,
    onSuccess: (result) => {
      setResultText(JSON.stringify(result.quota));
      void queryClient.invalidateQueries({ queryKey: inquirySessionKeys.all });
    },
  });
  const busy = grant.isPending;
  const results = search.isError ? [] : (search.data?.items ?? null);
  const message =
    formMessage ||
    (search.isError
      ? "학생 조회에 실패했습니다."
      : grant.error
        ? inquiryErrorText(grant.error)
        : "");

  useEffect(() => {
    if (open) return;
    setUserQuery("");
    setTerm("");
    setStudent(null);
    setSessionQuota("");
    setUnlimited(false);
    setStartsOn("");
    setEndsOn("");
    setFormMessage("");
    setResultText("");
    grant.reset();
  }, [open, grant.reset]);

  function submit() {
    if (busy) return;
    const values: InquiryGrantFormValues = {
      profileId: student?.id ?? "",
      sessionQuota,
      unlimited,
      startsOn,
      endsOn,
    };
    const invalid = validateGrantForm(values);
    if (invalid) {
      setFormMessage(invalid);
      return;
    }
    setFormMessage("");
    grant.mutate(buildGrantBody(values));
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
          <ActionButton
            onClick={() => {
              setFormMessage("");
              setTerm(userQuery);
            }}
          >
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

        <div className="flex items-end gap-3">
          <Field label="세션 수">
            {unlimited ? (
              <div className="flex h-10 items-center text-sm font-medium text-gray-500">
                무제한
              </div>
            ) : (
              <TextInput value={sessionQuota} onChange={setSessionQuota} />
            )}
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(e) => setUnlimited(e.target.checked)}
            />
            무제한
          </label>
        </div>
        <div className="flex gap-3">
          <Field label="시작일(비우면 지금)">
            <DateInput value={startsOn} onChange={setStartsOn} />
          </Field>
          <Field label="만료일(비우면 무기한)">
            <DateInput value={endsOn} onChange={setEndsOn} />
          </Field>
        </div>

        {message && (
          <div
            role="alert"
            className="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
          >
            {message}
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

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 font-medium"
    />
  );
}
