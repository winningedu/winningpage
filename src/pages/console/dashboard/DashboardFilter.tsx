// 우측 위 조회(교 #22, #224). 학년그룹, 그룹, 반을 고르고 "조회"를 눌러야 적용한다.
// 학년그룹을 고르기 전에는 반을 고를 수 없다(교 #151).

import { Button } from "@/components/ui/button";
import FilterSelect from "../FilterSelect";
import { type ClassOption, classesOf, gradesOf } from "../useClasses";
import { useGradeLabel } from "../useConsoleMe";
import { useGroupOptions } from "../useGroups";
import type { DashboardFilterValue } from "./useDashboard";

interface DashboardFilterProps {
  classes: ClassOption[];
  value: DashboardFilterValue;
  onChange: (value: DashboardFilterValue) => void;
  onSubmit: () => void;
}

const ALL = { value: "", label: "전체" };

export default function DashboardFilter({
  classes,
  value,
  onChange,
  onSubmit,
}: DashboardFilterProps) {
  const gradeLabel = useGradeLabel();
  const gradeChosen = value.grade !== "";
  const groups = useGroupOptions(classes, value.grade, value.groupId);
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <FilterSelect
        label="학년그룹"
        value={value.grade}
        options={[
          ALL,
          ...gradesOf(classes).map((g) => ({ value: g, label: gradeLabel(g) })),
        ]}
        onChange={(grade) => onChange({ grade, groupId: "", classId: "" })}
      />
      <FilterSelect
        label="그룹"
        value={value.groupId}
        options={[
          ALL,
          ...groups.map((g) => ({
            value: g.id,
            label: g.name,
          })),
        ]}
        onChange={(groupId) => onChange({ ...value, groupId, classId: "" })}
      />
      <FilterSelect
        label="반"
        value={value.classId}
        disabled={!gradeChosen}
        options={
          gradeChosen
            ? [
                ALL,
                ...classesOf(classes, value.grade, value.groupId).map((c) => ({
                  value: c.id,
                  label: `${c.name}반`,
                })),
              ]
            : [{ value: "", label: "학년그룹을 먼저 골라요" }]
        }
        onChange={(classId) => onChange({ ...value, classId })}
      />
      <Button type="submit" className="h-10 md:h-9">
        조회
      </Button>
    </form>
  );
}
