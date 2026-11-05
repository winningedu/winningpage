// W13 학생 조회와 이력 탭. 담임은 담당 학급만, 관리자는 전교를 보며(서버가 범위와 이름 가림을 정한다) 관리자만 직접 변경한다.

import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EmptyMessage from "../EmptyMessage";
import Notice from "../Notice";
import Pagination from "../Pagination";
import { useConsoleMe } from "../useConsoleMe";
import { slotLabel } from "./format";
import NameCell from "./NameCell";
import StudentFilters from "./StudentFilters";
import { useClasses } from "./useClasses";
import { usePagedList } from "./usePagedList";
import { usePageParam } from "./usePageParam";

const PAGE_SIZE = 50;
const FOOTNOTE = "담임은 현재 반만, 관리자는 전교가 보여요";

export interface StudentItem {
  studentId: string;
  name: string;
  grade: string | null;
  groupName: string | null;
  history: {
    schoolYear: number;
    grade: string | null;
    groupName: string | null;
    className: string | null;
  }[];
  servicesUsed: number;
  servicesTotal: number;
  enrollment: {
    grade: string | null;
    groupId: string | null;
    classId: string | null;
    className: string | null;
    number: number | null;
    version: number;
  };
}

const historyLabel = (item: StudentItem) =>
  item.history
    .map((h) => `${h.schoolYear} ${slotLabel({ ...h, number: null })}`)
    .join(" / ");

export default function StudentListTab() {
  const { me } = useConsoleMe();
  const [page, setPage] = usePageParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = {
    grade: searchParams.get("grade") ?? "",
    groupId: searchParams.get("groupId") ?? "",
    classId: searchParams.get("classId") ?? "",
    q: searchParams.get("q") ?? "",
  };
  const classes = useClasses();
  const list = usePagedList<StudentItem>(
    "/api/console/students/history",
    filters,
    page,
    false,
  );
  const admin = me.kind !== "homeroom";
  if (list.isError)
    return <Notice tone="Danger">학생 목록을 불러오지 못했어요</Notice>;
  if (!list.data || !classes.data) return null;
  return (
    <section className="flex flex-col">
      <StudentFilters
        classes={classes.data}
        initial={filters}
        onSearch={(values) =>
          setSearchParams({
            tab: "students",
            ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
          })
        }
      />
      <h2 className="pt-5 pb-4 text-app-card-title font-bold text-ink-strong">
        {`검색 결과 ${list.data.total}명`}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>학년그룹</TableHead>
            <TableHead>학년그룹/반 이력</TableHead>
            <TableHead>이용 서비스 수</TableHead>
            {admin && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data.items.map((item) => (
            <TableRow key={item.studentId}>
              <TableCell>
                <NameCell name={item.name} />
              </TableCell>
              <TableCell>
                {slotLabel({
                  grade: item.grade,
                  groupName: item.groupName,
                  className: null,
                  number: null,
                })}
              </TableCell>
              <TableCell>{historyLabel(item)}</TableCell>
              <TableCell>{`${item.servicesUsed}/${item.servicesTotal}`}</TableCell>
              {admin && (
                <TableCell>
                  <Button
                    type="button"
                    className="h-8 rounded-lg bg-surface-muted px-3 text-app-label font-semibold text-ink-strong hover:bg-surface-muted"
                  >
                    직접 변경
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {list.data.items.length === 0 && (
        <EmptyMessage body="찾는 학생이 없어요. 이름이나 학년그룹, 반을 바꿔 보세요" />
      )}
      <p className="pt-3 text-app-caption text-ink-sub">{FOOTNOTE}</p>
      {list.data.pageCount > 0 && (
        <Pagination
          page={list.data.page}
          pageCount={list.data.pageCount}
          total={list.data.total}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      )}
    </section>
  );
}
