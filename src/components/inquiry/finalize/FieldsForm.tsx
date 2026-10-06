import { cn } from "@/lib/utils";
import { type FormState, TEXT_KEYS, type TextKey } from "./finalizeLogic";

type FieldKey = keyof FormState;

const FIELDS: {
  key: FieldKey;
  label: string;
  hint: string;
  multiline: boolean;
}[] = [
  {
    key: "topic",
    label: "주제",
    hint: "확정한 주제 제목에서 가져왔어요",
    multiline: false,
  },
  {
    key: "concept",
    label: "사용 개념",
    hint: "설계 리포트의 핵심 개념에서 뽑았어요",
    multiline: false,
  },
  {
    key: "method",
    label: "방법",
    hint: "Ⅲ절 첫 문단에서 뽑았어요",
    multiline: true,
  },
  {
    key: "result",
    label: "결과",
    hint: "Ⅳ절 첫 문단에서 뽑았어요",
    multiline: true,
  },
  {
    key: "limitation",
    label: "한계",
    hint: "Ⅵ절 첫 항목에서 뽑았어요",
    multiline: true,
  },
  {
    key: "numbers",
    label: "수치",
    hint: "Ⅳ, Ⅴ절에서 숫자가 들어간 문장을 뽑았어요. 한 줄에 하나씩 적어요",
    multiline: true,
  },
  {
    key: "sources",
    label: "자료명",
    hint: "Ⅷ절의 줄을 가져왔어요. 한 줄에 하나씩 적어요",
    multiline: true,
  },
];

const CONTROL =
  "w-full rounded-lg border bg-white px-3 py-2 text-app-body text-ink-strong outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

function isTextKey(key: FieldKey): key is TextKey {
  return (TEXT_KEYS as readonly string[]).includes(key);
}

type Props = {
  value: FormState;
  onChange: (key: FieldKey, text: string) => void;
  disabled?: boolean;
};

export default function FieldsForm({
  value,
  onChange,
  disabled = false,
}: Props) {
  return (
    <section
      aria-labelledby="finalize-fields"
      className="rounded-xl border border-border bg-white p-6"
    >
      <h2
        id="finalize-fields"
        className="text-app-section font-bold text-ink-strong"
      >
        추출 내용 확인과 수정
      </h2>
      <p className="mt-1 mb-4 text-app-label text-ink-sub">
        보고서에서 뽑은 7항목이에요. 틀린 곳은 직접 고쳐서 적립할 수 있어요.
      </p>
      <div className="flex flex-col gap-5">
        {FIELDS.map((f) => {
          const invalid = isTextKey(f.key) && value[f.key].trim() === "";
          const id = `finalize-${f.key}`;
          const hintId = `${id}-hint`;
          const common = {
            id,
            value: value[f.key],
            disabled,
            "aria-invalid": invalid || undefined,
            "aria-describedby": hintId,
            onChange: (
              e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) => onChange(f.key, e.target.value),
            className: cn(CONTROL, invalid ? "border-error" : "border-border"),
          };
          return (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label
                htmlFor={id}
                className="text-app-label font-semibold text-ink-strong"
              >
                {f.label}
              </label>
              <p id={hintId} className="text-app-caption text-ink-sub">
                {f.hint}
              </p>
              {f.multiline ? (
                <textarea
                  {...common}
                  rows={f.key === "numbers" || f.key === "sources" ? 4 : 3}
                />
              ) : (
                <input type="text" {...common} />
              )}
              {invalid && (
                <p className="text-app-caption text-error">
                  직접 적어 주세요. 비워 두면 적립할 수 없어요
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
