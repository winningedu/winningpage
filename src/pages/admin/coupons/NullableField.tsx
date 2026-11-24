import { Input } from "@/components/ui/input";
import {
  FIELD_LABEL,
  INPUT_CLASS,
  MAX_USES_PER_USER_DERIVED_HINT_TEXT,
  UNLIMITED_FALLBACK,
  UNLIMITED_LABEL,
} from "./copy";
import type { CouponForm } from "./form";

// 3상태 컨트롤: [∞] / [값] 라디오 + 값 입력. 값 모드가 아니면 입력을 비활성화해
// "무제한인데 숫자가 남아 있는" 화면을 만들지 않는다. disabled=true 면(현재는
// max_uses_per_user 뿐, grant_type 파생값) 라디오 두 개와 입력까지 전부 잠그고
// 안내 문구를 붙인다, grant_on_signup 체크박스(:1528)와 같은 "파생값은 손편집
// 금지" 규범이다.
interface NullableFieldProps {
  fieldKey: keyof CouponForm;
  type: "date" | "number";
  mode: string;
  value: number | string;
  // fieldKey로 조합한 동적 키(`${fieldKey}_mode`, fieldKey 자체)를 patch에 그대로
  // 흘려보낸다, CouponForm의 정적 프로퍼티 타입으로 표현할 수 없는 진짜 동적
  // 지점이라 Record로 느슨하게 받는다(patch는 strict:false라 그대로 호환된다).
  onChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function NullableField({
  fieldKey,
  type,
  mode,
  value,
  onChange,
  disabled = false,
}: NullableFieldProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <label className="inline-flex items-center gap-2 text-sm font-bold">
        <input
          type="radio"
          name={`${fieldKey}_mode`}
          aria-label={`${FIELD_LABEL[fieldKey]} ${UNLIMITED_LABEL}`}
          className="accent-primary"
          checked={mode === "unlimited"}
          disabled={disabled}
          onChange={() =>
            onChange({ [`${fieldKey}_mode`]: "unlimited", [fieldKey]: "" })
          }
        />
        <span className="text-base leading-none">
          {UNLIMITED_LABEL ?? UNLIMITED_FALLBACK}
        </span>
      </label>

      <label className="inline-flex items-center gap-2 text-sm font-bold">
        <input
          type="radio"
          name={`${fieldKey}_mode`}
          aria-label={`${FIELD_LABEL[fieldKey]} 값 지정`}
          className="accent-primary"
          checked={mode === "value"}
          disabled={disabled}
          onChange={() => onChange({ [`${fieldKey}_mode`]: "value" })}
        />
        <span className="w-40">
          <Input
            type={type}
            aria-label={FIELD_LABEL[fieldKey]}
            min={type === "number" ? 1 : undefined}
            value={value ?? ""}
            disabled={disabled || mode !== "value"}
            onChange={(e) =>
              onChange({
                [fieldKey]:
                  type === "number"
                    ? e.target.value.replace(/[^0-9]/g, "")
                    : e.target.value,
              })
            }
            className={INPUT_CLASS}
          />
        </span>
      </label>

      {disabled && (
        <span className="text-xs font-bold text-gray-500">
          {MAX_USES_PER_USER_DERIVED_HINT_TEXT}
        </span>
      )}
    </div>
  );
}
