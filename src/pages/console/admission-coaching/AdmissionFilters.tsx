// W10 조회 칸. 학년그룹은 3학년(중3, 고3)만 고를 수 있고, 값을 고르는 동안은 칸에만 두고 "조회"를 눌러야 읽는다.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MIXED_GRADE } from "../classLabel";
import FilterSelect from "../FilterSelect";
import { type ClassOption, classesOf } from "../useClasses";
import { useGroupOptions } from "../useGroups";

export interface AdmissionFilterValues {
  grade: string;
  groupId: string;
  classId: string;
}

interface Props {
  /** 중3, 고3 학급과 학년 없는 다학년 학급. */
  classes: ClassOption[];
  admin: boolean;
  initial: AdmissionFilterValues;
  onSearch: (values: AdmissionFilterValues) => void;
}

const ALL = { value: "", label: "전체" };

export default function AdmissionFilters({
  classes,
  admin,
  initial,
  onSearch,
}: Props) {
  const [values, setValues] = useState(initial);
  const change = (patch: Partial<AdmissionFilterValues>) =>
    setValues((prev) => ({ ...prev, ...patch }));
  const groups = useGroupOptions(classes, values.grade, values.groupId);
  const grades = [
    ...new Set(classes.flatMap((c) => (c.grade ? [c.grade] : []))),
  ];
  // 다학년 학급에는 어느 학년의 학생도 있을 수 있어 학년을 골라도 반 선택지에 남긴다.
  const classOptions = [
    ...classesOf(classes, values.grade, values.groupId),
    ...(values.grade ? classesOf(classes, MIXED_GRADE, values.groupId) : []),
  ];
  // 중3과 고3이 함께 있으면 둘을 가려 고르게 한다. 빈 값은 두 학년 모두다.
  const gradeOptions = [
    { value: "", label: admin ? "3학년만" : "3학년" },
    ...(grades.length > 1 ? grades.map((g) => ({ value: g, label: g })) : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2.5 py-6">
      <FilterSelect
        label="학년그룹"
        value={values.grade}
        options={gradeOptions}
        onChange={(grade) => change({ grade, groupId: "", classId: "" })}
      />
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
      <FilterSelect
        label="반"
        value={values.classId}
        options={[
          ALL,
          ...classOptions.map((c) => ({
            value: c.id,
            label: `${c.name}반`,
          })),
        ]}
        onChange={(classId) => change({ classId })}
      />
      <Button
        type="button"
        onClick={() => onSearch(values)}
        className="h-11 rounded-lg px-5 text-app-label font-semibold md:h-10 md:w-[4.5rem]"
      >
        조회
      </Button>
    </div>
  );
}
