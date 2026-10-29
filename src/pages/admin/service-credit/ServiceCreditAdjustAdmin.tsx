import { useState } from "react";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import {
  type AdjustBody,
  fetchServiceCredits,
  postServiceCreditAdjust,
  type ServiceCreditRow,
  type StudentRow,
  searchStudents,
} from "./api";

const REASON_MIN_LENGTH = 2;

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
): { ok: true; body: AdjustBody } | { ok: false; message: string } {
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
  const [pending, setPending] = useState<AdjustBody | null>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    const result = await postServiceCreditAdjust(pending);
    setBusy(false);
    setPending(null);
    if (!result.ok) {
      setSuccess(false);
      setMessage(result.message);
      return;
    }
    onApplied(result.data.credit);
    setDelta("");
    setMonths("");
    setReason("");
    setSuccess(true);
    setMessage(
      `적용했습니다. 잔여 ${formatCount(result.data.credit.quotaRemaining)}`,
    );
  }

  return (
    <div className="space-y-2">
      {pending ? (
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
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
          className={`text-xs font-bold ${success ? "text-green-700" : "text-red-600"}`}
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

export default function ServiceCreditAdjustAdmin({ config }: Props) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<StudentRow[] | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [rows, setRows] = useState<ServiceCreditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    setError("");
    const result = await searchStudents(term);
    if (!result.ok) {
      setError(result.message);
      setResults([]);
      return;
    }
    setResults(result.data);
  }

  async function select(picked: StudentRow) {
    setStudent(picked);
    setRows([]);
    setError("");
    setLoading(true);
    const result = await fetchServiceCredits(picked.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRows(result.data);
  }

  function replaceRow(credit: ServiceCreditRow) {
    setRows((prev) =>
      prev.map((r) => (r.programKey === credit.programKey ? credit : r)),
    );
  }

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <h1 className="text-xl font-black">{config.title}</h1>
        <p className="mb-4 mt-2 rounded-sm border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          이 메뉴에서 적용한 조정은 학생의 서비스 이용횟수에 즉시 반영됩니다.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            search();
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
              <li className="px-3 py-2 text-sm font-bold text-gray-500">
                검색 결과가 없습니다.
              </li>
            )}
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => select(s)}
                  className={`w-full px-3 py-2 text-left text-sm font-bold hover:bg-gray-50 ${
                    student?.id === s.id ? "bg-[#F6EFE2]" : ""
                  }`}
                >
                  {s.name || "(이름 없음)"} ({s.email || "-"})
                  {s.isAdmin && (
                    <span className="ml-2 bg-[#F6EFE2] px-1.5 py-0.5 text-xs font-black">
                      관리자
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </div>
      )}

      {student && (
        <div className="bg-white px-6 py-5 shadow-sm">
          <h2 className="mb-3 text-base font-black">
            {student.name || "(이름 없음)"} 님의 서비스 이용횟수
          </h2>
          {loading ? (
            <p className="text-sm font-bold text-gray-500">불러오는 중...</p>
          ) : (
            rows.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-xs font-black text-gray-500">
                    <th className="py-2">서비스</th>
                    <th className="py-2">총</th>
                    <th className="py-2">사용</th>
                    <th className="py-2">잔여</th>
                    <th className="py-2">만료</th>
                    <th className="py-2">조정</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.programKey}
                      className="border-b border-gray-200 align-top"
                    >
                      <td className="py-3 font-black">{row.label}</td>
                      <td className="py-3">{formatCount(row.quotaTotal)}</td>
                      <td className="py-3">{row.quotaUsed}</td>
                      <td className="py-3">
                        {formatCount(row.quotaRemaining)}
                      </td>
                      <td className="py-3">{formatExpiry(row)}</td>
                      <td className="py-3">
                        <AdjustForm
                          row={row}
                          profileId={student.id}
                          onApplied={replaceRow}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      )}
    </div>
  );
}
