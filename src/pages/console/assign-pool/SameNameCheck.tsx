// 선택한 미배정 학생의 동명 재학생 확인(번호 중복을 피해 배치하도록). 이름은 서버가 가린 그대로 쓴다.

import { slotLabel } from "../slotLabel";
import { useGradeLabel } from "../useConsoleMe";
import type { PoolStudent } from "./types";

export default function SameNameCheck({ student }: { student: PoolStudent }) {
  const gradeLabel = useGradeLabel();
  return (
    <div
      data-testid="same-name-check"
      className="flex flex-col gap-1 rounded-lg bg-surface-muted px-4 py-3 text-app-label text-ink"
    >
      <p>{`학생 선택: ${student.name}. 동명 재학생 확인: ${student.name} ${student.sameNameCount}명`}</p>
      {student.sameNameEnrolled.map((s) => (
        <p
          key={`${s.grade}-${s.groupName}-${s.className}-${s.number}`}
        >{`${slotLabel({ ...s, number: null }, gradeLabel)} ${s.number === null ? "번호 미입력" : `${s.number}번`}, 이용 서비스 ${s.usedServiceCount}/${s.serviceTotal}`}</p>
      ))}
    </div>
  );
}
