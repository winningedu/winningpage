import GoalCard from "@/components/goal/GoalCard";
import GoalGradePyramid from "./GoalGradePyramid";

// #37 내신(과목군) / #38 정시(과목) 공용 카드(660×311) — part-13 구현 노트 "카드 4개는 과목군
// 단위 반복 컴포넌트 1개로 처리". name/badge 포맷만 데이터로 갈리고(국어군 vs 국어, `2.00 등급`
// vs `백분위 81 · 3등급`) 구조는 동일.
//
// 본문 폭 603px 고정 + 카드 높이 311px 고정이면 3줄 이상일 때 넘친다(part-13 §159) — 카드 높이를
// 고정하지 않고 min-height + 콘텐츠에 따라 자라도록 구현한다(고정 h 금지).
//
// 등급 피라미드(QA 행301) — grade/scaleMax가 둘 다 있을 때만 렌더한다(피라미드는 등급 기반이라
// 정시 백분위만 있고 등급 환산이 안 되는 입력은 없다, api/_lib/goal/directionReport.ts가 항상
// 등급도 함께 채운다).
//
// materials(추천 교재/자료), D13 보류가 QA 행301에서 해제됐다(api/_lib/goal/directionReport.ts
// getBooks가 채운다). 여전히 선택 prop으로 남겨 빈 배열이면 그 섹션 자체를 렌더하지 않는다
// (빈 타이틀+빈 wrap 잔여물 방지 — 원본 규칙 유지).
type SubjectDirectionCardProps = {
  name: string;
  zoneLabel?: string;
  badge?: string;
  body?: string;
  materials?: string[];
  grade?: number | null;
  scaleMax?: 5 | 9 | undefined;
};

export default function SubjectDirectionCard({
  name,
  zoneLabel,
  badge,
  body,
  materials,
  grade,
  scaleMax,
}: SubjectDirectionCardProps) {
  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-77.75 flex-col gap-4 px-7.5 py-7.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-app-card-title font-bold text-ink-strong">
            {name}
          </h3>
          <span className="text-app-label text-ink-sub">{zoneLabel}</span>
        </div>
        <span className="inline-flex h-8 w-fit shrink-0 items-center rounded-full bg-[#E0DDF4] px-3 text-app-label font-bold text-[#5B4E9E]">
          {badge}
        </span>
      </div>

      {scaleMax != null && (
        <GoalGradePyramid
          subjectLabel={name}
          grade={grade}
          scaleMax={scaleMax}
        />
      )}

      <div className="flex flex-col gap-2">
        <p className="text-app-caption font-semibold text-ink-sub">공부 방향</p>
        <p className="max-w-150.75 text-app-body leading-[1.6] text-ink">
          {body}
        </p>
      </div>

      {materials && materials.length > 0 && (
        <div className="mt-auto flex flex-col gap-2.5">
          <p className="text-app-caption font-semibold text-ink-sub">
            추천 교재/자료
          </p>
          <div className="flex flex-wrap gap-2">
            {materials.map((material) => (
              <span
                key={material}
                className="inline-flex h-8 w-fit items-center rounded-full bg-goal-cardTone-cream px-3 text-app-label font-medium text-ink-strong"
              >
                {material}
              </span>
            ))}
          </div>
        </div>
      )}
    </GoalCard>
  );
}
