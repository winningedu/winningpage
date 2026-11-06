import { useState } from "react";
import type { EnrollmentClass } from "./api";
import EnrollmentForm from "./EnrollmentForm";
import { useMyEnrollment } from "./useMyEnrollment";

const ROW_BOX_CLASS =
  "flex h-13 flex-1 items-center rounded-xl border border-line bg-surface-footer px-5 text-base text-ink-sub";

function classText(c: EnrollmentClass): string {
  const parts = [c.grade, c.groupName];
  if (c.className === null)
    return [...parts, "반 미정"].filter(Boolean).join(" ");
  parts.push(`${c.className}반`);
  if (c.number !== null) parts.push(`${c.number}번`);
  return parts.filter(Boolean).join(" ");
}

// 마이페이지 학년, 반, 번호 행(사 #110). 바로 고치지 않고 수정요청으로 보내 담임 승인을 거친다.
export default function ChangeRequestSection() {
  const { data, reload } = useMyEnrollment();
  const [editing, setEditing] = useState(false);
  if (!data?.enrollment) return null;
  const { enrollment, pending } = data;

  return (
    <div className="mb-5">
      <p className="mb-2 text-sm text-ink">학년, 반, 번호</p>
      <div className="flex items-center gap-2">
        <div className={ROW_BOX_CLASS}>{classText(enrollment)}</div>
        {!pending && enrollment.className !== null && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-13 shrink-0 whitespace-nowrap rounded-xl border border-line px-4 text-sm text-ink transition hover:bg-surface-card"
          >
            수정요청하기
          </button>
        )}
      </div>
      {pending && (
        <p className="mt-2 text-xs text-ink-sub">
          승인 대기 중: {classText(pending)}
        </p>
      )}
      {editing && !pending && (
        <div className="mt-3">
          <EnrollmentForm
            endpoint="request-change"
            orgType={data.orgType}
            initialGrade={enrollment.grade}
            submitLabel="수정요청하기"
            onDone={() => {
              setEditing(false);
              void reload();
            }}
          />
        </div>
      )}
    </div>
  );
}
