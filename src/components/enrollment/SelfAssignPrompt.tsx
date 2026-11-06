import EnrollmentForm from "./EnrollmentForm";
import type { MyEnrollmentState } from "./useMyEnrollment";

// 학년도 전환 뒤 반과 번호가 비워진 학생이 스스로 입력하게 하는 안내(사 #109). 마이페이지 위쪽에 둔다.
export default function SelfAssignPrompt({ data, reload }: MyEnrollmentState) {
  // 기타 소속은 소속코드를 넣어 기관을 옮길 때 반을 받는다(결정 98.9).
  if (data?.isCatchAll) return null;
  if (!data?.enrollment || data.enrollment.className !== null) return null;

  return (
    <section className="mt-8 mb-10 rounded-2xl border border-line p-6">
      <h2 className="text-lg font-semibold text-ink">
        새 학년의 반과 번호를 입력해 주세요.
      </h2>
      <p className="mb-4 mt-1 text-sm text-ink-sub">
        입력하지 않으면 선생님 화면에는 반 미정으로 보여요.
      </p>
      <EnrollmentForm
        endpoint="self-assign"
        orgType={data.orgType}
        initialGrade={data.enrollment.grade}
        submitLabel="저장"
        onDone={reload}
      />
    </section>
  );
}
