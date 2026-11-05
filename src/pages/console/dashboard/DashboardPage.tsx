// W5 대시보드(/teacher). 담당 범위의 서비스 이용 학생, 목표시간 달성율, 서비스별 이용현황.
// 담임은 주 담당 학급으로 시작하고 학교 관리자와 본사 대행은 기관 전체로 시작한다. 조회를 눌러야 범위가 바뀐다.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { gradeLabel, primaryClass } from "../classLabel";
import Notice from "../Notice";
import PageHeader from "../PageHeader";
import { useClasses } from "../student-history/useClasses";
import { useToast } from "../Toast";
import { useConsoleMe } from "../useConsoleMe";
import AchievementCard from "./AchievementCard";
import DashboardFilter from "./DashboardFilter";
import { dotDate } from "./format";
import ServiceCard from "./ServiceCard";
import UsageCard from "./UsageCard";
import { type DashboardFilterValue, useDashboard } from "./useDashboard";

const NO_STUDENTS =
  "연결된 학생이 없습니다. 학생들이 가입하면 자동으로 표시됩니다";

export default function DashboardPage() {
  const { me } = useConsoleMe();
  const toast = useToast();
  const homeroom = me.kind === "homeroom";
  const primary = primaryClass(me.classes);
  const initial: DashboardFilterValue =
    homeroom && primary
      ? { grade: primary.grade, groupId: "", classId: primary.id }
      : { grade: "", groupId: "", classId: "" };
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const classes = useClasses();
  const stats = useDashboard(applied);

  useEffect(() => {
    if (stats.isError || classes.isError) {
      toast.show({
        tone: "Error",
        message: "대시보드를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      });
    }
  }, [stats.isError, classes.isError, toast.show]);

  const options = classes.data ?? [];
  const className = options.find((c) => c.id === applied.classId)?.name;
  const groupName = options.find(
    (c) => c.groupId === applied.groupId,
  )?.groupName;
  const scope = [
    groupName,
    applied.grade && gradeLabel(applied.grade),
    className && `${className}반`,
  ]
    .filter(Boolean)
    .join(" ");
  const scopeLabel = homeroom
    ? `담당 학급 ${scope || "전체"}`
    : scope || "전교";
  const breadcrumb = applied.grade
    ? [
        me.tenant.name,
        gradeLabel(applied.grade),
        ...(className ? [`${className}반`] : []),
      ]
    : [me.tenant.name, "전체"];
  const loaded = stats.data && classes.data;
  const failed = stats.isError || classes.isError;

  return (
    <>
      <PageHeader
        title="대시보드"
        subtitle="오늘의 학생 현황을 한눈에 확인하세요."
        breadcrumb={breadcrumb}
        {...(loaded && {
          asOf: `집계 기준: ${scopeLabel}, ${dotDate(stats.data.asOf)} 기준`,
        })}
        actions={
          <DashboardFilter
            classes={options}
            value={draft}
            onChange={setDraft}
            onSubmit={() => setApplied(draft)}
          />
        }
      />
      <div
        aria-busy={!loaded && !failed}
        className="flex max-w-content flex-col gap-4 px-4 md:px-8 lg:px-12"
      >
        {failed && (
          <Notice tone="Danger">
            <p className="flex items-center gap-3">
              대시보드를 불러오지 못했어요
              <Button
                type="button"
                onClick={() => {
                  void stats.refetch();
                  void classes.refetch();
                }}
              >
                다시 시도
              </Button>
            </p>
          </Notice>
        )}
        {loaded && stats.data.usage.totalCount === 0 && (
          <Notice tone="Info">{NO_STUDENTS}</Notice>
        )}
        {!failed && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <UsageCard usage={loaded ? stats.data.usage : null} />
            <div className="flex min-w-0 flex-1 flex-col gap-6">
              <AchievementCard goal={loaded ? stats.data.goal : null} />
              <ServiceCard
                stats={loaded ? stats.data : null}
                caption={
                  homeroom
                    ? "이용 학생 수와 담당 학급 안의 비율"
                    : "이용 학생 수와 조회 범위 안의 비율"
                }
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
