import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/http/client";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { studentSearchQueryOptions } from "@/pages/admin/shared/studentSearch";
import { SERVICE_PROGRAMS } from "./serviceSettings";
import {
  denyReasonLabel,
  dirtyKey,
  type OverrideEdit,
  overridePayloads,
  resetPayloads,
  validateOverrideEdits,
} from "./studentUsage";
import {
  type StudentUsage,
  type UsageRow,
  useSaveStudentUsage,
  useStudentUsage,
} from "./studentUsageQueries";

// ---------------------------------------------------------------------------
// 스쿨멘토 서비스이용횟수조정(사 #166, 결정 r5, r6, 102.11). 위닝 이용권 화면 대신 기관 이용 한도를 본다.
// 사용 상태와 조정 모두 서버 경로(student-usage)로 읽고 쓴다. 변경자는 서버가 채우고,
// DELETE 권한이 없으므로 되돌리기는 두 한도를 null 로 쓴다.
// 고른 학생 모두에게 고친 서비스만 한 배열로 보낸다. 보던 학생은 주소(?student=)에 둔다.
// ---------------------------------------------------------------------------

const SAVE_ERROR = "저장하지 못했어요. 권한을 확인해 주세요.";
const SEARCH_ERROR = "학생 조회에 실패했습니다.";
const INPUT_CLASS = "h-9 w-24";

const textOf = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

function editsFrom(usage: StudentUsage): Record<string, OverrideEdit> {
  return Object.fromEntries(
    usage.programs.map((program) => [
      program.programKey,
      {
        monthly: textOf(program.override?.monthlyLimit),
        term: textOf(program.override?.termLimit),
      },
    ]),
  );
}

// 변경자(updated_by)는 서버가 채우므로 보내지 않는다.
const withoutActor = (rows: ReturnType<typeof resetPayloads>): UsageRow[] =>
  rows.map(({ updated_by: _actor, ...row }) => row);

