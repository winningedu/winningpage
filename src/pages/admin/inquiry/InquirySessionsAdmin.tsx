import { useCallback, useEffect, useReducer, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import {
  ActionButton,
  Field,
  Select,
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  buildGrantBody,
  type InquiryGrantFormValues,
  validateGrantForm,
} from "./inquiryGrantForm";
import {
  fetchInquirySessions,
  type InquirySessionsPage,
  postInquiryGrant,
  postInquiryRecover,
} from "./inquirySessionsApi";
import {
  buildInquirySessionsSearch,
  inquirySessionsQueryReducer,
  initialInquirySessionsQuery,
} from "./inquirySessionsQuery";
import {
  canRecover,
  INQUIRY_STATUS_OPTIONS,
  type InquirySessionItem,
  ledgerLabel,
  modeRows,
  statusLabel,
  stepLabel,
  terminalLabel,
} from "./inquirySessionsRow";

const STUDENT_SEARCH_LIMIT = 20;

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR");
}

type StudentRow = { id: string; name: string | null; email: string | null };

interface Props {
  config: { title: string; [key: string]: unknown };
}

export default function InquirySessionsAdmin({ config }: Props) {
  const [query, dispatch] = useReducer(
    inquirySessionsQueryReducer,
    initialInquirySessionsQuery,
  );
  const [data, setData] = useState<InquirySessionsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<InquirySessionItem | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const search = buildInquirySessionsSearch(query);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await fetchInquirySessions(search);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      setData(null);
      return;
    }
    setData(result.data);
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / query.pageSize));

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: "submit" });
            }}
          >
            <div className="w-[10rem]">
              <Field label="상태">
                <Select
                  value={query.status}
                  onChange={(status) => dispatch({ type: "setStatus", status })}
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
                  value={query.draft}
                  onChange={(draft) => dispatch({ type: "setDraft", draft })}
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
        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
      </div>

      {error && (
        <div className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="mb-4 text-sm font-bold text-gray-500">
            전체 <span className="text-blue-600">{total}</span>건
          </div>
          <ScrollArea axis="x">
            <table className="w-full min-w-[64rem] border-collapse text-sm">
              <thead>
                <tr className="border-y border-gray-300">
                  <th className="px-3 py-3 text-left">학생</th>
                  <th className="px-3 py-3 text-left">이메일</th>
                  <th className="px-3 py-3 text-left">상태</th>
                  <th className="px-3 py-3 text-left">단계</th>
                  <th className="px-3 py-3 text-left">과목</th>
                  <th className="px-3 py-3 text-left">주제</th>
                  <th className="px-3 py-3 text-left">최근 활동</th>
                  <th className="px-3 py-3 text-left">차감</th>
                  <th className="px-3 py-3 text-left">종결 사유</th>
                </tr>
              </thead>
              <tbody>
                {!data || data.items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-400">
                      조회된 세션이 없습니다.
                    </td>
                  </tr>
                ) : (
                  data.items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row)}
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-3 font-bold">
                        {row.studentName ?? "-"}
                      </td>
                      <td className="px-3 py-3">{row.email ?? "-"}</td>
                      <td className="px-3 py-3">{statusLabel(row.status)}</td>
                      <td className="px-3 py-3">
                        {stepLabel(row.currentStep)}
                      </td>
                      <td className="px-3 py-3">{row.subject}</td>
                      <td className="px-3 py-3">{row.topicTitle ?? "-"}</td>
                      <td className="px-3 py-3">
                        {formatDate(row.lastActivityAt)}
                      </td>
                      <td className="px-3 py-3">{ledgerLabel(row)}</td>
                      <td className="px-3 py-3">
                        {terminalLabel(row.terminal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>

          <div className="mt-4 flex items-center justify-center gap-3 text-sm font-bold">
            <ActionButton
              variant="light"
              disabled={query.page <= 1}
              onClick={() =>
                dispatch({ type: "setPage", page: query.page - 1 })
              }
            >
              이전
            </ActionButton>
            <span>
              {query.page} / {lastPage}
            </span>
            <ActionButton
              variant="light"
              disabled={query.page >= lastPage}
              onClick={() =>
                dispatch({ type: "setPage", page: query.page + 1 })
              }
            >
              다음
            </ActionButton>
          </div>
        </div>
      )}

      <SessionDetailDialog
        key={selected?.id ?? "none"}
        row={selected}
        onClose={() => setSelected(null)}
        onRecovered={() => {
          setSelected(null);
          load();
        }}
      />
      <GrantDialog open={grantOpen} onClose={() => setGrantOpen(false)} />
    </div>
  );
}

