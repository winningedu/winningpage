import { useState } from "react";
import AppModal from "@/components/goal/AppModal";
import { INPUT, TEXTAREA } from "@/components/selfeval/basics/BasicsFields";
import { Input } from "@/components/ui/input";
import type { MandatoryFix } from "@/lib/selfeval/types";
import type { PromoteForm } from "./promoteDraft";

// 저장 확인 모달(시안 52, 명세 No.43, 63). 활동 기록 저장소에 저장할 7항목을 학생이 확인하고 고친다.
// 수치와 자료명은 한 줄에 하나씩 적는다.

const FIELDS: {
  key: Exclude<keyof PromoteForm, "topic">;
  label: string;
  hint?: string;
}[] = [
  { key: "concept", label: "개념" },
  { key: "method", label: "방법" },
  { key: "result", label: "결과" },
  { key: "limitation", label: "한계" },
  { key: "numbers", label: "수치", hint: "한 줄에 하나씩 적어요" },
  { key: "sources", label: "자료명", hint: "한 줄에 하나씩 적어요" },
];

type Props = {
  open: boolean;
  busy: boolean;
  initial: PromoteForm;
  /** 연결된 성장설계 과제 제목. 없으면 체크박스를 그리지 않는다. */
  planItemTitle: string | null;
  /** 남은 필수 수정. 1건 이상이면 경고를 그리고 제출 문구를 바꾼다. */
  mandatoryFixes: Pick<MandatoryFix, "key" | "message">[];
  onClose: () => void;
  onSubmit: (form: PromoteForm, fulfillsPlanItem: boolean | undefined) => void;
};

export default function PromoteModal({
  open,
  busy,
  initial,
  planItemTitle,
  mandatoryFixes,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<PromoteForm>(initial);
  const [fulfills, setFulfills] = useState(true);
  const warn = mandatoryFixes.length > 0;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="이 내용으로 저장할까요?"
      subtitle="활동 기록 저장소에 7항목으로 저장해요. 저장한 자기평가서는 잠겨서 더 고치지 않아요."
      submitLabel={warn ? "그래도 저장" : "확인하고 저장"}
      submitDisabled={busy || form.topic.trim() === ""}
      onSubmit={() =>
        onSubmit(form, planItemTitle === null ? undefined : fulfills)
      }
    >
      <div className="flex flex-col gap-3">
        {warn && (
          <div
            role="alert"
            className="rounded-lg bg-error/10 p-3 text-app-label text-ink-strong"
          >
            <p className="font-semibold text-error">
              필수 수정 {mandatoryFixes.length}건이 남아 있어요. 정말
              저장할까요?
            </p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {mandatoryFixes.map((f) => (
                <li key={f.key}>{f.message}</li>
              ))}
            </ul>
          </div>
        )}
        <label
          htmlFor="promote-topic"
          className="flex flex-col gap-1 text-app-label font-medium text-ink-sub"
        >
          주제
          <Input
            id="promote-topic"
            className={INPUT}
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
          />
        </label>
        {FIELDS.map((f) => (
          <label
            key={f.key}
            className="flex flex-col gap-1 text-app-label font-medium text-ink-sub"
          >
            {f.label}
            <textarea
              rows={f.key === "numbers" || f.key === "sources" ? 2 : 3}
              className={TEXTAREA}
              placeholder={f.hint}
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          </label>
        ))}
        {planItemTitle !== null && (
          <label className="flex items-start gap-2 text-app-label text-ink-strong">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={fulfills}
              onChange={(e) => setFulfills(e.target.checked)}
            />
            이 자기평가서로 성장설계 과제 '{planItemTitle}' 를 완료 처리해요
          </label>
        )}
      </div>
    </AppModal>
  );
}
