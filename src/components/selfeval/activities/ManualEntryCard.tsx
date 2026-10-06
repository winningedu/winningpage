import { useId, useState } from "react";
import { CARD } from "@/components/growth/start/cardStyles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ManualInput } from "@/lib/selfeval/types";
import {
  buildManualInput,
  MANUAL_TEXT_FIELDS,
  type ManualErrors,
  type ManualForm,
  validateManualForm,
} from "./manualForm";

// 직접 입력 폼(시안 19, 명세 No.26, 102). 필수는 활동명과 과목 또는 영역뿐이다.
// 제출하면 이 활동 하나를 핵심으로 확정하고 분석 화면으로 넘어간다(서버 manual 동작).

const TEXTAREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-app-label text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-app-label text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Props = {
  initial: ManualForm;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: ManualInput) => void;
};

export default function ManualEntryCard({
  initial,
  busy,
  onCancel,
  onSubmit,
}: Props) {
  const base = useId();
  const id = (name: string) => `${base}-${name}`;
  const [form, setForm] = useState<ManualForm>(initial);
  const [errors, setErrors] = useState<ManualErrors>({});
  const set = (patch: Partial<ManualForm>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  function submit() {
    const found = validateManualForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(buildManualInput(form));
  }

  return (
    <section className={CARD} aria-label="직접 입력">
      <h2 className="text-app-card-title font-bold text-ink-strong">
        직접 입력
      </h2>
      <p className="mt-1 text-app-label text-ink-sub">
        적은 활동은 이번에 핵심 활동으로 쓰고, 다음 자기평가서에서도 재료로 쓸
        수 있어요.
      </p>
      <fieldset disabled={busy} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={id("name")}
              className="text-app-label font-medium text-ink-sub"
            >
              활동명
            </label>
            <Input
              id={id("name")}
              className="h-9 text-app-label md:text-app-label"
              aria-invalid={errors.activityName ? true : undefined}
              value={form.activityName}
              onChange={(e) => set({ activityName: e.target.value })}
            />
            {errors.activityName && (
              <p className="text-app-caption text-destructive">
                {errors.activityName}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={id("subject")}
              className="text-app-label font-medium text-ink-sub"
            >
              과목 또는 영역
            </label>
            <Input
              id={id("subject")}
              className="h-9 text-app-label md:text-app-label"
              aria-invalid={errors.subjectOrArea ? true : undefined}
              value={form.subjectOrArea}
              onChange={(e) => set({ subjectOrArea: e.target.value })}
            />
            {errors.subjectOrArea && (
              <p className="text-app-caption text-destructive">
                {errors.subjectOrArea}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={id("grade")}
              className="text-app-label font-medium text-ink-sub"
            >
              학년
            </label>
            <select
              id={id("grade")}
              className={SELECT}
              value={form.gradeLabel}
              onChange={(e) =>
                set({ gradeLabel: e.target.value as ManualForm["gradeLabel"] })
              }
            >
              <option value="">선택 안 함</option>
              <option value="고1">고1</option>
              <option value="고2">고2</option>
              <option value="고3">고3</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={id("semester")}
              className="text-app-label font-medium text-ink-sub"
            >
              학기
            </label>
            <select
              id={id("semester")}
              className={SELECT}
              value={form.semester}
              onChange={(e) =>
                set({ semester: e.target.value as ManualForm["semester"] })
              }
            >
              <option value="">선택 안 함</option>
              <option value="1">1학기</option>
              <option value="2">2학기</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {MANUAL_TEXT_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label
                htmlFor={id(key)}
                className="text-app-label font-medium text-ink-sub"
              >
                {label}
              </label>
              <textarea
                id={id(key)}
                rows={3}
                className={TEXTAREA}
                value={form[key]}
                onChange={(e) => set({ [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-9 px-4 text-app-label"
          disabled={busy}
          onClick={onCancel}
        >
          닫기
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-9 px-4 text-app-label font-semibold"
          disabled={busy}
          onClick={submit}
        >
          이 활동으로 분석하기
        </Button>
      </div>
    </section>
  );
}
