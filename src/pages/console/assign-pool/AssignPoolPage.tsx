// W12 미배정 목록(학교 관리자). 학급이 비어 있는 학생에게 학년그룹, 그룹, 반, 번호를 정해 배치한다.
// 필터는 학년그룹, 반, 이름 검색이다. 반은 동명 재학생 확인만 좁히고 학년그룹을 고른 뒤에만 열린다(결정 105). 상태는 쿼리스트링에 둔다.

import { useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import EmptyMessage from "../EmptyMessage";
import FilterSelect from "../FilterSelect";
import LoadMore from "../LoadMore";
import Notice from "../Notice";
import PageHeader from "../PageHeader";
import Pagination from "../Pagination";
import {
  type ClassOption,
  studentClassesOf,
  studentGradesOf,
  useClasses,
} from "../useClasses";
import { useGradeLabel } from "../useConsoleMe";
import { usePagedList } from "../usePagedList";
import { filterKey, usePageParam } from "../usePageParam";
import AssignPoolRow from "./AssignPoolRow";
import SameNameCheck from "./SameNameCheck";
import type { PoolStudent } from "./types";

const PAGE_SIZE = 50;
const EMPTY_MESSAGE =
  "미배정 학생이 없어요. 새 학생이 가입하거나 학년그룹 일괄 변경에서 반을 비운 학생이 생기면 여기에 나타나요";

type FilterValues = { grade: string; classId: string; q: string };

const ALL = { value: "", label: "전체" };

function Filters({
  classes,
  initial,
  onSearch,
}: {
  classes: ClassOption[];
  initial: FilterValues;
  onSearch: (values: FilterValues) => void;
}) {
  const gradeLabel = useGradeLabel();
  const [values, setValues] = useState(initial);
  const search = () => onSearch(values);
  return (
    <div className="flex flex-col gap-2 px-4 py-6 md:flex-row md:flex-wrap md:items-center md:gap-3 md:px-8 lg:px-12">
      <FilterSelect
        label="학년그룹"
        value={values.grade}
        options={[
          ALL,
          ...studentGradesOf(classes).map((g) => ({
            value: g,
            label: gradeLabel(g),
          })),
        ]}
        onChange={(grade) =>
          setValues((prev) => ({ ...prev, grade, classId: "" }))
        }
      />
      <FilterSelect
        label="반"
        value={values.classId}
        disabled={values.grade === ""}
        options={[
          ALL,
          ...studentClassesOf(classes, values.grade, "").map((c) => ({
            value: c.id,
            label: `${c.groupName ? `${c.groupName} ` : ""}${c.name}반`,
          })),
        ]}
        onChange={(classId) => setValues((prev) => ({ ...prev, classId }))}
      />
      <div className="flex gap-2">
        <Input
          value={values.q}
          placeholder="이름 검색"
          onChange={(e) =>
            setValues((prev) => ({ ...prev, q: e.target.value }))
          }
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
    </div>
  );
}

export default function AssignPoolPage() {
  const mobile = useIsMobile();
  const [page, setPage] = usePageParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const classes = useClasses();
  const filters: FilterValues = {
    grade: searchParams.get("grade") ?? "",
    classId: searchParams.get("classId") ?? "",
    q: searchParams.get("q") ?? "",
  };
  const list = usePagedList<PoolStudent>(
    "/api/console/assign-pool",
    filters,
    page,
    mobile,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = list.data;
  // 처음에는 첫 학생이 선택돼 있다. 선택한 학생이 목록에서 빠지면 다시 첫 학생이다.
  const selected =
    data?.items.find((s) => s.studentId === selectedId) ?? data?.items[0];

  return (
    <>
      <PageHeader
        title="미배정 목록"
        subtitle="학급이 정해지지 않은 학생을 학급에 배치합니다"
      />
      {classes.data && (
        <Filters
          key={filterKey(searchParams)}
          classes={classes.data}
          initial={filters}
          onSearch={(values) =>
            setSearchParams(
              Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
            )
          }
        />
      )}
      <section className="flex flex-col gap-4 px-4 pb-24 md:px-8 lg:px-12">
        {list.isError && (
          <Notice tone="Danger">
            미배정 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
          </Notice>
        )}
        {data && classes.data && (
          <>
            {selected && <SameNameCheck student={selected} />}
            <h2 className="pt-1 text-app-card-title font-bold text-ink-strong">
              {`미배정 학생 ${data.total}명`}
            </h2>
            {data.total === 0 ? (
              <EmptyMessage body={EMPTY_MESSAGE} />
            ) : mobile ? (
              <ul className="flex flex-col">
                {data.items.map((s) => (
                  <AssignPoolRow
                    key={s.studentId}
                    student={s}
                    classes={classes.data}
                    selected={s.studentId === selected?.studentId}
                    mobile
                    onSelect={() => setSelectedId(s.studentId)}
                  />
                ))}
              </ul>
            ) : (
              <section
                aria-label="미배정 학생 목록"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: 태블릿에서 가로로 밀리는 영역은 키보드 초점을 받아야 한다.
                tabIndex={0}
                className="overflow-x-auto"
              >
                <Table className="min-w-[53.5rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>이름</TableHead>
                      <TableHead className="text-right">
                        동명 재학생 수
                      </TableHead>
                      <TableHead>학년그룹</TableHead>
                      <TableHead>그룹</TableHead>
                      <TableHead>반</TableHead>
                      <TableHead>번호</TableHead>
                      <TableHead className="text-right">배치</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((s) => (
                      <AssignPoolRow
                        key={s.studentId}
                        student={s}
                        classes={classes.data}
                        selected={s.studentId === selected?.studentId}
                        mobile={false}
                        onSelect={() => setSelectedId(s.studentId)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}
            {mobile ? (
              <LoadMore
                shown={data.items.length}
                total={data.total}
                unit="명"
                onMore={list.fetchMore}
              />
            ) : (
              data.pageCount > 0 && (
                <Pagination
                  page={data.page}
                  pageCount={data.pageCount}
                  total={data.total}
                  pageSize={PAGE_SIZE}
                  onChange={setPage}
                />
              )
            )}
          </>
        )}
      </section>
    </>
  );
}
