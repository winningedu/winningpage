// W7 이용현황. 교사 콘솔 /teacher/enrollment. 담임은 셸(ConsoleLayout)이 대시보드로 돌려보낸다.
// 학년, 반 조회는 서버가 준 전체 반 행을 화면에서 거른다(요약 합계도 보이는 행에서 낸다).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { consoleRequest } from "../api";
import { MIXED_GRADE } from "../classLabel";
import { dotDate } from "../date";
import EmptyMessage from "../EmptyMessage";
import FilterSelect from "../FilterSelect";
import LoadMore from "../LoadMore";
import Notice from "../Notice";
import PageHeader from "../PageHeader";
import Pagination from "../Pagination";
import { useToast } from "../Toast";
import { useGradeLabel } from "../useConsoleMe";
import ClassCards from "./ClassCards";
import ClassTable from "./ClassTable";
import EnrollmentSummaryCards from "./EnrollmentSummaryCards";
import { buildEnrollmentGrid, downloadEnrollmentXlsx } from "./exportGrid";
import { type EnrollmentSummary, totalsOf } from "./format";

const SUMMARY_KEY = ["console", "enrollment-summary"] as const;

async function fetchSummary(): Promise<EnrollmentSummary> {
  const res = await consoleRequest("/api/console/enrollment/summary");
  if (res.status !== 200) throw new Error(`enrollment summary ${res.status}`);
  return res.body as EnrollmentSummary;
}

const MAX_CAPACITY = 32767;
const PAGE_SIZE = 50;
const MOBILE_STEP = 20;

/** 입력한 글을 정원으로 읽는다. 빈 칸은 정원 없음(null), 1 이상의 정수가 아니면 null 이 아니라 읽기 실패다. */
function parseCapacity(text: string): { ok: boolean; value: number | null } {
  if (text.trim() === "") return { ok: true, value: null };
  const n = Number(text);
  const ok = Number.isInteger(n) && n >= 1 && n <= MAX_CAPACITY;
  return { ok, value: ok ? n : null };
}

