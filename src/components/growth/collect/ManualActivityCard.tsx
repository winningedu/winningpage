import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActivityView } from "@/lib/growth/api";
import { CollectSection, NoticeBox } from "./CollectSection";
import {
  deleteManualActivity,
  EMPTY_MANUAL_FORM,
  GRADE_OPTIONS,
  insertManualActivity,
  type ManualField,
  type ManualForm,
  SEMESTER_OPTIONS,
  validateManualForm,
} from "./manualActivity";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-app-body text-ink-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-app-label font-semibold text-ink-strong"
      >
        {label}
      </label>
      {children(id)}
      {error && <p className="text-app-caption text-error">{error}</p>}
    </div>
  );
}

/** 활동 직접 입력 카드(No.41). 저장한 직접 입력 행은 본인 RLS 로 삭제할 수 있다. */
export function ManualActivityCard({
  userId,
  manualActivities,
  onChanged,
  sectionRef,
}: {
  userId: string | null;
  manualActivities: ActivityView[];
  /** 추가나 삭제가 끝난 뒤 summary 를 다시 부른다. */
  onChanged: () => void;
  sectionRef?: React.Ref<HTMLElement> | undefined;
}) {
  const [form, setForm] = useState<ManualForm>(EMPTY_MANUAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<ManualField, string>>>(
    {},
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends ManualField>(field: K, value: ManualForm[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async () => {
    if (saving) return;
    setMessage(null);
    const checked = validateManualForm(form);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    if (userId === null) {
      setMessage("로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.");
      return;
    }
    setErrors({});
    setSaving(true);
    const result = await insertManualActivity(userId, checked.value);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setForm(EMPTY_MANUAL_FORM);
    onChanged();
  };

  const remove = async (id: string) => {
    setMessage(null);
    const result = await deleteManualActivity(id);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    onChanged();
  };

  const text = (field: ManualField, label: string) => (
    <Field label={label} error={errors[field]}>
      {(id) => (
        <Input
          id={id}
          value={form[field]}
          placeholder="입력"
          aria-invalid={errors[field] ? true : undefined}
          onChange={(e) => set(field, e.target.value as never)}
          className="h-10"
        />
      )}
    </Field>
  );

  return (
    <CollectSection
      title="활동 직접 입력"
      description="위닝에 없는 활동을 직접 적어요. 집계와 A부터 E 판정에 함께 써요."
      sectionRef={sectionRef}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="학년" error={errors.gradeLabel}>
          {(id) => (
            <select
              id={id}
              value={form.gradeLabel}
              className={SELECT_CLASS}
              onChange={(e) =>
                set("gradeLabel", e.target.value as ManualForm["gradeLabel"])
              }
            >
              <option value="">예: 1학년</option>
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g[1]}학년
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="학기" error={errors.semester}>
          {(id) => (
            <select
              id={id}
              value={form.semester}
              className={SELECT_CLASS}
              onChange={(e) =>
                set("semester", e.target.value as ManualForm["semester"])
              }
            >
              <option value="">예: 2학기</option>
              {SEMESTER_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}학기
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="과목 또는 영역" error={errors.subjectGroup}>
          {(id) => (
            <Input
              id={id}
              value={form.subjectGroup}
              placeholder="예: 통합사회"
              aria-invalid={errors.subjectGroup ? true : undefined}
              onChange={(e) => set("subjectGroup", e.target.value)}
              className="h-10"
            />
          )}
        </Field>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {text("topic", "주제")}
        {text("concept", "개념")}
        {text("method", "방법")}
        {text("result", "결과")}
        {text("limitation", "한계")}
      </div>

      {message && (
        <div className="mt-3">
          <NoticeBox tone="warn" role="alert">
            {message}
          </NoticeBox>
        </div>
      )}

      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={saving}
          onClick={submit}
        >
          활동 추가
        </Button>
      </div>

      {manualActivities.length > 0 && (
        <ul className="mt-5 border-t border-line/60 pt-3">
          {manualActivities.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 py-2 text-app-label"
            >
              <span className="min-w-0 truncate text-ink-strong">
                {[
                  a.gradeLabel && a.semester
                    ? `${a.gradeLabel[1]}학년 ${a.semester}학기`
                    : null,
                  a.subjectGroup,
                  a.topic,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(a.id)}
                aria-label={`${a.topic ?? "직접 입력 활동"} 삭제`}
              >
                삭제
              </Button>
            </li>
          ))}
        </ul>
      )}
    </CollectSection>
  );
}
