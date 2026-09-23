// 리포트 공용 표지 — QA 2차 시트 행37·51("최종 리포트에 표지를 붙여 달라", 고객사
// "매우중요"). 학습진단(A4 시트)·목표관리 성장 리포트(react-to-print 문서 흐름)·
// 수행평가 리포트(react-to-print 모달, 인쇄 전용)가 이 컴포넌트 하나를 공유한다.
//
// 고객사 참고 샘플(경쟁사 리로스쿨)은 구성만 참조하고 그대로 베끼지 않는다(지시 원문
// "샘플은 참조만, 동일하게 만들면 안 된다") — 3D 오브젝트 일러스트 대신 브랜드 색
// 추상 기하 도형을 쓴다.
//
// 값이 없는 항목은 렌더하지 않는다(폴백 상수 금지 — no-fallback-constants) — 학생 이름·
// 목표대학·목표학과·날짜는 전부 선택 prop이고, 없으면 그 줄 자체가 빠진다.
export type ReportCoverPageVariant = "a4" | "flow";

export type ReportCoverPageProps = {
  serviceLabel: string;
  title: string;
  studentName?: string | null;
  targetMajor?: string | null;
  targetUniversity?: string | null;
  dateLabel?: string | null;
  variant?: ReportCoverPageVariant;
  className?: string;
};

export default function ReportCoverPage({
  serviceLabel,
  title,
  studentName,
}: ReportCoverPageProps) {
  return (
    <section>
      <p className="text-sm font-semibold text-accent">{serviceLabel}</p>
      <p>{title}</p>
      {studentName && <p>{studentName} 학생</p>}
    </section>
  );
}
