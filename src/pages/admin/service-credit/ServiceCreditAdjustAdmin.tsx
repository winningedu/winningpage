import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/http/client";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import { studentSearchQueryOptions } from "@/pages/admin/shared/studentSearch";
import {
  type AdjustInput,
  postServiceCreditAdjust,
  type ServiceCreditRow,
  type ServiceCreditSummary,
  serviceCreditKeys,
  serviceCreditSummaryQueryOptions,
} from "./api";
import { SERVICE_CREDIT_PATH } from "./paths";

const REASON_MIN_LENGTH = 2;
const SEARCH_ERROR = "학생 조회에 실패했습니다.";
const REQUEST_ERROR = "요청에 실패했습니다.";

const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.detail : fallback;

function formatDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ko-KR");
}

function formatCount(value: number | null) {
  return value === null ? "무제한" : String(value);
}

function formatExpiry(row: ServiceCreditRow) {
  if (row.liveCount > 0 && row.expiresAt === null) return "무기한";
  return formatDate(row.expiresAt);
}

/** 입력값을 요청 본문으로 바꾼다. 잘못된 입력이면 안내 문구를 돌려준다. */
function buildBody(
  row: ServiceCreditRow,
  profileId: string,
  form: { delta: string; months: string; reason: string },
): { ok: true; body: AdjustInput } | { ok: false; message: string } {
  const reason = form.reason.trim();
  if (reason.length < REASON_MIN_LENGTH)
    return {
      ok: false,
      message: `사유를 ${REASON_MIN_LENGTH}자 이상 입력해 주세요.`,
    };

  const monthsText = form.months.trim();
  const months = /^\d+$/.test(monthsText) ? Number(monthsText) : Number.NaN;
  const monthsValid = Number.isInteger(months) && months >= 1;

  if (row.periodBased) {
    if (!monthsValid)
      return {
        ok: false,
        message: "기간은 1 이상의 정수(개월)로 입력해 주세요.",
      };
    return {
      ok: true,
      body: { profileId, programKey: row.programKey, delta: 1, months, reason },
    };
  }

  const deltaText = form.delta.trim();
  const delta = /^[+-]?\d+$/.test(deltaText) ? Number(deltaText) : 0;
  if (delta === 0)
    return { ok: false, message: "조정 횟수는 0이 아닌 정수로 입력해 주세요." };
  if (monthsText && !monthsValid)
    return {
      ok: false,
      message: "기간은 1 이상의 정수(개월)로 입력해 주세요.",
    };
  if (monthsText && delta < 0)
    return { ok: false, message: "차감에는 기간을 줄 수 없습니다." };

  return {
    ok: true,
    body: {
      profileId,
      programKey: row.programKey,
      delta,
      ...(monthsText ? { months } : {}),
      reason,
    },
  };
}

