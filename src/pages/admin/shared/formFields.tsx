import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

// sql/52_mentor_applications.sql의 status 컬럼 주석에 적힌 값 그대로(CHECK 제약은 없지만
// 이 6개가 실제 사용 값이다). CONFIGS.mentorApplications 목록 컬럼과 MentorApplicationsAdmin의
// 상세 상태변경 Select가 이 배열 하나를 공유한다 — 값이 어긋나면 목록에 라벨이 안 붙는다.
export const MENTOR_APPLICATION_STATUS_OPTIONS: {
  value: string;
  label: string;
}[] = [
  { value: "submitted", label: "제출됨" },
  { value: "screening", label: "서류심사" },
  { value: "interview", label: "면접" },
  { value: "training", label: "교육" },
  { value: "active", label: "활동중" },
  { value: "rejected", label: "불합격" },
];

// source: 백필(admission_results 유도)로 만들어진 행인지, 사람이 손으로 넣은
// 행인지를 구분한다. 백필 재실행이 'manual' 행을 덮어쓰지 않는 근거 컬럼이다.
// CONFIGS.goalUniversityCuts(Admin.jsx)와 GoalStudentsAdmin이 이 배열을 공유한다.
export const GOAL_CUT_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "admission_results", label: "입결정보 유도" },
  { value: "manual", label: "수기 입력" },
];

export function normalizeProgramIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export function boolValue(value: unknown): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return Boolean(value);
}

export function getNextSortOrder(items: unknown): number {
  const list: { sort_order?: number }[] = Array.isArray(items) ? items : [];

  if (list.length === 0) return 1;

  return Math.max(...list.map((item) => Number(item.sort_order || 0))) + 1;
}

interface TextInputProps {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  className = "",
  "aria-label": ariaLabel,
}: TextInputProps) {
  return (
    <Input
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`h-10 font-medium ${className}`}
    />
  );
}

interface TextareaProps {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: TextareaProps) {
  return (
    <UiTextarea
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="field-sizing-fixed resize-y font-medium"
    />
  );
}

interface SelectProps {
  value?: string | null;
  onChange: (value: string) => void;
  children: ReactNode;
}

export function Select({ value, onChange, children }: SelectProps) {
  return (
    <NativeSelect
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      className="w-full"
    >
      {children}
    </NativeSelect>
  );
}

interface ToggleProps {
  checked?: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-black text-gray-700">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#0D1B2A]"
      />
      {label}
    </label>
  );
}

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    // 계약: label 안에는 폼 컨트롤 하나만 둔다(getByLabelText가 그 컨트롤을 찾는다).
    // biome-ignore lint/a11y/noLabelWithoutControl: children이 폼 컨트롤을 감싸는(중첩) 연결 방식이다 — 정적 분석이 children 내부를 못 봐서 오탐이다.
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

interface ActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "dark" | "danger" | "light";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

export function ActionButton({
  children,
  onClick,
  variant = "dark",
  type = "button",
  disabled = false,
}: ActionButtonProps) {
  const variantClass =
    variant === "danger"
      ? "border border-red-500 bg-white text-red-600 hover:bg-red-50"
      : variant === "light"
        ? "border border-gray-400 bg-white text-gray-800 hover:bg-gray-50"
        : "bg-[#0D1B2A] text-white hover:bg-[#162A40]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-1 px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClass}`}
    >
      {children}
    </button>
  );
}

interface Program {
  id: string;
  title?: string | null;
}

interface ProgramSelectorProps {
  programs: Program[];
  value: unknown;
  onChange: (ids: string[]) => void;
}

export function ProgramSelector({
  programs,
  value,
  onChange,
}: ProgramSelectorProps) {
  const selected = new Set(normalizeProgramIds(value));

  function toggle(programId: string) {
    const next = new Set(selected);
    if (next.has(programId)) next.delete(programId);
    else next.add(programId);
    onChange(Array.from(next));
  }

  if (programs.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-gray-300 px-3 py-2 text-xs font-bold text-gray-500">
        먼저 추천 프로그램을 등록하세요.
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {programs.map((program) => (
        <label
          key={program.id}
          className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-xs font-black transition ${
            selected.has(program.id)
              ? "border-[#0D1B2A] bg-[#0D1B2A] text-white"
              : "border-gray-300 bg-white text-gray-700 hover:border-[#B88737]"
          }`}
        >
          <input
            type="checkbox"
            checked={selected.has(program.id)}
            onChange={() => toggle(program.id)}
            className="h-4 w-4 accent-[#B88737]"
          />
          {program.title || "제목 없음"}
        </label>
      ))}
    </div>
  );
}
