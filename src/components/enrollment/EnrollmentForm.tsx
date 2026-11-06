import { type FormEvent, useId, useState } from "react";
import {
  type EnrollmentEndpoint,
  SUBMIT_FAILED,
  submitEnrollment,
} from "./api";

// 학적 학년 값(student_enrollments.grade CHECK, api/_lib/console/enrollmentInput.ts 와 같다).
const GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"];

const FIELD_CLASS =
  "h-13 w-full rounded-xl border border-line px-4 text-base text-ink outline-hidden focus:border-primary";

type EnrollmentFormProps = {
  endpoint: EnrollmentEndpoint;
  /** 기관 유형. 그룹 칸은 학교가 아닌 기관(학원 등)에서만 보인다(결정 77). */
  orgType: string | null;
  initialGrade: string | null;
  submitLabel: string;
  onDone: () => void;
};

export default function EnrollmentForm({
  endpoint,
  orgType,
  initialGrade,
  submitLabel,
  onDone,
}: EnrollmentFormProps) {
  const base = useId();
  const [grade, setGrade] = useState(initialGrade ?? "");
  const [groupName, setGroupName] = useState("");
  const [className, setClassName] = useState("");
  const [number, setNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!grade || !className.trim() || !number.trim()) {
      setErrorMsg("학년, 반, 번호를 모두 입력해 주세요.");
      return;
    }
    if (!/^\d+$/.test(number.trim())) {
      setErrorMsg("번호는 숫자로 입력해 주세요.");
      return;
    }
    setErrorMsg("");
    setSaving(true);
    try {
      const result = await submitEnrollment(endpoint, {
        grade,
        ...(groupName.trim() && { groupName: groupName.trim() }),
        className: className.trim(),
        number: Number(number.trim()),
      });
      if (result.ok) onDone();
      else setErrorMsg(result.message);
    } catch {
      setErrorMsg(SUBMIT_FAILED);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor={`${base}-grade`} className="text-sm text-ink">
        학년
      </label>
      <select
        id={`${base}-grade`}
        value={grade}
        onChange={(e) => setGrade(e.target.value)}
        className={FIELD_CLASS}
      >
        <option value="">선택</option>
        {GRADES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      {orgType !== "학교" && (
        <>
          <label htmlFor={`${base}-group`} className="text-sm text-ink">
            그룹(선택)
          </label>
          <input
            id={`${base}-group`}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className={FIELD_CLASS}
          />
        </>
      )}
      <label htmlFor={`${base}-class`} className="text-sm text-ink">
        반
      </label>
      <input
        id={`${base}-class`}
        value={className}
        onChange={(e) => setClassName(e.target.value)}
        className={FIELD_CLASS}
      />
      <label htmlFor={`${base}-number`} className="text-sm text-ink">
        번호
      </label>
      <input
        id={`${base}-number`}
        inputMode="numeric"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        className={FIELD_CLASS}
      />
      {errorMsg && (
        <p role="alert" className="text-[0.8125rem] text-error">
          {errorMsg}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="h-13 rounded-xl bg-primary text-base font-semibold text-white disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
