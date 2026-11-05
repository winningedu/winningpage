// W10 입시 상담코칭. 교사 콘솔 /teacher/admission-coaching. 중3, 고3 학생만 보이고(교 #48, #215)
// 담당 학급에 3학년이 없으면 안내만 보인다(교 #148). 코칭 버튼은 그 학생의 개인종합코칭으로 간다.
// 상담 상태는 4가지 중 하나를 눌러 정하고(교 #51, 결정 2) 바로 보이게 한 뒤 저장하며, 저장하지 못하면 되돌리고 토스트로 알린다.
// 필터와 쪽은 쿼리스트링에 둔다.

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { consoleRequest } from "../api";
import Chip from "../Chip";
import { kstDotDate } from "../date";
import EmptyMessage from "../EmptyMessage";
import LoadMore from "../LoadMore";
import { CONSOLE_BASE } from "../menu";
import NameCell from "../NameCell";
import Notice from "../Notice";
import PageHeader from "../PageHeader";
import Pagination from "../Pagination";
import { URGENCY } from "../service-status/columns";
import { useToast } from "../Toast";
import { useClasses } from "../useClasses";
import { useConsoleMe } from "../useConsoleMe";
import { usePagedList } from "../usePagedList";
import { filterKey, usePageParam } from "../usePageParam";
import AdmissionFilters from "./AdmissionFilters";
import StatusToggle, { type CounselStatus } from "./StatusToggle";

const PAGE_SIZE = 50;
const ADMISSION_GRADES = ["중3", "고3"];
const NOT_GRADE3 =
  "담당 학급에 중3, 고3 학생이 없습니다. 입시 상담코칭은 입시를 앞둔 중3, 고3 학생을 위한 화면입니다. 다른 학년 학생의 학습코칭은 개인종합코칭에서 볼 수 있습니다";

interface Target {
  university: string;
  department: string;
}

interface AdmissionItem {
  studentId: string;
  name: string;
  grade: string;
  groupName: string | null;
  className: string;
  number: number | null;
  idealTarget: Target | null;
  minTarget: Target | null;
  execScore: number | null;
  urgency: string | null;
  counselStatus: CounselStatus;
  counselChangedAt: string | null;
}

const SAVE_FAILED = "상담 상태를 저장하지 못했어요. 다시 시도해 주세요";

/** 변경 일자는 KST 날짜로 "2026.10.28", 없으면 "-". */
const changedDate = (iso: string | null) => (iso ? kstDotDate(iso) : "-");

/** "3학년/3반", 그룹이 있으면 "3학년-A레벨/3반". 중3 은 "중3" 으로 가린다. */
function slot(item: AdmissionItem) {
  const grade = item.grade === "중3" ? "중3" : "3학년";
  return `${item.groupName ? `${grade}-${item.groupName}` : grade}/${item.className}반`;
}

const target = (t: Target | null) =>
  t ? `${t.university} ${t.department}`.trim() : "미가입";

function Urgency({ value }: { value: string | null }) {
  const u = value ? URGENCY[value] : undefined;
  return u ? (
    <Chip tone={u.tone}>{u.label}</Chip>
  ) : (
    <span className="text-ink-sub">-</span>
  );
}

