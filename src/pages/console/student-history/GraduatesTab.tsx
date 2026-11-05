// W13 졸업생 탭(관리자). 졸업 학년도를 고르지 않고 들어오면 서버가 가장 최근 졸업 학년도로 응답한다.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import FilterSelect from "../FilterSelect";
import LoadMore from "../LoadMore";
import Notice from "../Notice";
import Pagination from "../Pagination";
import { slotLabel } from "./format";
import HistoryDialog from "./HistoryDialog";
import NameCell from "./NameCell";
import { usePagedList } from "./usePagedList";
import { filterKey, usePageParam } from "./usePageParam";

const PAGE_SIZE = 50;
const FOOTNOTE = "졸업생의 학년그룹과 반 이력은 졸업 후 2년 동안 보관해요.";

interface GraduateItem {
  studentId: string;
  name: string;
  graduatedYear: number;
  last: {
    grade: string | null;
    className: string | null;
    number: number | null;
  };
  history: {
    schoolYear: number;
    grade: string | null;
    className: string | null;
  }[];
}

const lastLabel = (g: GraduateItem) =>
  slotLabel({ ...g.last, groupName: null });
const historyLabel = (g: GraduateItem) =>
  g.history
    .map(
      (h) =>
        `${h.schoolYear} ${slotLabel({ ...h, groupName: null, number: null })}`,
    )
    .join(" / ");

interface GraduateFiltersProps {
  years: number[];
  initialYear: string;
  initialQ: string;
  onSearch: (values: { year: string; q: string }) => void;
}

// 값을 고르는 동안은 칸에만 두고 "검색"을 눌러야 조회한다. 주소가 바뀌면 key 로 다시 만들어 칸을 맞춘다.
function GraduateFilters({
  years,
  initialYear,
  initialQ,
  onSearch,
}: GraduateFiltersProps) {
  const [year, setYear] = useState(initialYear);
  const [q, setQ] = useState(initialQ);
  return (
    <div className="flex flex-wrap items-center gap-2.5 py-6">
      <FilterSelect
        label="졸업 학년도"
        value={year}
        options={years.map((y) => ({
          value: String(y),
          label: `${y}학년도`,
        }))}
        onChange={setYear}
      />
      <Input
        value={q}
        placeholder="이름 검색"
        onChange={(e) => setQ(e.target.value)}
        className="h-11 w-full min-w-0 rounded-lg border-line px-4 text-app-label md:h-10 md:w-[16.25rem]"
      />
      <Button
        type="button"
        onClick={() => onSearch({ year, q })}
        className="h-11 rounded-lg px-5 text-app-label font-semibold md:h-10"
      >
        검색
      </Button>
    </div>
  );
}

interface GraduatesTabProps {
  /** 서버가 쓴 졸업 학년도(졸업생이 없으면 null). 화면 머리의 빵부스러기에 쓴다. */
  onYear: (year: number | null) => void;
}

export default function GraduatesTab({ onYear }: GraduatesTabProps) {
  const mobile = useIsMobile();
  const [page, setPage] = usePageParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlYear = searchParams.get("year") ?? "";
  const q = searchParams.get("q") ?? "";
  const [opened, setOpened] = useState<GraduateItem | null>(null);
  const list = usePagedList<
    GraduateItem,
    { year: number | null; years: number[] }
  >("/api/console/graduates", { year: urlYear, q }, page, mobile);

  const serverYear = list.data?.year;
  useEffect(() => {
    if (serverYear !== undefined) onYear(serverYear);
  }, [serverYear, onYear]);

  if (list.isError)
    return <Notice tone="Danger">졸업생 목록을 불러오지 못했어요</Notice>;
  if (!list.data) return null;
  // 주소에 학년도가 없으면 서버가 쓴 최근 졸업 학년도다.
  const year = urlYear || String(list.data.year ?? "");
  return (
    <section className="flex flex-col">
      <GraduateFilters
        key={filterKey(searchParams)}
        years={list.data.years}
        initialYear={year}
        initialQ={q}
        onSearch={(next) =>
          setSearchParams({
            tab: "graduates",
            ...(next.year && { year: next.year }),
            ...(next.q && { q: next.q }),
          })
        }
      />
      <h2 className="pt-5 pb-4 text-app-card-title font-bold text-ink-strong">
        {`검색 결과 ${list.data.total}명`}
      </h2>
      {mobile ? (
        <div className="flex flex-col">
          {list.data.items.map((item) => (
            <div
              key={item.studentId}
              className="flex flex-col gap-3 border-b border-line pt-4 pb-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex flex-col gap-1">
                  <NameCell name={item.name} />
                  <span className="text-app-caption text-ink-sub">
                    {`마지막 학급 ${lastLabel(item)}`}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-app-caption text-ink-sub">
                    졸업 학년도
                  </span>
                  <span className="text-app-label font-semibold text-ink">
                    {`${item.graduatedYear}학년도`}
                  </span>
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-app-caption text-ink-sub">
                  학년그룹/반 이력
                </span>
                <span className="text-right text-app-label font-semibold text-ink">
                  {historyLabel(item)}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => setOpened(item)}
                className="h-11 w-full rounded-lg bg-surface-muted text-app-label font-semibold text-primary hover:bg-surface-muted"
              >
                이력 보기
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>졸업 학년도</TableHead>
              <TableHead>마지막 학년그룹/반/번호</TableHead>
              <TableHead>학년그룹/반 이력</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data.items.map((item) => (
              <TableRow key={item.studentId}>
                <TableCell>
                  <NameCell name={item.name} />
                </TableCell>
                <TableCell>{`${item.graduatedYear}학년도`}</TableCell>
                <TableCell>{lastLabel(item)}</TableCell>
                <TableCell>{historyLabel(item)}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    onClick={() => setOpened(item)}
                    className="h-8 rounded-lg bg-surface-muted px-3 text-app-label font-semibold text-primary hover:bg-surface-muted"
                  >
                    이력 보기
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="pt-3 text-app-caption text-ink-sub">{FOOTNOTE}</p>
      {mobile ? (
        <LoadMore
          shown={list.data.items.length}
          total={list.data.total}
          unit="명"
          onMore={list.fetchMore}
        />
      ) : (
        list.data.pageCount > 0 && (
          <Pagination
            page={list.data.page}
            pageCount={list.data.pageCount}
            total={list.data.total}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        )
      )}
      {opened && (
        <HistoryDialog
          studentId={opened.studentId}
          listName={opened.name}
          graduate
          onClose={() => setOpened(null)}
        />
      )}
    </section>
  );
}
