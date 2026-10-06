import { useId } from "react";
import { Input } from "@/components/ui/input";
import type { GradeLabel, Semester } from "@/lib/inquiry/types";
import type { InfoForm, InfoFormErrors } from "./infoLogic";
import {
  CARD,
  CARD_HINT,
  CARD_TITLE,
  FIELD_ERROR,
  FIELD_LABEL,
  INPUT_CLASS,
  PILL_OFF,
  PILL_ON,
  REQUIRED_BADGE,
} from "./styles";

const GRADES: GradeLabel[] = ["고1", "고2", "고3"];
const SEMESTERS: Semester[] = [1, 2];

type BasicInfoCardProps = {
  form: InfoForm;
  errors: InfoFormErrors;
  /** 서버가 학년별로 주는 안내(1, 3학년). 없으면 그리지 않는다. */
  gradeNote: string | null;
  disabled: boolean;
  onChange: (patch: Partial<InfoForm>) => void;
};

// 기본 정보 카드: 학년 3, 학기 2 pill, 희망 진로, 과목명(교과 고정, 과목명 필수 입력만). 학교 유형은 묻지 않는다.
export default function BasicInfoCard({
  form,
  errors,
  gradeNote,
  disabled,
  onChange,
}: BasicInfoCardProps) {
  const base = useId();
  const id = (name: string) => `${base}-${name}`;

  return (
    <section aria-labelledby={id("title")} className={CARD}>
      <h2 id={id("title")} className={CARD_TITLE}>
        기본 정보
      </h2>
      <p className={CARD_HINT}>
        학년과 진로는 주제의 난이도와 방향을 정하는 기준이에요.
      </p>

      <div className="mt-4 flex flex-wrap gap-x-12 gap-y-4">
        <fieldset className="min-w-0">
          <legend className={FIELD_LABEL}>학년</legend>
          <div className="mt-2 flex gap-2">
            {GRADES.map((grade) => (
              <PillRadio
                key={grade}
                name={id("grade")}
                label={grade}
                checked={form.gradeLabel === grade}
                disabled={disabled}
                onSelect={() => onChange({ gradeLabel: grade })}
              />
            ))}
          </div>
          {errors.gradeLabel && (
            <p role="alert" className={`mt-1 ${FIELD_ERROR}`}>
              {errors.gradeLabel}
            </p>
          )}
        </fieldset>

        <fieldset className="min-w-0">
          <legend className={FIELD_LABEL}>학기</legend>
          <div className="mt-2 flex gap-2">
            {SEMESTERS.map((semester) => (
              <PillRadio
                key={semester}
                name={id("semester")}
                label={`${semester}학기`}
                checked={form.semester === semester}
                disabled={disabled}
                onSelect={() => onChange({ semester })}
              />
            ))}
          </div>
          {errors.semester && (
            <p role="alert" className={`mt-1 ${FIELD_ERROR}`}>
              {errors.semester}
            </p>
          )}
        </fieldset>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={id("career")}
            className={`${FIELD_LABEL} flex items-center gap-2`}
          >
            희망 진로
            <span className={REQUIRED_BADGE}>필수</span>
          </label>
          <Input
            id={id("career")}
            className={INPUT_CLASS}
            value={form.career}
            disabled={disabled}
            aria-invalid={errors.career ? true : undefined}
            aria-describedby={errors.career ? id("career-error") : undefined}
            placeholder="예: 수의예과"
            onChange={(e) => onChange({ career: e.target.value })}
          />
          {errors.career && (
            <p id={id("career-error")} role="alert" className={FIELD_ERROR}>
              {errors.career}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={id("subject")}
            className={`${FIELD_LABEL} flex items-center gap-2`}
          >
            과목명
            <span className={REQUIRED_BADGE}>필수</span>
          </label>
          <Input
            id={id("subject")}
            className={INPUT_CLASS}
            value={form.subject}
            disabled={disabled}
            aria-invalid={errors.subject ? true : undefined}
            aria-describedby={`${id("subject-help")}${errors.subject ? ` ${id("subject-error")}` : ""}`}
            placeholder="예: 생명과학"
            onChange={(e) => onChange({ subject: e.target.value })}
          />
          <p id={id("subject-help")} className="text-app-caption text-ink-sub">
            교과군과 과목명이 다르면 교과군, 과목명으로 적어요. 예: 과학,
            고급생명과학
          </p>
          {errors.subject && (
            <p id={id("subject-error")} role="alert" className={FIELD_ERROR}>
              {errors.subject}
            </p>
          )}
        </div>
      </div>

      {gradeNote && (
        <p className="mt-4 rounded-lg bg-surface-04 px-4 py-3 text-app-label text-ink">
          {gradeNote}
        </p>
      )}
    </section>
  );
}

function PillRadio({
  name,
  label,
  checked,
  disabled,
  onSelect,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`${checked ? PILL_ON : PILL_OFF} cursor-pointer has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-50`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      {label}
    </label>
  );
}
