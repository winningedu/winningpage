// W18 마이페이지(스펙 4절). 내 정보를 읽기 전용 행으로 보여 주고 비밀번호 변경 창을 연다.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ChangePasswordDialog from "./ChangePasswordDialog";
import { classLabel, sortClasses } from "./classLabel";
import PageHeader from "./PageHeader";
import { useConsoleMe, useGradeLabel } from "./useConsoleMe";

const ROLE_LABEL: Record<string, string> = {
  homeroom: "담임교사",
  school_admin: "학교 전체 관리자",
};

export default function MyPage() {
  const gradeLabel = useGradeLabel();
  const { me } = useConsoleMe();
  const [dialogOpen, setDialogOpen] = useState(false);
  const scope =
    me.kind === "homeroom"
      ? sortClasses(me.classes)
          .map(
            (c) => `${classLabel(c, gradeLabel)}${c.isPrimary ? "(주)" : ""}`,
          )
          .join(", ")
      : "전교";
  const rows: [string, string][] = [
    ["아이디", `${me.teacher?.loginId ?? ""} (조회만, 수정 불가)`],
    ["이름", me.teacher?.name ?? ""],
    ["역할", ROLE_LABEL[me.teacher?.role ?? ""] ?? ""],
    ["담당 범위", scope],
  ];
  return (
    <>
      <PageHeader title="마이페이지" subtitle="내 정보와 설정" />
      <div className="flex max-w-content flex-col gap-5 px-4 md:gap-6 md:px-8 lg:px-12">
        <dl className="border-t border-line">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex flex-col gap-1 border-b border-line py-3.5 md:flex-row md:gap-4"
            >
              <dt className="text-app-label font-medium text-ink-sub md:w-[8.75rem]">
                {label}
              </dt>
              <dd className="text-app-body text-ink-strong">{value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDialogOpen(true)}
            className="h-11 rounded-lg border-line px-5 text-app-label font-semibold text-primary max-md:w-full md:h-10"
          >
            비밀번호 변경
          </Button>
        </div>
      </div>
      <ChangePasswordDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
