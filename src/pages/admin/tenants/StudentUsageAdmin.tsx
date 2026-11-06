import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  type StudentRow,
  searchStudents,
} from "@/pages/admin/service-credit/api";
import {
  ActionButton,
  Field,
  TextInput,
} from "@/pages/admin/shared/formFields";
import { fetchStudentUsage, type StudentUsage } from "./api";
import { SERVICE_PROGRAMS } from "./serviceSettings";
import {
  denyReasonLabel,
  type OverrideEdit,
  overridePayloads,
  resetPayloads,
  validateOverrideEdits,
} from "./studentUsage";

// ---------------------------------------------------------------------------
// 스쿨멘토 서비스이용횟수조정(사 #166, 결정 r5, r6, 102.11). 위닝 이용권 화면 대신 기관 이용 한도를 본다.
// 사용 상태는 서버 경로(student-usage), 조정은 브라우저 세션(RLS)으로 upsert 한다. 변경 이력 트리거가
// auth.uid() 로 변경자를 남기고 DELETE 권한이 없으므로 되돌리기는 두 한도를 null 로 쓴다.
// 고른 학생 모두에게 고친 서비스만 한 배열로 보낸다.
// ---------------------------------------------------------------------------

const SAVE_ERROR = "저장하지 못했어요. 권한을 확인해 주세요.";
const INPUT_CLASS = "h-9 w-24 border border-gray-300 px-2 text-sm font-bold";

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

export default function StudentUsageAdmin() {
  const [term, setTerm] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [usage, setUsage] = useState<StudentUsage | null>(null);
  const [edits, setEdits] = useState<Record<string, OverrideEdit>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    const result = await searchStudents(term);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage("");
    setStudents(result.data);
  }

  async function view(profileId: string) {
    setMessage("");
    const result = await fetchStudentUsage(profileId);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setViewedId(profileId);
    setSelected([profileId]);
    setUsage(result.data);
    setEdits(editsFrom(result.data));
    setDirty(new Set());
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
    setDirty((prev) => new Set(prev).add(programKey));
  }

  async function write(
    build: (userId: string) => ReturnType<typeof resetPayloads>,
  ) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      setBusy(false);
      setMessage(SAVE_ERROR);
      return;
    }
    const { error } = await supabase
      .from("student_usage_overrides")
      .upsert(build(userId), { onConflict: "profile_id,program_key" });
    setBusy(false);
    if (error) {
      setMessage(SAVE_ERROR);
      return;
    }
    setMessage("저장했어요.");
    if (viewedId) await refresh(viewedId);
  }

  async function refresh(profileId: string) {
    const result = await fetchStudentUsage(profileId);
    if (!result.ok) return;
    setUsage(result.data);
    setEdits(editsFrom(result.data));
    setDirty(new Set());
  }

  function save() {
    const invalid = validateOverrideEdits(edits, dirty);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    void write((userId) => overridePayloads(selected, edits, dirty, userId));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-[#111827]">서비스이용횟수조정</h1>

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
              <span className="text-sm font-bold">
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
          <p className="text-sm font-black text-[#111827]">
            {usage.tenant?.name ?? "소속 기관 없음"}
          </p>
          <p className="text-xs font-bold text-gray-500">
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
                <p className="text-sm font-black">{label}</p>
                <p className="text-xs font-bold text-gray-600">
                  {`이번 달 사용 ${program.monthUsed} / 남은 ${program.monthRemaining ?? "무제한"}`}
                  {" / "}
                  {`학기 사용 ${program.termUsed} / 남은 ${program.termRemaining ?? "무제한"}`}
                </p>
                {!program.allowed && (
                  <p className="text-xs font-bold text-red-600">
                    {denyReasonLabel(program.denyReason)}
                  </p>
                )}
                <div className="mt-2 flex gap-3">
                  <input
                    inputMode="numeric"
                    aria-label={`${label} 월 조정`}
                    placeholder="기관 설정 따름"
                    value={current?.monthly ?? ""}
                    onChange={(e) =>
                      edit(program.programKey, "monthly", e.target.value)
                    }
                    className={INPUT_CLASS}
                  />
                  <input
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
              className="inline-flex h-9 items-center bg-[#0D1B2A] px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {`선택한 ${selected.length}명에게 저장`}
            </button>
            <ActionButton
              variant="light"
              disabled={busy || selected.length === 0}
              onClick={() => write((userId) => resetPayloads(selected, userId))}
            >
              기관 설정으로 되돌리기
            </ActionButton>
          </div>
        </div>
      )}

      {message && <p className="text-sm font-bold text-gray-700">{message}</p>}
    </div>
  );
}
