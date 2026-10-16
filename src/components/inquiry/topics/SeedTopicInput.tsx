import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_SEED_LENGTH = 80;

type Props = {
  disabled: boolean;
  onSubmit: (seedTopic: string) => void;
};

export default function SeedTopicInput({ disabled, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const hintId = useId();
  const trimmed = value.trim();

  return (
    <form
      aria-label="직접 주제 입력"
      className="flex flex-col gap-2 rounded-xl bg-surface-04 px-6 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed !== "" && !disabled) onSubmit(trimmed);
      }}
    >
      <p className="text-app-label font-bold text-ink-strong">
        마음에 드는 주제가 없나요?
      </p>
      <p id={hintId} className="text-app-caption text-ink-sub">
        하고 싶은 주제를 한 줄로 적으면 그 주제를 기준으로 다시 추천해요. 재추천
        횟수 안에서 쓸 수 있어요.
      </p>
      <div className="flex gap-2">
        <Input
          aria-label="직접 주제 한 줄"
          aria-describedby={hintId}
          value={value}
          maxLength={MAX_SEED_LENGTH}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 flex-1 bg-white"
        />
        <Button
          type="submit"
          variant="outline"
          size="lg"
          className="h-10 px-5 text-app-label"
          disabled={disabled || trimmed === ""}
        >
          이 주제로 다시 추천받기
        </Button>
      </div>
    </form>
  );
}