function SessionDetailDialog({
  row,
  onClose,
  onRecovered,
}: {
  row: InquirySessionItem | null;
  onClose: () => void;
  onRecovered: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function recover() {
    if (!row || busy) return;
    setBusy(true);
    setMessage("");
    const result = await postInquiryRecover(row.id);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    onRecovered();
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[32rem]">
        {row && (
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
                    <span className="font-bold">{m.label}</span>
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
              <span className="font-black text-gray-500">종결 </span>
              {terminalLabel(row.terminal)}
              {row.terminal ? ` (${formatDate(row.terminal.at)})` : ""}
            </div>

            {message && (
              <div className="border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
                {message}
              </div>
            )}

            {canRecover(row) &&
              (confirming ? (
                <div className="flex items-center gap-2 text-sm font-bold">
                  <span>
                    새 세션을 만들어 복구합니다. 주제 추천부터 다시 시작합니다.
                    진행할까요?
                  </span>
                  <ActionButton onClick={recover} disabled={busy}>
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
  const [userQuery, setUserQuery] = useState("");
  const [results, setResults] = useState<StudentRow[] | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [sessionQuota, setSessionQuota] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resultText, setResultText] = useState("");

  useEffect(() => {
    if (open) return;
    setUserQuery("");
    setResults(null);
    setStudent(null);
    setSessionQuota("");
    setUnlimited(false);
    setStartsOn("");
    setEndsOn("");
    setMessage("");
    setResultText("");
  }, [open]);

  async function searchStudents() {
    // PostgREST or 필터는 콤마와 괄호로 절을 구분하므로 검색어에서 걷어낸다.
    const q = userQuery.trim().replace(/[,()*"\\]/g, "");
    if (!q) {
      setResults(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email")
      .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(STUDENT_SEARCH_LIMIT);
    if (error) {
      console.error(error);
      setMessage("학생 조회에 실패했습니다.");
      setResults([]);
      return;
    }
    setResults(data || []);
  }

  async function submit() {
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
      setMessage(invalid);
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await postInquiryGrant(buildGrantBody(values));
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setResultText(JSON.stringify(result.data.quota));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
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
          <ActionButton onClick={searchStudents}>검색</ActionButton>
        </div>

        {results && (
          <ul className="max-h-[10rem] overflow-y-auto border border-gray-200 text-sm">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-gray-400">검색 결과가 없습니다.</li>
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

        <div className="text-sm font-bold">
          선택된 학생:{" "}
          {student
            ? `${student.name ?? "-"} (${student.email ?? "-"})`
            : "없음"}
        </div>

        <div className="flex items-end gap-3">
          <Field label="세션 수">
            {unlimited ? (
              <div className="flex h-10 items-center text-sm font-bold text-gray-500">
                무제한
              </div>
            ) : (
              <TextInput value={sessionQuota} onChange={setSessionQuota} />
            )}
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm font-bold">
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
          <div className="border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
            {message}
          </div>
        )}
        {resultText && (
          <div className="border border-green-300 bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
            부여했습니다. quota: {resultText}
          </div>
        )}

        <div className="flex gap-2">
          <ActionButton onClick={submit} disabled={busy}>
            {busy ? "처리 중..." : "부여"}
          </ActionButton>
          <ActionButton variant="light" onClick={onClose}>
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
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full border border-gray-300 px-3 text-sm font-bold outline-hidden focus:border-[#B88737]"
    />
  );
}
