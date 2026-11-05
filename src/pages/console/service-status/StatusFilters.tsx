// W8 조회 칸. 학년그룹, 반, 이름 검색을 고르는 동안은 칸에만 두고 "검색"을 눌러야 조회한다.
// 반은 학년그룹을 고른 뒤에만 열린다(교 #151).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gradeLabel } from "../classLabel";
import FilterSelect from "../FilterSelect";
import {
  type ClassOption,
  classesOf,
  gradesOf,
} from "../student-history/useClasses";

export interface StatusFilterValues {
  grade: string;
  classId: string;
  q: string;
}

interface Props {
  classes: ClassOption[];
  initial: StatusFilterValues;
  onSearch: (values: StatusFilterValues) => void;
}

const ALL = { value: "", label: "전체" };

export default function StatusFilters({ classes, initial, onSearch }: Props) {
  const [values, setValues] = useState(initial);
  const change = (patch: Partial<StatusFilterValues>) =>
    setValues((prev) => ({ ...prev, ...patch }));

  return (
    <div className="flex flex-wrap items-center gap-2.5 py-6">
      <FilterSelect
        label="학년그룹"
        value={values.grade}
        options={[
          ALL,
          ...gradesOf(classes).map((g) => ({ value: g, label: gradeLabel(g) })),
        ]}
        onChange={(grade) => change({ grade, classId: "" })}
      />
      <FilterSelect
        label="반"
        value={values.classId}
        disabled={values.grade === ""}
        options={[
          ALL,
          ...classesOf(classes, values.grade, "").map((c) => ({
            value: c.id,
            label: `${c.groupName ? `${c.groupName} ` : ""}${c.name}반`,
          })),
        ]}
        onChange={(classId) => change({ classId })}
      />
      <Input
        value={values.q}
        placeholder="이름 검색"
        onChange={(e) => change({ q: e.target.value })}
        className="h-11 w-full min-w-0 rounded-lg border-line px-4 text-app-label md:h-10 md:w-[16.25rem]"
      />
      <Button
        type="button"
        onClick={() => onSearch(values)}
        className="h-11 rounded-lg px-5 text-app-label font-semibold md:h-10"
      >
        검색
      </Button>
    </div>
  );
}
