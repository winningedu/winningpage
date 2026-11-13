// W14b 개별 등록과 W16a 담당 추가가 함께 쓰는 학급 입력 한 줄. 학년그룹, (그룹이 있으면) 그룹, 반.
// 없는 학급은 서버가 만든다(fn_class_ensure)라 반은 목록에서 고르지 않고 적는다.

import FilterSelect from "../FilterSelect";
import TextField from "../TextField";

export const GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"] as const;

export interface ClassInput {
  grade: string;
  groupId: string;
  name: string;
}

export const EMPTY_CLASS: ClassInput = { grade: "", groupId: "", name: "" };

/** 비어 있는 줄은 버리고 서버 모양으로 바꾼다. 줄이 하나라도 덜 채워졌으면 null. */
export function toClassBody(
  rows: ClassInput[],
): { grade: string; name: string; groupId?: string }[] | null {
  const filled = rows.filter((r) => r.grade !== "" || r.name.trim() !== "");
  if (filled.some((r) => r.grade === "" || r.name.trim() === "")) return null;
  return filled.map((r) => ({
    grade: r.grade,
    name: r.name.trim(),
    ...(r.groupId ? { groupId: r.groupId } : {}),
  }));
}

interface ClassRowFieldsProps {
  value: ClassInput;
  groups: { id: string; name: string }[];
  onChange: (value: ClassInput) => void;
}

export default function ClassRowFields({
  value,
  groups,
  onChange,
}: ClassRowFieldsProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <FilterSelect
        variant="stacked"
        label="학년그룹"
        value={value.grade}
        options={[
          { value: "", label: "선택" },
          ...GRADES.map((g) => ({ value: g, label: g })),
        ]}
        onChange={(grade) => onChange({ ...value, grade })}
      />
      {groups.length > 0 && (
        <FilterSelect
          variant="stacked"
          label="그룹"
          value={value.groupId}
          options={[
            { value: "", label: "없음" },
            ...groups.map((g) => ({ value: g.id, label: g.name })),
          ]}
          onChange={(groupId) => onChange({ ...value, groupId })}
        />
      )}
      <TextField
        label="반"
        value={value.name}
        placeholder="예: 3반"
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
    </div>
  );
}
