// W13 졸업생 탭(관리자). 졸업 학년도를 고르지 않고 들어오면 가장 최근 졸업 학년도로 연다.

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
import FilterSelect from "../FilterSelect";
import LoadMore from "../LoadMore";
import Notice from "../Notice";
import Pagination from "../Pagination";
import { useMobileLayout } from "../useMobileLayout";
import { slotLabel } from "./format";
import HistoryDialog from "./HistoryDialog";
import NameCell from "./NameCell";
import { usePagedList } from "./usePagedList";
import { usePageParam } from "./usePageParam";

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

export default function GraduatesTab() {
  const mobile = useMobileLayout();
  const [page, setPage] = usePageParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlYear = searchParams.get("year") ?? "";
  const q = searchParams.get("q") ?? "";
  const [draftYear, setDraftYear] = useState<string | null>(null);
  const [draftQ, setDraftQ] = useState(q);
  const [opened, setOpened] = useState<GraduateItem | null>(null);
  const list = usePagedList<GraduateItem, { years: number[] }>(
    "/api/console/graduates",
    { year: urlYear, q },
    page,
    mobile,
  );

  const latest = list.data?.years[0];
  // 학년도를 안 골랐으면 가장 최근 학년도로 바꿔 다시 불러온다.
  useEffect(() => {
    if (urlYear || latest === undefined) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("year", String(latest));
        return next;
      },
      { replace: true },
    );
  }, [urlYear, latest, setSearchParams]);

  if (list.isError)
    return <Notice tone="Danger">졸업생 목록을 불러오지 못했어요</Notice>;
  if (!list.data || (!urlYear && latest !== undefined)) return null;
  const year = draftYear ?? urlYear;
  return (
    <section className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2.5 py-6">
        <FilterSelect
          label="졸업 학년도"
          value={year}
          options={list.data.years.map((y) => ({
            value: String(y),
            label: `${y}학년도`,
          }))}
          onChange={setDraftYear}
        />
        <Input
          value={draftQ}
          placeholder="이름 검색"
          onChange={(e) => setDraftQ(e.target.value)}
          className="h-11 w-full min-w-0 rounded-lg border-line px-4 text-app-label md:h-10 md:w-[16.25rem]"
        />
        <Button
          type="button"
          onClick={() =>
            setSearchParams({
              tab: "graduates",
              ...(year && { year }),
              ...(draftQ && { q: draftQ }),
            })
          }
          className="h-11 rounded-lg px-5 text-app-label font-semibold md:h-10"
        >
          검색
        </Button>
      </div>
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
