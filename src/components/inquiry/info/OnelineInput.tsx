import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateOneline } from "./infoLogic";
import { FIELD_ERROR, INPUT_CLASS } from "./styles";

type OnelineInputProps = {
  disabled: boolean;
  onAdd: (text: string) => void;
};

// 주제 한 줄 입력(No.32). 엔터 또는 추가 버튼으로 선택 자산에 한 줄을 더한다. 200자 안.
export default function OnelineInput({ disabled, onAdd }: OnelineInputProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const problem = validateOneline(text);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onAdd(text.trim());
    setText("");
  }

  return (
    <div>
      <div className="flex gap-3">
        <Input
          id={id}
          aria-label="했던 활동의 주제 한 줄"
          className={INPUT_CLASS}
          value={text}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          placeholder="했던 활동의 주제를 적어 주세요 (예: 여름철 산책 판단에 온습도지수를 적용해 본 활동)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          size="lg"
          className="h-10 px-5 text-app-label"
          disabled={disabled}
          onClick={add}
        >
          추가
        </Button>
      </div>
      {error && (
        <p role="alert" className={`mt-1 ${FIELD_ERROR}`}>
          {error}
        </p>
      )}
      <p className="mt-2 text-app-caption text-ink-sub">
        제목이 기억나지 않으면 무엇에 대한 것이었는지 한 줄만 적으면 돼요. 여러
        개 적어도 돼요.
      </p>
    </div>
  );
}
