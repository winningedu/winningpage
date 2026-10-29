import GoalCard from "@/components/goal/GoalCard";
import { kstYMD } from "@/lib/goal/calc";

// "오늘의 조언" 카드(530×194 = 33.125rem×12.125rem, part-07 #20 y=700) — 카드 타이틀 + 본문만
// 렌더한다. 조언 뱃지("일일 분석 조언"/"AI 입시 분석 조언")는 이 카드 소속이 아니라 페이지
// 헤더(y=100, `DashboardPageHeader`)에 있다(part-07 §126 실측 정정, 2026-08-10 — 직전 작업에서
// 이 카드 안에 뱃지를 넣었던 것은 잘못된 지시에 따른 것이었다).
//
// QA 행295·306 — 본문은 GET /api/goal/advice의 오늘 섹션(라벨 소제목 + 본문, "오늘의
// 조언"/"AI 입시조언")만 그린다. "내일 계획 제시"/"다음 계획 제시" 섹션은 TomorrowPlanCard
// 소유로 옮겨 텍스트 중복을 없앴다(팀장 후속 지시, 2026-09-02). 학과 팁(majorTips)은 이
// 카드에 그대로 둔다(다른 카드에 자리가 없어 이 카드가 소유, 판단 지점 유지).
//
// QA 행70, 조언은 기록 제출 때만 생성돼 다음 날 기록 전에는 오늘 행이 없다. 서버가 가장 최근
// 행을 내려주면 generatedFor가 오늘(KST)이 아닐 때 "10월 28일 조언" 라벨을 붙인다. 조언이 한
// 번도 없으면(data null) 빈 박스 대신 안내 문구 한 줄을 보여준다(가짜 조언 상수는 쓰지 않는다).
export type AdviceCardSection = { label: string; body: string };
export type AdviceCardMajorTip = { department: string; text: string };

export type AdviceCardData = {
  section: AdviceCardSection;
  majorTips: AdviceCardMajorTip[];
} | null;

type AdviceCardProps = {
  data: AdviceCardData;
  /** 조언 생성일(YYYY-MM-DD, KST). 오늘이 아니면 날짜 라벨을 보여준다. */
  generatedFor?: string | null;
};

function formatAdviceDateLabel(generatedFor: string) {
  const [, month, day] = generatedFor.split("-");
  return `${Number(month)}월 ${Number(day)}일 조언`;
}

export default function AdviceCard({ data, generatedFor }: AdviceCardProps) {
  const isPast = !!generatedFor && generatedFor !== kstYMD();
  return (
    <GoalCard tone="neutral" className="flex h-full flex-col gap-4 px-8 py-7">
      <h3 className="text-app-card-title font-bold text-ink-strong">
        오늘의 조언
      </h3>
      {!data && (
        <p className="text-app-body leading-normal text-ink-sub">
          오늘의 공부 기록을 남기면 조언이 생성돼요
        </p>
      )}
      {data && isPast && (
        <p className="text-app-label text-ink-sub">
          {formatAdviceDateLabel(generatedFor)}
        </p>
      )}
      {data && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-app-label font-semibold text-ink-sub">
              {data.section.label}
            </p>
            <p className="text-app-body leading-normal text-ink">
              {data.section.body}
            </p>
          </div>
          {data.majorTips.length > 0 && (
            <div className="flex flex-col gap-3">
              {data.majorTips.map((tip) => (
                <div key={tip.department} className="flex flex-col gap-1">
                  <p className="text-app-label font-semibold text-ink-sub">
                    [{tip.department}]
                  </p>
                  <p className="text-app-body leading-normal text-ink">
                    {tip.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </GoalCard>
  );
}
