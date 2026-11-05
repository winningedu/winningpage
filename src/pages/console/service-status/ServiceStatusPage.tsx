// W8 서비스별 현황표. 교사 콘솔 /teacher/service-status/:service. 고른 서비스를 쓰는 학생만 보이고
// 행을 누르면 그 학생의 개인종합코칭으로 간다(결정 40). 필터와 쪽은 쿼리스트링에 둔다.

import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { classLabel, sortClasses } from "../classLabel";
import EmptyMessage from "../EmptyMessage";
import { dotDate } from "../enrollment/format";
import LoadMore from "../LoadMore";
import { CONSOLE_BASE } from "../menu";
import Notice from "../Notice";
import PageHeader from "../PageHeader";
import Pagination from "../Pagination";
import { useClasses } from "../student-history/useClasses";
import { usePagedList } from "../student-history/usePagedList";
import { filterKey, usePageParam } from "../student-history/usePageParam";
import Tabs from "../Tabs";
import { useConsoleMe } from "../useConsoleMe";
import { COLUMNS } from "./columns";
import StatusFilters from "./StatusFilters";
import { type StatusItem, TABS, type TabKey } from "./tabs";

const PAGE_SIZE = 50;
const BASE = `${CONSOLE_BASE}/service-status`;
const ALIGN = { right: "text-right", center: "text-center" } as const;

export default function ServiceStatusPage() {
  const { service } = useParams();
  const requested = TABS.find((t) => t.key === service);
  if (service !== undefined && !requested) {
    return <Navigate to={BASE} replace />;
  }
  return <StatusBody tab={requested ?? TABS[0]} />;
}

function StatusBody({ tab }: { tab: (typeof TABS)[number] }) {
  const { me } = useConsoleMe();
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = usePageParam();
  const classes = useClasses();
  const filters = {
    grade: searchParams.get("grade") ?? "",
    classId: searchParams.get("classId") ?? "",
    q: searchParams.get("q") ?? "",
  };
  const list = usePagedList<
    StatusItem,
    { asOf: string; orgType: string | null }
  >(
    "/api/console/service-status",
    { service: tab.api, ...filters },
    page,
    mobile,
  );

  const columns = COLUMNS[tab.key as TabKey];
  const openCoaching = (item: StatusItem) =>
    navigate(`${CONSOLE_BASE}/coaching?studentId=${item.studentId}`);

  const scope =
    me.kind === "homeroom"
      ? me.classes.length > 0
        ? `담당 학급 ${sortClasses(me.classes).map(classLabel).join(", ")}`
        : null
      : list.data?.orgType === "학원"
        ? "학원 전체"
        : "학교 전체";
  const asOf =
    list.data && scope
      ? `집계 기준: ${scope}, ${dotDate(list.data.asOf)} 기준`
      : undefined;

  return (
    <>
      <PageHeader
        title="서비스별 현황표"
        subtitle="6개 서비스별 학생 진행 상황을 확인합니다"
        {...(asOf && { asOf })}
      />
      <Tabs
        items={TABS.map((t) => ({ key: t.key, label: t.label }))}
        value={tab.key}
        onChange={(key) => {
          const next = new URLSearchParams(searchParams);
          next.delete("page");
          navigate({
            pathname: `${BASE}/${key}`,
            search: next.toString(),
          });
        }}
      />
      <div className="px-4 pb-24 md:px-8 lg:px-12">
        {classes.data && (
          <StatusFilters
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
        {list.isError && (
          <Notice tone="Danger">현황표를 불러오지 못했어요</Notice>
        )}
        {list.data && (
          <section className="flex flex-col">
            <h2 className="pt-5 pb-4 text-app-card-title font-bold text-ink-strong">
              {`검색 결과 ${list.data.total}명`}
            </h2>
            {mobile ? (
              <div className="flex flex-col">
                {list.data.items.map((item) => (
                  <article
                    key={item.studentId}
                    className="flex flex-col gap-3 border-b border-line py-4"
                  >
                    {columns
                      .filter((c) => c.isName)
                      .map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => openCoaching(item)}
                          className="text-left"
                        >
                          {c.render(item)}
                        </button>
                      ))}
                    {columns
                      .filter((c) => !c.isName)
                      .map((c) => (
                        <div
                          key={c.label}
                          className="flex items-start justify-between gap-3"
                        >
                          <span className="shrink-0 text-app-caption text-ink-sub">
                            {c.label}
                          </span>
                          <span className="text-right text-app-label font-semibold text-ink">
                            {c.render(item)}
                          </span>
                        </div>
                      ))}
                  </article>
                ))}
              </div>
            ) : (
              <Table className="min-w-[51.25rem]">
                <TableHeader>
                  <TableRow>
                    {columns.map((c) => (
                      <TableHead
                        key={c.label}
                        className={cn(
                          "text-app-caption text-ink-sub",
                          c.align && ALIGN[c.align],
                        )}
                      >
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((item) => (
                    <TableRow
                      key={item.studentId}
                      onClick={() => openCoaching(item)}
                      className="h-[3.25rem] cursor-pointer"
                    >
                      {columns.map((c) => (
                        <TableCell
                          key={c.label}
                          className={cn(
                            "text-app-label text-ink",
                            c.align && ALIGN[c.align],
                          )}
                        >
                          {c.render(item)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {list.data.total === 0 && (
              <EmptyMessage body="이 서비스를 이용하는 학생이 없어요" />
            )}
            {tab.key === "goal" && list.data.total > 0 && (
              <p className="pt-4 text-app-body text-ink-sub">
                목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다
              </p>
            )}
            {list.data.total > 0 &&
              (mobile ? (
                <LoadMore
                  shown={list.data.items.length}
                  total={list.data.total}
                  unit="명"
                  onMore={list.fetchMore}
                />
              ) : (
                <Pagination
                  page={list.data.page}
                  pageCount={list.data.pageCount}
                  total={list.data.total}
                  pageSize={PAGE_SIZE}
                  onChange={setPage}
                />
              ))}
          </section>
        )}
      </div>
    </>
  );
}
