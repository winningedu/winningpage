// W6 학생 관리. 탭과 필터, 쪽 번호는 쿼리스트링에 둔다(새로 고침과 뒤로 가기가 이어지게).
// 담임은 주 담당 반이 처음 필터로 채워지고(주소에 grade 가 없을 때), 관리자는 전교를 가린 이름으로 본다.

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { gradeLabel, primaryClass } from "../classLabel";
import EmptyMessage from "../EmptyMessage";
import LoadMore from "../LoadMore";
import { CONSOLE_BASE } from "../menu";
import Notice from "../Notice";
import PageHeader from "../PageHeader";
import Pagination from "../Pagination";
import Tabs from "../Tabs";
import { useClasses } from "../useClasses";
import { useConsoleMe } from "../useConsoleMe";
import { usePagedList } from "../usePagedList";
import { filterKey, usePageParam } from "../usePageParam";
import StudentCards from "./StudentCards";
import StudentDetailDialog from "./StudentDetailDialog";
import StudentEditDialog from "./StudentEditDialog";
import StudentFilterBar, { type StudentFilterValues } from "./StudentFilterBar";
import StudentTable from "./StudentTable";
import { SERVICES } from "./services";
import type { StudentListExtra, StudentRow } from "./types";

const PAGE_SIZE = 50;
const TABS = [
  { key: "all", label: "전체" },
  ...SERVICES.map(({ key, label }) => ({ key, label })),
  { key: "none", label: "서비스 미이용 학생" },
];
const SKELETON_ROWS = 8;

const SPECIAL_CRITERIA =
  "특이학생은 주간 목표시간 달성율이 기준에 못 미치거나, 학습진단 긴급도가 높음 이상이거나, 선생님이 직접 지정한 학생이에요";
const NO_STUDENTS_MESSAGE =
  "연결된 학생이 없습니다. 학생들이 가입하면 자동으로 표시됩니다";
const NO_MATCH_MESSAGE =
  "조건에 맞는 학생이 없습니다. 필터 조건을 조정해 보세요.";

function EmptyState({
  noStudents,
  onClear,
}: {
  noStudents: boolean;
  onClear: () => void;
}) {
  if (noStudents) return <EmptyMessage body={NO_STUDENTS_MESSAGE} />;
  return (
    <div className="flex flex-col items-center gap-4 pb-12">
      <EmptyMessage body={NO_MATCH_MESSAGE} />
      <Button
        type="button"
        variant="ghost"
        onClick={onClear}
        className="h-10 rounded-lg bg-surface-muted px-5 text-app-label font-semibold text-primary"
      >
        필터 지우기
      </Button>
    </div>
  );
}

export default function StudentListPage() {
  const { me } = useConsoleMe();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const [page, setPage] = usePageParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const classes = useClasses();
  const homeroom = me.kind === "homeroom";
  const primary = primaryClass(me.classes);

  const tab = TABS.find((t) => t.key === searchParams.get("tab"))?.key ?? "all";
  // 담임은 주소에 학년이 없을 때 주 담당 반으로 시작한다. 검색하면 값(비어 있어도)을 주소에 적는다.
  const useDefault = homeroom && primary && !searchParams.has("grade");
  const filters: StudentFilterValues = {
    grade: useDefault ? primary.grade : (searchParams.get("grade") ?? ""),
    groupId: searchParams.get("groupId") ?? "",
    classId: useDefault ? primary.id : (searchParams.get("classId") ?? ""),
    q: searchParams.get("q") ?? "",
  };
  const special = searchParams.get("special") === "1";
  const list = usePagedList<StudentRow, StudentListExtra>(
    "/api/console/students",
    {
      tab: tab === "all" ? undefined : tab,
      grade: filters.grade,
      groupId: filters.groupId,
      classId: filters.classId,
      q: filters.q,
      special: special ? "1" : undefined,
    },
    page,
    mobile,
  );
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const apply = (
    values: StudentFilterValues,
    nextTab: string,
    nextSpecial = special,
  ) =>
    setSearchParams({
      ...(nextTab !== "all" && { tab: nextTab }),
      ...(nextSpecial && { special: "1" }),
      grade: values.grade,
      ...Object.fromEntries(
        Object.entries(values).filter(([k, v]) => k !== "grade" && v),
      ),
    });

  const className = classes.data?.find((c) => c.id === filters.classId)?.name;
  const breadcrumb = filters.grade
    ? [
        me.tenant.name,
        gradeLabel(filters.grade),
        ...(className ? [`${className}반`] : []),
      ]
    : undefined;
  const data = list.data;
  const editing = data?.items.find((r) => r.studentId === editId);
  const academy = data?.orgType !== null && data?.orgType !== "학교";

  return (
    <>
      <PageHeader
        title="학생 관리"
        subtitle="학생을 조회하고 상세 정보를 확인합니다."
        {...(breadcrumb && { breadcrumb })}
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`${CONSOLE_BASE}/student-history`)}
            className="h-12 rounded-lg border-line px-6 text-base font-medium text-primary"
          >
            학년 변경 바로가기
          </Button>
        }
      />
      <Tabs items={TABS} value={tab} onChange={(key) => apply(filters, key)} />
      {classes.data && (
        <StudentFilterBar
          key={filterKey(searchParams)}
          classes={classes.data}
          initial={filters}
          classNeedsGrade={!homeroom}
          showGroup={academy}
          primaryClassId={primary?.id ?? null}
          special={special}
          onToggleSpecial={() => apply(filters, tab, !special)}
          onSearch={(values) => apply(values, tab)}
        />
      )}
      <section className="flex flex-col px-4 pb-24 md:px-8 lg:px-12">
        {list.isError && (
          <Notice tone="Danger">
            학생 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
          </Notice>
        )}
        {!data && !list.isError && (
          <div aria-busy="true" className="flex flex-col gap-4 pt-5">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 모양만 있는 자리표시 행이라 순서가 곧 정체성이다.
              <Skeleton key={i} className="h-[3.25rem] rounded" />
            ))}
          </div>
        )}
        {data && (
          <>
            {special && (
              <p className="pb-2 text-app-caption text-ink-sub">
                {SPECIAL_CRITERIA}
              </p>
            )}
            <h2 className="pt-5 pb-4 text-app-card-title font-bold text-ink-strong">
              {`검색 결과 ${data.total}명`}
            </h2>
            {data.total === 0 ? (
              <EmptyState
                noStudents={data.scopeTotal === 0}
                onClear={() =>
                  apply(
                    { grade: "", groupId: "", classId: "", q: "" },
                    "all",
                    false,
                  )
                }
              />
            ) : mobile ? (
              <StudentCards
                rows={data.items}
                academy={academy}
                showEdit={homeroom}
                showReasons={special}
                execRatePct={data.specialExecRatePct}
                onOpen={setOpenedId}
                onEdit={setEditId}
              />
            ) : (
              <StudentTable
                rows={data.items}
                academy={academy}
                showEdit={homeroom}
                showReasons={special}
                execRatePct={data.specialExecRatePct}
                onOpen={setOpenedId}
                onEdit={setEditId}
              />
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
      {editing && classes.data && (
        <StudentEditDialog
          student={editing}
          classes={classes.data}
          onClose={() => setEditId(null)}
        />
      )}
      {openedId && (
        <StudentDetailDialog
          studentId={openedId}
          onClose={() => setOpenedId(null)}
        />
      )}
    </>
  );
}
