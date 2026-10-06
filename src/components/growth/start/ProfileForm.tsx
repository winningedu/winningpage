import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GRADES,
  MAX_UNIVERSITIES,
  type ProfileFormState,
  type ProfileSavePayload,
  type ProfileValues,
  SCHOOL_TYPES,
  SEMESTERS,
  schoolTypeLabel,
  toFormState,
  validateProfileForm,
} from "./startLogic";

// 슬롯 번호는 고정이라 순서가 바뀌지 않는다.
const UNIVERSITY_SLOTS = Array.from({ length: MAX_UNIVERSITIES }, (_, i) => i);
const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-app-label text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const INPUT = "h-9 text-app-label md:text-app-label";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-app-label font-medium text-ink-sub">
        {label}
      </label>
      {children}
    </div>
  );
}

type ProfileFormProps = {
  values: ProfileValues;
  saving: boolean;
  /** 이미 저장된 정보가 있어 되돌아갈 수 있을 때만 넘긴다. */
  onCancel?: () => void;
  onSubmit: (payload: ProfileSavePayload) => void;
};

export default function ProfileForm({
  values,
  saving,
  onCancel,
  onSubmit,
}: ProfileFormProps) {
  const base = useId();
  const [form, setForm] = useState<ProfileFormState>(() => toFormState(values));
  const [error, setError] = useState<string | null>(null);
  const id = (name: string) => `${base}-${name}`;
  const set = (patch: Partial<ProfileFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  function submit() {
    const result = validateProfileForm(form, new Date().getFullYear());
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    onSubmit(result.value);
  }

  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="grid grid-cols-2 gap-4">
        <Field id={id("type")} label="학교 유형">
          <select
            id={id("type")}
            className={SELECT}
            value={form.schoolType}
            onChange={(e) => set({ schoolType: e.target.value })}
          >
            <option value="">선택하세요</option>
            {SCHOOL_TYPES.map((t) => (
              <option key={t} value={t}>
                {schoolTypeLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("year")} label="고등학교 입학 연도">
          <Input
            id={id("year")}
            className={INPUT}
            inputMode="numeric"
            maxLength={4}
            placeholder="예: 2025"
            value={form.admissionYear}
            onChange={(e) => set({ admissionYear: e.target.value })}
          />
        </Field>
        <Field id={id("grade")} label="현재 학년">
          <select
            id={id("grade")}
            className={SELECT}
            value={form.grade}
            onChange={(e) => set({ grade: e.target.value })}
          >
            <option value="">선택하세요</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("semester")} label="학기">
          <select
            id={id("semester")}
            className={SELECT}
            value={form.semester}
            onChange={(e) => set({ semester: e.target.value })}
          >
            <option value="">선택하세요</option>
            {SEMESTERS.map((s) => (
              <option key={s} value={String(s)}>
                {s}학기
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="-mt-2 text-app-caption text-ink-sub">
        입학 연도로 등급 체계(5등급제 또는 9등급제)를 정해요.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <Field id={id("career")} label="희망 진로">
          <Input
            id={id("career")}
            className={INPUT}
            value={form.career}
            onChange={(e) => set({ career: e.target.value })}
          />
        </Field>
        <Field id={id("dept")} label="희망 학과">
          <Input
            id={id("dept")}
            className={INPUT}
            value={form.department}
            onChange={(e) => set({ department: e.target.value })}
          />
        </Field>
        {UNIVERSITY_SLOTS.map((i) => (
          <Field key={i} id={id(`univ${i}`)} label={`희망 대학 ${i + 1}`}>
            <Input
              id={id(`univ${i}`)}
              className={INPUT}
              value={form.universities[i] ?? ""}
              onChange={(e) => {
                const next = [...form.universities];
                next[i] = e.target.value;
                set({ universities: next });
              }}
            />
          </Field>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-app-label text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-9 px-4 text-app-label"
            disabled={saving}
            onClick={onCancel}
          >
            취소
          </Button>
        )}
        <Button
          type="submit"
          size="lg"
          className="h-9 px-4 text-app-label font-semibold"
          disabled={saving}
        >
          저장
        </Button>
      </div>
    </form>
  );
}
