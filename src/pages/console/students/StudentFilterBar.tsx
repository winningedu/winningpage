// W6 필터. 값을 고르는 동안은 칸에만 두고 "검색"을 눌러야 조회한다.
// 관리자와 학원은 반을 학년그룹을 고른 뒤에만 연다(교 #151). 학원은 그룹 칸이 더해진다.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import FilterSelect from "../FilterSelect";
import { type ClassOption, classesOf, gradesOf } from "../useClasses";
import { useGradeLabel } from "../useConsoleMe";
import { useGroupOptions } from "../useGroups";

export interface StudentFilterValues {
  grade: string;
  groupId: string;
  classId: string;
  q: string;
}

interface StudentFilterBarProps {
  classes: ClassOption[];
  initial: StudentFilterValues;
  /** 담임은 학년을 고르지 않아도 반을 고를 수 있다. */
  classNeedsGrade: boolean;
  showGroup: boolean;
  primaryClassId: string | null;
  special: boolean;
  onToggleSpecial: () => void;
  onSearch: (values: StudentFilterValues) => void;
}

const ALL = { value: "", label: "전체" };

export default function StudentFilterBar({
  classes,
  initial,
  classNeedsGrade,
  showGroup,
  primaryClassId,
  special,
  onToggleSpecial,
  onSearch,
}: StudentFilterBarProps) {
  const gradeLabel = useGradeLabel();
  const [values, setValues] = useState(initial);
  const groups = useGroupOptions(
    classes,
    values.grade,
    values.groupId,
    showGroup,
  );
  const change = (patch: Partial<StudentFilterValues>) =>
    setValues((prev) => ({ ...prev, ...patch }));
  const classDisabled = classNeedsGrade && values.grade === "";
  const search = () => onSearch(values);

  return (
    <div className="flex flex-col gap-2 px-4 py-6 md:flex-row md:flex-wrap md:items-center md:gap-3 md:px-8 lg:px-12">
      <div className="grid grid-cols-2 gap-2 md:flex md:gap-3">
        <FilterSelect
          label="학년그룹"
          value={values.grade}
          options={[
            ALL,
            ...gradesOf(classes).map((g) => ({
              value: g,
              label: gradeLabel(g),
            })),
          ]}
          onChange={(grade) => change({ grade, groupId: "", classId: "" })}
        />
        {showGroup && (
          <FilterSelect
            label="그룹"
            value={values.groupId}
            options={[
              ALL,
              ...groups.map((g) => ({
                value: g.id,
                label: g.name,
              })),
            ]}
            onChange={(groupId) => change({ groupId, classId: "" })}
          />
        )}
        <FilterSelect
          label="반"
          value={values.classId}
          disabled={classDisabled}
          options={[
            ALL,
            ...classesOf(classes, values.grade, values.groupId).map((c) => ({
              value: c.id,
              label: `${c.name}반${c.id === primaryClassId ? " (주)" : ""}`,
            })),
          ]}
          onChange={(classId) => change({ classId })}
        />
      </div>
      {classDisabled && (
        <p className="text-app-caption text-ink-sub">학년그룹을 먼저 골라요</p>
      )}
      <div className="flex gap-2">
        <Input
          value={values.q}
          placeholder="이름 검색"
          onChange={(e) => change({ q: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="h-11 min-w-0 flex-1 rounded-lg border-line px-4 text-app-label md:h-10 md:w-[16.25rem] md:flex-none"
        />
        <Button
          type="button"
          onClick={search}
          className="h-11 w-[4.5rem] rounded-lg px-5 text-app-label font-semibold md:h-10"
        >
          검색
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        aria-pressed={special}
        onClick={onToggleSpecial}
        className={cn(
          "h-11 rounded-lg border-line px-5 text-app-label font-semibold text-primary md:h-10",
          special && "bg-surface-info",
        )}
      >
        특이학생만
      </Button>
    </div>
  );
}