export default function AdmissionCoachingPage() {
  const { me } = useConsoleMe();
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = usePageParam();
  const classes = useClasses();
  const admin = me.kind !== "homeroom";
  const filters = {
    grade: searchParams.get("grade") ?? "",
    groupId: searchParams.get("groupId") ?? "",
    classId: searchParams.get("classId") ?? "",
  };
  const list = usePagedList<AdmissionItem, { hasGrade3InScope: boolean }>(
    "/api/console/admission-coaching",
    filters,
    page,
    mobile,
  );
  const admissionClasses = (classes.data ?? []).filter((c) =>
    ADMISSION_GRADES.includes(c.grade),
  );
  const className = admissionClasses.find(
    (c) => c.id === filters.classId,
  )?.name;
  const breadcrumb = [
    me.tenant.name,
    "3학년",
    ...(className ? [`${className}반`] : []),
  ];
  const toast = useToast();
  // 저장 전후에 목록을 다시 읽지 않고 고른 값을 바로 보이려고 학생별로 덮어쓴다.
  const [edits, setEdits] = useState<
    Record<string, { status: CounselStatus; changedAt: string | null }>
  >({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const counselOf = (item: AdmissionItem) =>
    edits[item.studentId] ?? {
      status: item.counselStatus,
      changedAt: item.counselChangedAt,
    };
  const changeStatus = async (item: AdmissionItem, status: CounselStatus) => {
    const before = counselOf(item);
    setEdits((e) => ({
      ...e,
      [item.studentId]: { status, changedAt: before.changedAt },
    }));
    setSaving((s) => new Set(s).add(item.studentId));
    const res = await consoleRequest("/api/console/counsel-status", {
      method: "PUT",
      body: { studentId: item.studentId, status },
    });
    setSaving((s) => {
      const next = new Set(s);
      next.delete(item.studentId);
      return next;
    });
    if (res.status === 200) {
      const saved = res.body as { changedAt: string | null };
      setEdits((e) => ({
        ...e,
        [item.studentId]: { status, changedAt: saved.changedAt },
      }));
      return;
    }
    setEdits((e) => ({ ...e, [item.studentId]: before }));
    toast.show({ tone: "Error", message: SAVE_FAILED });
  };
  const statusToggle = (item: AdmissionItem) => (
    <StatusToggle
      label={`${item.name} 상담 상태`}
      value={counselOf(item).status}
      disabled={saving.has(item.studentId)}
      onChange={(status) => void changeStatus(item, status)}
    />
  );
  const openCoaching = (item: AdmissionItem) =>
    navigate(`${CONSOLE_BASE}/coaching?studentId=${item.studentId}`);

  return (
    <>
      <PageHeader
        title="입시 상담코칭"
        subtitle="입시를 앞둔 중3과 고3 학생의 목표와 진단 현황을 확인합니다"
        breadcrumb={breadcrumb}
      />
      <div className="px-4 pb-24 md:px-8 lg:px-12">
        {classes.data && (
          <AdmissionFilters
            key={filterKey(searchParams)}
            classes={admissionClasses}
            admin={admin}
            initial={filters}
            onSearch={(values) =>
              setSearchParams(
                Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
              )
            }
          />
        )}
        {list.isError && (
          <Notice tone="Danger">입시 상담코칭 목록을 불러오지 못했어요</Notice>
        )}
        {list.data && !list.data.hasGrade3InScope && (
          <EmptyMessage body={NOT_GRADE3} />
        )}
        {list.data?.hasGrade3InScope && (
          <section className="flex flex-col">
            <Notice tone="Info">
              상담 메모는 개인종합코칭의 교사 메모에 써 주세요
            </Notice>
            <h2 className="pt-5 pb-4 text-app-card-title font-bold text-ink-strong">
              {`조회 결과 ${list.data.total}명`}
            </h2>
            {mobile ? (
              <div className="flex flex-col">
                {list.data.items.map((item) => (
                  <article
                    key={item.studentId}
                    className="flex flex-col gap-3 border-b border-line py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <NameCell name={item.name} />
                        <span className="text-app-caption text-ink-sub">
                          {slot(item)}
                        </span>
                      </div>
                      <Urgency value={item.urgency} />
                    </div>
                    <Row
                      label="이상 목표대학"
                      value={target(item.idealTarget)}
                    />
                    <Row label="최소 목표대학" value={target(item.minTarget)} />
                    <Row
                      label="학습 실행 역량"
                      value={
                        item.execScore === null
                          ? "미진단"
                          : `${item.execScore}점`
                      }
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="shrink-0 text-app-caption text-ink-sub">
                        상담 상태
                      </span>
                      {statusToggle(item)}
                    </div>
                    <Row
                      label="변경 일자"
                      value={changedDate(counselOf(item).changedAt)}
                    />
                    <CoachButton onClick={() => openCoaching(item)} full />
                  </article>
                ))}
              </div>
            ) : (
              <Table className="min-w-[66.375rem]">
                <TableHeader>
                  <TableRow>
                    {[
                      "학생",
                      "학년그룹/반",
                      "이상 목표대학",
                      "최소 목표대학",
                      "학습 실행 역량",
                      "학습진단 긴급도",
                      "상담 상태",
                      "변경 일자",
                      "코칭",
                    ].map((label) => (
                      <TableHead
                        key={label}
                        className="text-app-caption text-ink-sub"
                      >
                        {label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((item) => (
                    <TableRow key={item.studentId} className="h-[3.25rem]">
                      <TableCell>
                        <NameCell name={item.name} />
                      </TableCell>
                      <TableCell className="text-app-label text-ink">
                        {slot(item)}
                      </TableCell>
                      <TableCell className="text-app-label text-ink">
                        {target(item.idealTarget)}
                      </TableCell>
                      <TableCell className="text-app-label text-ink">
                        {target(item.minTarget)}
                      </TableCell>
                      <TableCell className="text-app-label text-ink">
                        {item.execScore === null
                          ? "미진단"
                          : `${item.execScore}점`}
                      </TableCell>
                      <TableCell>
                        <Urgency value={item.urgency} />
                      </TableCell>
                      <TableCell>{statusToggle(item)}</TableCell>
                      <TableCell className="text-app-label text-ink">
                        {changedDate(counselOf(item).changedAt)}
                      </TableCell>
                      <TableCell>
                        <CoachButton onClick={() => openCoaching(item)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-app-caption text-ink-sub">{label}</span>
      <span className="text-right text-app-label font-semibold text-ink-strong">
        {value}
      </span>
    </div>
  );
}

function CoachButton({
  onClick,
  full,
}: {
  onClick: () => void;
  full?: boolean;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={
        full
          ? "h-11 w-full rounded-lg bg-surface-muted text-app-label font-medium text-ink-strong hover:bg-surface-muted"
          : "h-10 rounded-lg bg-surface-muted px-3 text-app-label font-medium text-ink-strong hover:bg-surface-muted"
      }
    >
      코칭
    </Button>
  );
}