function AdjustForm({
  row,
  profileId,
  onApplied,
}: {
  row: ServiceCreditRow;
  profileId: string;
  onApplied: (credit: ServiceCreditRow) => void;
}) {
  const [delta, setDelta] = useState("");
  const [months, setMonths] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<AdjustInput | null>(null);
  const adjust = useMutation({ mutationFn: postServiceCreditAdjust });
  const busy = adjust.isPending;
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const showMonths = row.periodBased || /^\+?[1-9]\d*$/.test(delta.trim());

  function review() {
    const built = buildBody(row, profileId, { delta, months, reason });
    setSuccess(false);
    if (!built.ok) {
      setMessage(built.message);
      return;
    }
    setMessage("");
    setPending(built.body);
  }

  async function apply() {
    if (!pending || busy) return;
    const body = pending;
    let credit: ServiceCreditRow;
    try {
      credit = await adjust.mutateAsync(body);
    } catch (error) {
      setPending(null);
      setSuccess(false);
      setMessage(errorText(error, REQUEST_ERROR));
      return;
    }
    setPending(null);
    onApplied(credit);
    setDelta("");
    setMonths("");
    setReason("");
    setSuccess(true);
    setMessage(`적용했습니다. 잔여 ${formatCount(credit.quotaRemaining)}`);
  }

  return (
    <div className="space-y-2">
      {pending ? (
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span>
            {row.periodBased
              ? `${pending.months}개월 이용권을 추가합니다.`
              : `${pending.delta > 0 ? "+" : ""}${pending.delta}회를 ${
                  pending.delta > 0 ? "추가" : "차감"
                }합니다.`}{" "}
            사유: {pending.reason}
          </span>
          <ActionButton onClick={apply} disabled={busy}>
            확인
          </ActionButton>
          <ActionButton
            variant="light"
            onClick={() => setPending(null)}
            disabled={busy}
          >
            취소
          </ActionButton>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          {!row.periodBased && (
            <div className="w-[6rem]">
              <Field label="조정 횟수">
                <TextInput
                  value={delta}
                  onChange={setDelta}
                  placeholder="+2, -1"
                />
              </Field>
            </div>
          )}
          {showMonths && (
            <div className="w-[7rem]">
              <Field
                label={row.periodBased ? "기간(개월)" : "기간(개월, 선택)"}
              >
                <TextInput value={months} onChange={setMonths} />
              </Field>
            </div>
          )}
          <div className="w-[12rem]">
            <Field label="사유">
              <TextInput value={reason} onChange={setReason} />
            </Field>
          </div>
          <ActionButton onClick={review}>적용</ActionButton>
        </div>
      )}
      {message && (
        <p
          className={`text-xs font-medium ${success ? "text-green-700" : "text-red-600"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

interface Props {
  config: { title: string; [key: string]: unknown };
}

// 섹션 라우트가 serviceCreditAdjust/* 라 아래 Routes 가 나머지 경로를 맡는다.
// 검색 화면과 학생 화면은 같은 화면이라 선택 주소(:studentId?)로 한 번에 묶어 검색 입력이 유지된다.
export default function ServiceCreditAdjustAdmin({ config }: Props) {
  return (
    <Routes>
      <Route
        path=":studentId?"
        element={<ServiceCreditScreen title={config.title} />}
      />
      <Route path="*" element={<Navigate to={SERVICE_CREDIT_PATH} replace />} />
    </Routes>
  );
}

function ServiceCreditScreen({ title }: { title: string }) {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const submitted = searchParams.get("q") ?? "";
  const [term, setTerm] = useState(submitted);
  const studentSearch = useQuery(
    studentSearchQueryOptions("serviceCreditAdjust", submitted),
  );
  const results = studentSearch.data?.items ?? null;

  function pick(id: string) {
    navigate({
      pathname: `${SERVICE_CREDIT_PATH}/${encodeURIComponent(id)}`,
      search: searchParams.toString(),
    });
  }

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mb-4 mt-2 rounded-sm border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          이 메뉴에서 적용한 조정은 학생의 서비스 이용횟수에 즉시 반영됩니다.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = term.trim();
            setSearchParams(trimmed ? { q: trimmed } : {});
          }}
        >
          <div className="w-[18rem]">
            <Field label="학생 검색">
              <TextInput
                value={term}
                onChange={setTerm}
                placeholder="이름 또는 이메일"
              />
            </Field>
          </div>
          <ActionButton type="submit">검색</ActionButton>
        </form>

        {results && (
          <ul className="mt-4 max-h-[14rem] divide-y divide-gray-200 overflow-auto border border-gray-200">
            {results.length === 0 && (
              <li className="px-3 py-2 text-sm font-medium text-gray-500">
                검색 결과가 없습니다.
              </li>
            )}
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => pick(s.id)}
                  className={`w-full px-3 py-2 text-left text-sm font-medium hover:bg-gray-50 ${
                    studentId === s.id ? "bg-muted" : ""
                  }`}
                >
                  {s.name || "(이름 없음)"} ({s.email || "-"})
                  {s.isAdmin && (
                    <span className="ml-2 bg-muted px-1.5 py-0.5 text-xs font-semibold">
                      관리자
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {studentSearch.error && (
        <div
          role="alert"
          className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
        >
          {errorText(studentSearch.error, SEARCH_ERROR)}
        </div>
      )}

      {studentId && <StudentCredits studentId={studentId} />}
    </div>
  );
}

function StudentCredits({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const summary = useQuery(serviceCreditSummaryQueryOptions(studentId));

  // 조정 응답의 행만 캐시에 끼워 넣어 현황 전체를 다시 읽지 않는다.
  function replaceRow(credit: ServiceCreditRow) {
    queryClient.setQueryData<ServiceCreditSummary>(
      serviceCreditKeys.summary(studentId),
      (prev) =>
        prev && {
          ...prev,
          items: prev.items.map((r) =>
            r.programKey === credit.programKey ? credit : r,
          ),
        },
    );
  }

  if (summary.error) {
    return (
      <div
        role="alert"
        className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
      >
        {errorText(summary.error, REQUEST_ERROR)}
      </div>
    );
  }
  if (!summary.data) {
    return (
      <div className="bg-white px-6 py-5 shadow-sm">
        <AdminTableSkeleton
          columns={6}
          rows={4}
          label="서비스 이용횟수를 불러오는 중"
        />
      </div>
    );
  }

  const { student, items } = summary.data;
  return (
    <div className="bg-white px-6 py-5 shadow-sm">
      <h2 className="text-base font-semibold">
        {student.name || "(이름 없음)"} 님의 서비스 이용횟수
      </h2>
      <p className="mb-3 text-sm font-medium text-gray-500">
        {student.email || "-"}
      </p>
      {items.length > 0 && (
        <Table className="border-collapse">
          <TableHeader>
            <TableRow className="border-b border-gray-300 hover:bg-transparent">
              {["서비스", "총", "사용", "잔여", "만료", "조정"].map((label) => (
                <TableHead
                  key={label}
                  scope="col"
                  className="whitespace-normal py-2 text-xs font-semibold text-muted-foreground"
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow
                key={row.programKey}
                className="border-b border-gray-200 align-top"
              >
                <TableCell className="whitespace-normal py-3 font-semibold">
                  {row.label}
                </TableCell>
                <TableCell className="py-3">
                  {formatCount(row.quotaTotal)}
                </TableCell>
                <TableCell className="py-3">{row.quotaUsed}</TableCell>
                <TableCell className="py-3">
                  {formatCount(row.quotaRemaining)}
                </TableCell>
                <TableCell className="py-3">{formatExpiry(row)}</TableCell>
                <TableCell className="whitespace-normal py-3">
                  <AdjustForm
                    row={row}
                    profileId={student.id}
                    onApplied={replaceRow}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