export default function StudentUsageAdmin() {
  const [term, setTerm] = useState("");
  const [submittedTerm, setSubmittedTerm] = useState("");
  const studentSearch = useQuery(
    studentSearchQueryOptions("serviceCreditAdjust", submittedTerm),
  );
  const students = studentSearch.data?.items ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewedId = searchParams.get("student");
  const usageQuery = useStudentUsage(viewedId);
  const usage = usageQuery.data ?? null;
  const saveUsage = useSaveStudentUsage();
  const [edits, setEdits] = useState<Record<string, OverrideEdit>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const busy = saveUsage.isPending;

  // 현황이 새로 오면(처음, 다른 학생, 저장 뒤 다시 읽기) 입력 칸을 서버 값으로 맞춘다.
  useEffect(() => {
    if (!usage) return;
    setEdits(editsFrom(usage));
    setDirty(new Set());
  }, [usage]);

  // 보는 학생은 저장 대상에 들어간다. 주소로 바로 열어도 같다.
  useEffect(() => {
    if (!viewedId) return;
    setSelected((prev) =>
      prev.includes(viewedId) ? prev : [...prev, viewedId],
    );
  }, [viewedId]);

  // 검색 결과는 useQuery 가 들고 있고, 검색을 누를 때마다 선택과 보던 학생을 비운다.
  function search() {
    setMessage("");
    setSubmittedTerm(term);
    setSelected([]);
    setSearchParams({});
  }

  function view(profileId: string) {
    setMessage("");
    setSearchParams({ student: profileId });
  }

  function toggleSelected(profileId: string, checked: boolean) {
    setSelected((prev) =>
      checked
        ? [...prev, profileId]
        : prev.filter((current) => current !== profileId),
    );
  }

  function edit(programKey: string, field: keyof OverrideEdit, value: string) {
    setEdits((prev) => ({
      ...prev,
      [programKey]: {
        monthly: prev[programKey]?.monthly ?? "",
        term: prev[programKey]?.term ?? "",
        [field]: value,
      },
    }));
    setDirty((prev) => new Set(prev).add(dirtyKey(programKey, field)));
  }

  async function write(rows: UsageRow[]) {
    if (busy) return;
    setMessage("");
    try {
      await saveUsage.mutateAsync(rows);
      setMessage("저장했어요.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.detail : SAVE_ERROR);
    }
  }

  function save() {
    const invalid = validateOverrideEdits(edits, dirty);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    void write(withoutActor(overridePayloads(selected, edits, dirty, "")));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">
        서비스이용횟수조정
      </h1>

      <div className="flex items-end gap-2 bg-white p-4 shadow-sm">
        <div className="flex-1">
          <Field label="학생 검색">
            <TextInput
              value={term}
              onChange={setTerm}
              placeholder="이름이나 이메일"
            />
          </Field>
        </div>
        <ActionButton onClick={search}>검색</ActionButton>
      </div>

      {students.length > 0 && (
        <ul className="bg-white p-4 shadow-sm">
          {students.map((student) => (
            <li key={student.id} className="flex items-center gap-3 py-1">
              <input
                type="checkbox"
                aria-label={`${student.name ?? student.email} 선택`}
                checked={selected.includes(student.id)}
                onChange={(e) => toggleSelected(student.id, e.target.checked)}
              />
              <span className="text-sm font-medium">
                {student.name ?? "-"}
                <span className="ml-2 text-xs text-gray-500">
                  {student.email}
                </span>
              </span>
              <ActionButton variant="light" onClick={() => view(student.id)}>
                {`${student.name ?? student.email} 보기`}
              </ActionButton>
            </li>
          ))}
        </ul>
      )}

      {usage && (
        <div className="space-y-3 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            {usage.tenant?.name ?? "기관 없음"}
          </p>
          <p className="text-xs font-medium text-gray-500">
            비워 두면 기관 설정을 따라요. 고친 서비스만 저장해요.
          </p>
          {usage.programs.map((program) => {
            const label =
              SERVICE_PROGRAMS.find((p) => p.key === program.programKey)
                ?.label ?? program.programKey;
            const current = edits[program.programKey];
            return (
              <div
                key={program.programKey}
                data-testid="usage-row"
                data-program={program.programKey}
                className="border-t border-gray-200 pt-3"
              >
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs font-medium text-gray-600">
                  {`이번 달 사용 ${program.monthUsed} / 남은 ${program.monthRemaining ?? "무제한"}`}
                  {" / "}
                  {`학기 사용 ${program.termUsed} / 남은 ${program.termRemaining ?? "무제한"}`}
                </p>
                {!program.allowed && (
                  <p className="text-xs font-medium text-red-600">
                    {denyReasonLabel(program.denyReason)}
                  </p>
                )}
                <div className="mt-2 flex gap-3">
                  <Input
                    inputMode="numeric"
                    aria-label={`${label} 월 조정`}
                    placeholder="기관 설정 따름"
                    value={current?.monthly ?? ""}
                    onChange={(e) =>
                      edit(program.programKey, "monthly", e.target.value)
                    }
                    className={INPUT_CLASS}
                  />
                  <Input
                    inputMode="numeric"
                    aria-label={`${label} 학기 조정`}
                    placeholder="기관 설정 따름"
                    value={current?.term ?? ""}
                    onChange={(e) =>
                      edit(program.programKey, "term", e.target.value)
                    }
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || dirty.size === 0 || selected.length === 0}
              className="inline-flex h-9 items-center bg-primary px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {`선택한 ${selected.length}명에게 저장`}
            </button>
            <ActionButton
              variant="light"
              disabled={busy || selected.length === 0}
              onClick={() => write(withoutActor(resetPayloads(selected, "")))}
            >
              기관 설정으로 되돌리기
            </ActionButton>
          </div>
        </div>
      )}

      {(message || usageQuery.error || studentSearch.error) && (
        <p className="text-sm font-medium text-gray-700">
          {message ||
            (usageQuery.error
              ? usageQuery.error instanceof ApiError
                ? usageQuery.error.detail
                : "사용 현황을 불러오지 못했어요."
              : studentSearch.error instanceof ApiError
                ? studentSearch.error.detail
                : SEARCH_ERROR)}
        </p>
      )}
    </div>
  );
}
