import { useId } from "react";
import { Input } from "@/components/ui/input";
import {
  AREA_LABELS,
  type Area,
  type EntryResponse,
  type TargetCharsMode,
} from "@/lib/selfeval/types";
import GrowthDirectionBanner from "../GrowthDirectionBanner";
import {
  CARD_BOX,
  CARD_HEADING,
  Field,
  INPUT,
  PillGroup,
  SELECT,
  TEXTAREA,
} from "./BasicsFields";
import {
  type BasicsErrors,
  type BasicsForm as BasicsFormState,
  GRADE_OPTIONS,
  MAX_UNIVERSITIES,
  SEMESTER_OPTIONS,
} from "./basicsLogic";

// 기본 입력 폼 본문(시안 07~13, 명세 No.20~25, 68, 72, 74). 상태는 부모가 쥐고
// 이 컴포넌트는 값을 그리고 변경만 올려 보낸다.

type Entry = EntryResponse["entry"];

const AREA_OPTIONS = (Object.keys(AREA_LABELS) as Area[]).map((value) => ({
  value,
  label: AREA_LABELS[value],
}));
const MODE_OPTIONS: readonly { value: TargetCharsMode; label: string }[] = [
  { value: "with_space", label: "공백 포함" },
  { value: "without_space", label: "공백 제외" },
];
const UNIVERSITY_SLOTS = Array.from({ length: MAX_UNIVERSITIES }, (_, i) => i);

type Props = {
  form: BasicsFormState;
  errors: BasicsErrors;
  entry: Entry;
  /** 성장설계 카드에 쓸 값. 없으면 카드를 그리지 않는다. */
  growth: Entry["growth"];
  /** 프로필이 비어 있어 처음 입력하는 학생에게만 안내를 보여 준다. */
  profileMissing: boolean;
  disabled: boolean;
  onChange: (patch: Partial<BasicsFormState>) => void;
};

