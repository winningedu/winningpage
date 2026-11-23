import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  LINK_TYPE_LABELS,
  LINK_TYPES,
  type LinkType,
} from "@/lib/selfeval/types";

// 연계 유형과 한 줄 설명을 받는 입력(명세 No.180, 186). 설명이 비어 있으면 보낼 수 없다.
// 연계 지도의 새 선 긋기와 연계 없는 기록의 설명 입력이 같이 쓴다.

type Props = {
  submitLabel: string;
  /** 부모 쪽 조건(두 기록 선택 등)이 맞지 않을 때 막는다. */
  disabled?: boolean;
  busy: boolean;
  onSubmit: (input: { type: LinkType; note: string }) => void;
  children?: React.ReactNode;
};

const FIELD =
  "h-9 rounded-lg border border-line/60 bg-white px-2 text-app-label text-ink";

export default function LinkNoteForm({
  submitLabel,
  disabled = false,
  busy,
  onSubmit,
  children,
}: Props) {
  const [type, setType] = useState<LinkType>(LINK_TYPES[0]);
  const [note, setNote] = useState("");
  const trimmed = note.trim();

  return (
    <div className="flex flex-col gap-2">
      {children}
      <label className="flex flex-col gap-1 text-app-caption text-ink-sub">
        연계 유형
        <select
          className={FIELD}
          value={type}
          onChange={(e) => setType(e.target.value as LinkType)}
        >
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {LINK_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-app-caption text-ink-sub">
        어떻게 이어지는지 한 줄
        <input
          type="text"
          className={FIELD}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-9 self-start px-4 text-app-label"
        disabled={busy || disabled || trimmed === ""}
        onClick={() => {
          onSubmit({ type, note: trimmed });
          setNote("");
        }}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
