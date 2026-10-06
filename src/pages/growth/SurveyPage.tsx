import { useEffect, useState } from "react";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import {
  useGrowthScreenStep,
  useGrowthShell,
} from "@/components/growth/GrowthShellContext";
import SurveyForm from "@/components/growth/survey/SurveyForm";

// 학생 조사(No.26~36, 142, 144). 24문항을 문항별 자동 저장으로 받는다.
// 경로: /app/growth/survey
export default function SurveyPage() {
  useGrowthScreenStep(2);
  const { bootstrap, bootstrapError, refetchBootstrap } = useGrowthShell();

  // 재진입 때 직전 저장분이 반영된 데이터로 시작하도록 한 번 새로 받는다
  // (이전 화면을 떠날 때의 갱신이 아직 끝나지 않았을 수 있다).
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    let alive = true;
    refetchBootstrap().finally(() => {
      if (alive) setFresh(true);
    });
    return () => {
      alive = false;
    };
  }, [refetchBootstrap]);

  return (
    <>
      <GoalPageHeader
        title="학생 조사"
        subcopy="활동 기록만으로는 알 수 없는 것을 묻습니다. 24문항이며 약 10분 걸립니다."
      />
      <div className="max-w-goal-content px-4 pb-24 md:px-12">
        {bootstrap && fresh ? (
          <SurveyForm
            bootstrap={bootstrap}
            refetchBootstrap={refetchBootstrap}
          />
        ) : bootstrapError ? (
          <p role="alert" className="text-app-body text-ink-sub">
            조사 문항을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.
          </p>
        ) : (
          <p className="text-app-body text-ink-sub">불러오는 중</p>
        )}
      </div>
    </>
  );
}