export default function BasicsForm({
  form,
  errors,
  entry,
  growth,
  profileMissing,
  disabled,
  onChange,
}: Props) {
  const base = useId();
  const id = (name: string) => `${base}-${name}`;
  const years = Array.from(
    { length: 4 },
    (_, i) => entry.academicYearDefault - 2 + i,
  );
  const targetEmpty = form.targetChars.trim() === "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-4">
      <div className="flex min-w-0 flex-col gap-4">
        <section className={CARD_BOX} aria-labelledby={id("scope-title")}>
          <h2 id={id("scope-title")} className={CARD_HEADING}>
            작성 범위
          </h2>
          {profileMissing && (
            <p className="mt-2 text-app-label text-ink-sub">
              처음 오셨네요. 학년과 진로를 입력하면 다음부터 채워져요
            </p>
          )}
          <fieldset disabled={disabled} className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <Field id={id("year")} label="학년도" error={errors.academicYear}>
                <select
                  id={id("year")}
                  className={SELECT}
                  value={form.academicYear}
                  onChange={(e) => onChange({ academicYear: e.target.value })}
                >
                  {years.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}학년도
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={id("grade")} label="학년" error={errors.gradeLabel}>
                <select
                  id={id("grade")}
                  className={SELECT}
                  value={form.gradeLabel}
                  onChange={(e) =>
                    onChange({
                      gradeLabel: e.target
                        .value as BasicsFormState["gradeLabel"],
                    })
                  }
                >
                  <option value="">선택하세요</option>
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={id("semester")} label="학기" error={errors.semester}>
                <select
                  id={id("semester")}
                  className={SELECT}
                  value={form.semester}
                  onChange={(e) =>
                    onChange({
                      semester: e.target.value as BasicsFormState["semester"],
                    })
                  }
                >
                  <option value="">선택하세요</option>
                  {SEMESTER_OPTIONS.map((s) => (
                    <option key={s} value={String(s)}>
                      {s}학기
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-app-label font-medium text-ink-sub">
                작성 영역
              </span>
              <PillGroup
                label="작성 영역"
                value={form.area}
                options={AREA_OPTIONS}
                onChange={(area) => onChange({ area })}
              />
            </div>

            {form.area === "subject" ? (
              <Field id={id("subject")} label="과목명" error={errors.subject}>
                <Input
                  id={id("subject")}
                  className={INPUT}
                  placeholder="예: 수학"
                  aria-invalid={errors.subject ? true : undefined}
                  value={form.subject}
                  onChange={(e) => onChange({ subject: e.target.value })}
                />
              </Field>
            ) : (
              <Field
                id={id("activity")}
                label="활동명"
                error={errors.activityName}
              >
                <Input
                  id={id("activity")}
                  className={INPUT}
                  placeholder="예: 천문 동아리 별자리 관측"
                  aria-invalid={errors.activityName ? true : undefined}
                  value={form.activityName}
                  onChange={(e) => onChange({ activityName: e.target.value })}
                />
              </Field>
            )}
          </fieldset>
        </section>

        <section className={CARD_BOX} aria-labelledby={id("prompt-title")}>
          <h2 id={id("prompt-title")} className={CARD_HEADING}>
            학교 문항
          </h2>
          <fieldset disabled={disabled} className="mt-4 flex flex-col gap-4">
            <Field
              id={id("prompt")}
              label="학교 문항 전문"
              error={errors.schoolPrompt}
            >
              <textarea
                id={id("prompt")}
                className={TEXTAREA}
                rows={5}
                aria-invalid={errors.schoolPrompt ? true : undefined}
                placeholder="학교에서 받은 문항을 그대로 붙여 넣어 주세요"
                value={form.schoolPrompt}
                onChange={(e) => onChange({ schoolPrompt: e.target.value })}
              />
            </Field>
            <Field id={id("note")} label="선생님 요구사항(선택)">
              <textarea
                id={id("note")}
                className={TEXTAREA}
                rows={3}
                placeholder="예: 탐구 과정을 중심으로 쓰기"
                value={form.teacherNote}
                onChange={(e) => onChange({ teacherNote: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field
                id={id("target")}
                label="목표 글자 수"
                error={errors.targetChars}
                hint={
                  targetEmpty
                    ? "비워 두면 분량 판정만 꺼져요. 나머지 검증은 그대로 해요"
                    : undefined
                }
              >
                <Input
                  id={id("target")}
                  className={INPUT}
                  inputMode="numeric"
                  aria-invalid={errors.targetChars ? true : undefined}
                  value={form.targetChars}
                  onChange={(e) => onChange({ targetChars: e.target.value })}
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-app-label font-medium text-ink-sub">
                  계산 방식
                </span>
                <PillGroup
                  label="계산 방식"
                  value={form.targetCharsMode}
                  options={MODE_OPTIONS}
                  onChange={(targetCharsMode) => onChange({ targetCharsMode })}
                />
              </div>
            </div>
            <p className="text-app-caption text-ink-sub">
              목표 글자 수와 학교 기재 한도는 다른 값이에요
            </p>
          </fieldset>
        </section>

        {growth && (
          <GrowthCard
            growth={growth}
            form={form}
            disabled={disabled}
            onChange={onChange}
          />
        )}
      </div>

      <section className={CARD_BOX} aria-labelledby={id("career-title")}>
        <h2 id={id("career-title")} className={CARD_HEADING}>
          진로 정보
        </h2>
        <fieldset disabled={disabled} className="mt-4 flex flex-col gap-4">
          <Field id={id("career")} label="희망 진로">
            <Input
              id={id("career")}
              className={INPUT}
              value={form.career}
              onChange={(e) => onChange({ career: e.target.value })}
            />
          </Field>
          <Field id={id("dept")} label="희망 학과">
            <Input
              id={id("dept")}
              className={INPUT}
              value={form.department}
              onChange={(e) => onChange({ department: e.target.value })}
            />
          </Field>
          {UNIVERSITY_SLOTS.map((i) => (
            <Field
              key={i}
              id={id(`univ${i}`)}
              label={`희망 대학 ${i + 1}`}
              error={i === 0 ? errors.universities : undefined}
            >
              <Input
                id={id(`univ${i}`)}
                className={INPUT}
                value={form.universities[i] ?? ""}
                onChange={(e) => {
                  const next = [...form.universities];
                  next[i] = e.target.value;
                  onChange({ universities: next });
                }}
              />
            </Field>
          ))}
          <p className="text-app-caption text-ink-sub">
            완성된 문장에 대학 이름은 넣지 않아요
          </p>
        </fieldset>
      </section>
    </div>
  );
}

function GrowthCard({
  growth,
  form,
  disabled,
  onChange,
}: {
  growth: NonNullable<Entry["growth"]>;
  form: BasicsFormState;
  disabled: boolean;
  onChange: (patch: Partial<BasicsFormState>) => void;
}) {
  const applied = form.growthApplied;
  const label = "이 방향을 이번 자기평가서에 적용합니다";
  return (
    <section className="flex flex-col gap-3" aria-label="성장설계 연동">
      <GrowthDirectionBanner banner={growth.banner} stale={growth.stale} />
      <div className={`${CARD_BOX} flex flex-col gap-4`}>
        <div className="flex items-center justify-between gap-4">
          <span className="text-app-body font-semibold text-ink-strong">
            {label}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={applied}
            aria-label={label}
            disabled={disabled}
            onClick={() =>
              onChange({
                growthApplied: !applied,
                planItemId: applied ? null : form.planItemId,
              })
            }
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              applied ? "bg-primary" : "bg-surface-01"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                applied ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
        {!applied && (
          <p className="text-app-caption text-ink-sub">
            방향 없이 진행해요. 활동 추천에 성장설계를 쓰지 않아요
          </p>
        )}
        {applied && growth.planItems.length > 0 && (
          <fieldset
            aria-label="이번에 채울 실행계획 과제"
            className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
          >
            <p className="text-app-label font-medium text-ink-sub">
              이번에 채울 실행계획 과제(선택)
            </p>
            {growth.planItems.map((item) => {
              const checked = form.planItemId === item.id;
              return (
                <label
                  key={item.id}
                  className={`cursor-pointer rounded-lg border px-4 py-3 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${
                    checked
                      ? "border-primary bg-surface-04"
                      : "border-line/60 bg-white hover:bg-surface-04"
                  }`}
                >
                  {/* 이미 고른 과제를 다시 누르면 해제한다. 라디오는 같은 값을 다시 눌러도
                      change 가 오지 않아 onClick 으로 직접 다룬다. */}
                  <input
                    type="radio"
                    name="selfeval-plan-item"
                    className="sr-only"
                    checked={checked}
                    readOnly
                    disabled={disabled}
                    onClick={() =>
                      onChange({ planItemId: checked ? null : item.id })
                    }
                  />
                  <span className="block text-app-body font-semibold text-ink-strong">
                    {item.title}
                  </span>
                  {item.description && (
                    <span className="mt-1 block text-app-caption text-ink-sub">
                      {item.description}
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>
        )}
      </div>
    </section>
  );
}
