/**
 * ConditionalTextInput
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:8753 (목표대학/희망학과 조건부 입력)
 *        + 1889:10886 (Q19 자유 서술 — 멀티라인 992×105, items-start)
 *
 * 1줄 입력과 멀티라인(textarea)을 한 컴포넌트로 처리한다 (`multiline` prop).
 * 시안 실측: 박스 992×105 (62rem × 6.5625rem), bg #FFF, r20, border 1px #D7D7D7,
 *            px20 py14 (1.25rem·0.875rem), 콘텐츠 상단 정렬.
 *
 * 상태 (SPEC-fd-ver3-v2 §9-A2):
 *   default border #D7D7D7 / placeholder #D7D7D7
 *   hover   border #B0B0B0
 *   focus   border #013262 + outline 2px #0B84FD 30%
 *   filled  텍스트 #181D24
 *   error   border #D92D20 (스타일만, 검증 로직 없음)
 */
import { useId } from "react";

type ConditionalTextInputProps = {
  label?: string;
  placeholder?: string;
  value?: string | null;
  onChange?: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string;
};

export default function ConditionalTextInput({
  label,
  placeholder,
  value,
  onChange,
  multiline = false,
  rows = 3,
  disabled = false,
  error = false,
  errorMessage,
}: ConditionalTextInputProps) {
  const inputId = useId();
  // 세로 padding 은 multiline 에만 남긴다. 1줄 입력은 input 이 박스 68px 을 그대로 채우고
  // (h-full) 텍스트는 input 자신의 단일행 수직 중앙정렬로 놓이므로 렌더 결과가 동일하면서
  // 클릭 가능 영역만 28px → 68px 로 넓어진다. py-3.5 를 남기면 content box 가 40px 이라
  // h-full 을 줘도 44px 터치 타깃에 미달한다.
  const boxClass = [
    "flex w-full max-w-248 rounded-perf-modal border bg-white px-5 transition-[border-color,box-shadow] duration-150",
    multiline ? "h-26.25 items-start py-3.5" : "h-17 items-center",
    error
      ? "border-[#D92D20]"
      : "border-line hover:border-[#B0B0B0] focus-within:border-primary",
    "focus-within:outline-solid focus-within:outline-2 focus-within:outline-accent/30",
    disabled ? "cursor-not-allowed border-line bg-[#F5F5F5]" : "",
  ].join(" ");

  // h-full: input 기본 높이는 28px 뿐이라 박스 상하가 클릭 불감대였다
  // (박스에 포커스 위임도 없어 그 영역을 눌러도 커서가 들어가지 않았다 — 44px 터치 타깃 미달).
  const fieldClass =
    "h-full w-full bg-transparent text-xl font-normal leading-[1.4] text-ink-title placeholder:text-line focus:outline-hidden disabled:cursor-not-allowed";

  return (
    <div className="flex w-full flex-col items-start gap-3">
      {label && (
        <label
          htmlFor={inputId}
          className="text-base font-medium leading-5 text-ink"
        >
          {label}
        </label>
      )}

      <div className={boxClass}>
        {multiline ? (
          <textarea
            id={inputId}
            rows={rows}
            value={value ?? ""}
            onChange={(event) => onChange?.(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={`${fieldClass} resize-none`}
          />
        ) : (
          <input
            id={inputId}
            type="text"
            value={value ?? ""}
            onChange={(event) => onChange?.(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={fieldClass}
          />
        )}
      </div>

      {error && errorMessage && (
        <p className="text-[0.75rem] font-medium leading-[1.4] text-[#D92D20]">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