export default function EnrollmentPage() {
  const gradeLabel = useGradeLabel();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const mobile = useIsMobile();
  const [page, setPage] = useState(1);
  const [shown, setShown] = useState(MOBILE_STEP);
  const summary = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: fetchSummary,
    retry: false,
  });
  const [grade, setGrade] = useState("");
  const [classId, setClassId] = useState("");
  const data = summary.data;
  const all = data?.classes ?? [];
  const rows = all.filter(
    (r) =>
      (!grade || (r.grade ?? MIXED_GRADE) === grade) &&
      (!classId || r.classId === classId),
  );
  const totals = totalsOf(rows);
  const picked = all.find((r) => r.classId === classId);
  const wholeLabel = data?.orgType === "학원" ? "학원 전체" : "학교 전체";
  const scopeLabel = picked
    ? `${gradeLabel(picked.grade)} ${picked.className}반`
    : grade
      ? gradeLabel(grade)
      : wholeLabel;
  const grades = [...new Set(all.map((r) => r.grade ?? MIXED_GRADE))];

  const empty = totals.total === 0;
  const visible = empty
    ? []
    : mobile
      ? rows.slice(0, shown)
      : rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const editProp = editing
    ? {
        edit: {
          values: edits,
          onChange: (id: string, v: string) =>
            setEdits((prev) => ({ ...prev, [id]: v })),
        },
      }
    : {};

  const parsed = all.map((r) => ({
    row: r,
    cap: parseCapacity(edits[r.classId] ?? ""),
  }));
  const invalid = parsed.some((p) => !p.cap.ok);

  const startEdit = () => {
    setEdits(
      Object.fromEntries(
        all.map((r) => [r.classId, r.capacity === null ? "" : `${r.capacity}`]),
      ),
    );
    setEditing(true);
  };

  const save = async () => {
    const items = parsed
      .filter((p) => p.cap.value !== p.row.capacity)
      .map((p) => ({ classId: p.row.classId, capacity: p.cap.value }));
    if (items.length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await consoleRequest("/api/console/classes/capacity", {
        method: "PATCH",
        body: { items },
      });
      if (res.status !== 200) throw new Error(`capacity ${res.status}`);
      await queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
      setEditing(false);
      toast.show({ tone: "Success", message: "정원을 저장했어요" });
    } catch {
      toast.show({
        tone: "Error",
        message: "정원을 저장하지 못했어요. 다시 시도해 주세요",
      });
    } finally {
      setSaving(false);
    }
  };

  // 출력 기록을 먼저 남긴 뒤에만 파일을 내려받는다(기록 없는 출력이 없게, 교 #227).
  const exportXlsx = async () => {
    if (!data) return;
    try {
      const res = await consoleRequest("/api/console/enrollment/export", {
        method: "POST",
        body: { classCount: rows.length },
      });
      if (res.status !== 200) throw new Error(`export log ${res.status}`);
      await downloadEnrollmentXlsx(
        buildEnrollmentGrid({
          rows,
          filter: {
            grade: `학년그룹: ${grade ? gradeLabel(grade) : "전체"}`,
            class: `반: ${picked ? `${picked.className}반` : "전체"}`,
          },
          asOf: data.asOf,
          scopeLabel,
          gradeLabel,
        }),
        data.asOf,
      );
    } catch {
      toast.show({
        tone: "Error",
        message: "엑셀을 만들지 못했어요. 다시 시도해 주세요",
      });
    }
  };

  const actions = editing ? (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => setEditing(false)}
        className="h-10 rounded-lg px-4 text-app-label font-semibold"
      >
        취소
      </Button>
      <Button
        type="button"
        disabled={invalid || saving}
        onClick={() => void save()}
        className="h-10 rounded-lg px-4 text-app-label font-semibold"
      >
        저장
      </Button>
    </div>
  ) : (
    <div className="flex gap-2">
      {!mobile && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void exportXlsx()}
          className="h-10 rounded-lg px-4 text-app-label font-semibold"
        >
          엑셀 출력
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={startEdit}
        className="h-10 rounded-lg px-4 text-app-label font-semibold"
      >
        정원 입력
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="이용현황"
        subtitle="학급별, 서비스별 이용 학생 수를 확인합니다"
        {...(data && !mobile && { actions })}
        {...(data && {
          asOf: `집계 기준: ${scopeLabel}, ${dotDate(data.asOf)} 기준`,
        })}
      />
      <div className="flex max-w-content flex-col gap-6 px-4 pb-24 md:px-8 lg:px-12">
        {summary.isError && (
          <Notice tone="Danger">
            이용현황을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
          </Notice>
        )}
        {data && (
          <>
            <EnrollmentSummaryCards totals={totals} scopeLabel={scopeLabel} />
            <div className="flex flex-wrap justify-end gap-2.5">
              <FilterSelect
                label="학년그룹"
                value={grade}
                options={[
                  { value: "", label: "전체" },
                  ...grades.map((g) => ({ value: g, label: gradeLabel(g) })),
                ]}
                onChange={(next) => {
                  setGrade(next);
                  setClassId("");
                  setPage(1);
                  setShown(MOBILE_STEP);
                }}
              />
              <FilterSelect
                label="반"
                value={classId}
                disabled={grade === ""}
                options={[
                  { value: "", label: "전체" },
                  ...all
                    .filter((r) => r.grade === grade)
                    .map((r) => ({
                      value: r.classId,
                      label: `${r.groupName ? `${r.groupName} ` : ""}${r.className}반`,
                    })),
                ]}
                onChange={(next) => {
                  setClassId(next);
                  setPage(1);
                  setShown(MOBILE_STEP);
                }}
              />
            </div>
            {mobile && <div className="flex justify-end">{actions}</div>}
            <section className="flex flex-col">
              <h2 className="pt-5 pb-4 text-app-card-title font-bold text-ink-strong">
                {`총 ${rows.length}개 학급`}
              </h2>
              {editing && (
                <Notice tone="Info">
                  정원을 넣지 않은 반은 가입자 수만 보여요. 가입률은 정원을 넣은
                  반만 계산해요
                </Notice>
              )}
              {mobile ? (
                <ClassCards rows={visible} {...editProp} />
              ) : (
                <ClassTable rows={visible} {...editProp} />
              )}
              {empty && (
                <EmptyMessage body="조회 범위에 학생이 없어요. 학년그룹이나 반을 바꿔 보세요" />
              )}
              {!empty &&
                (mobile ? (
                  <LoadMore
                    shown={Math.min(shown, rows.length)}
                    total={rows.length}
                    unit="반"
                    onMore={() => setShown((n) => n + MOBILE_STEP)}
                  />
                ) : (
                  <Pagination
                    page={page}
                    pageCount={Math.ceil(rows.length / PAGE_SIZE)}
                    total={rows.length}
                    pageSize={PAGE_SIZE}
                    onChange={setPage}
                  />
                ))}
            </section>
          </>
        )}
      </div>
    </>
  );
}
