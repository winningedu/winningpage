// 반 한 줄의 미가입 수(QA 52). 보이는 값이 명단 대기 수와 같고 0보다 클 때만 그 반 학생 목록으로 잇는다.
// 정원 빈자리로 채운 값에는 보여 줄 학생 명단이 없다.

import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { type ClassRow, studentListPath, unenrolledOf } from "./format";

export default function UnenrolledCount({
  row,
  className,
}: {
  row: ClassRow;
  className?: string;
}) {
  const count = unenrolledOf(row);
  if (count === row.pendingCount && count > 0) {
    return (
      <Link to={studentListPath(row)} className={cn("underline", className)}>
        {`${count}`}
      </Link>
    );
  }
  return <span className={className}>{`${count}`}</span>;
}
