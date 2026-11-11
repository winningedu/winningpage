import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import GoalTabs from "@/components/goal/GoalTabs";
import {
  WEEK_SCHEDULE_ACADEMY_TIME_MAX,
  WEEK_SCHEDULE_MAX_ACADEMIES,
  WEEK_SCHEDULE_SCHOOL_TIME_MAX,
  WEEK_SCHEDULE_SLEEP_MAX,
  WEEK_SCHEDULE_TIME_STEP,
  WEEK_SCHEDULE_WAKE_MAX,
  WEEKDAY_OPTIONS,
} from "@/components/goal/onboarding/onboardingOptions";
import QuestionCard from "@/components/goal/onboarding/QuestionCard";
import TimeNumberField from "@/components/goal/onboarding/TimeNumberField";
import WizardActions from "@/components/goal/onboarding/WizardActions";
import ToggleRow from "@/components/mypage/ToggleRow";
import { useGoalOnboarding } from "@/context/GoalOnboardingContext";
import {
  ACADEMY_COMMUTE_HOURS,
  calcAvailableHours,
} from "@/lib/goal/calc/index.js";

// 7단계(마지막) — QA 행293(2026-09-02 개편). 원본 계약(target/components/IntakeForm.tsx:
// 1814-1920) 그대로 요일별 {기상, 취침, 등교 여부, 등하교 시각, 학원 N건}을 받는다.
// 시안엔 요일마다 카드를 나열하지만(생활 패턴 스텝), 우리 위저드는 스텝 하나에 한 화면만
// 쓰는 관례라 요일 탭(GoalTabs)으로 접었다 — 입력 계약과 계산은 원본과 동일하다.
//
// "다음" 버튼은 이전 스텝(단일 세트 4필드)과 마찬가지로 항상 활성이다 — 기본값이 이미
// 유효한 하루 일정(기상7·취침24·평일 등교 8.5~16.5)으로 채워져 있어 별도 검증 없이도
// "다음"을 누르면 온보딩이 완료된다. "다음" 클릭은 Onboarding.tsx의 onFinish(계산 로딩
// 오버레이 → 대시보드 이동)로 연결된다.
type Step7DailyScheduleProps = {
  goPrev: () => void;
  onFinish: () => void;
};

const DAY_TABS = WEEKDAY_OPTIONS.map(({ key, label }) => ({
  value: key,
  label,
}));

export default function Step7DailySchedule({
  goPrev,
  onFinish,
}: Step7DailyScheduleProps) {
  const {
    weekSchedule,
    setWeekScheduleDay,
    addAcademy,
    removeAcademy,
    updateAcademy,
    copyWeekScheduleDay,
  } = useGoalOnboarding();
  const [activeDay, setActiveDay] = useState(WEEKDAY_OPTIONS[0]!.key);

  // weekSchedule은 WEEKDAY_OPTIONS로부터 빌드되어 모든 key가 항상 존재한다.
  const day = weekSchedule[activeDay]!;
  const otherDays = WEEKDAY_OPTIONS.filter(({ key }) => key !== activeDay);
  const canAddAcademy = day.academies.length < WEEK_SCHEDULE_MAX_ACADEMIES;

  // 실시간 미리보기 — 서버(api/_routes/goal/intake.ts buildWeeklySchedule)와 동일한 순수 함수를
  // 그대로 재사용한다(계산 모듈은 클라이언트·서버 양쪽에서 import 가능, calc/DIVERGENCE.md
  // 상단 "이식 원칙" 참고). 학원 이동시간 상수도 서버와 같은 ACADEMY_COMMUTE_HOURS(0.5h,
  // QA 행293 사용자 결정)를 쓴다 — 화면에 보이는 값과 저장되는 값이 어긋나지 않는다.
  const available = useMemo(
    () => calcAvailableHours(day, day.hasSchool, ACADEMY_COMMUTE_HOURS),
    [day],
  );

  return (
    <>
      <QuestionCard
        step="7"
        label="자습 시간 입력"
        title="하루 일정을 알려주세요."
        description="요일마다 기상・취침・등하교・학원 시간을 입력하면 실제로 쓸 수 있는 자습 시간을 계산합니다."
      >
        <GoalTabs
          tabs={DAY_TABS}
          value={activeDay}
          onChange={setActiveDay}
          ariaLabel="요일 선택"
          gap="1.25rem"
        />

        <div className="mt-6 flex flex-col gap-6">
          {otherDays.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="week-schedule-copy-source"
                className="text-app-label text-ink-sub"
              >
                다른 요일 일정 가져오기
              </label>
              <select
                id="week-schedule-copy-source"
                // 선택 즉시 복사만 하고 셀렉트 자체는 아무 요일도 "선택된 상태"로 유지하지
                // 않는다(복사는 1회성 동작이지 지속되는 값이 아니라서) — 항상 value=""로
                // 되돌아가는 제어 컴포넌트로 둔다.
                value=""
                onChange={(event) => {
                  const fromDayKey = event.target.value;
                  if (fromDayKey) copyWeekScheduleDay(fromDayKey, activeDay);
                }}
                className="h-9 rounded-lg border border-line bg-white px-3 text-app-label text-ink focus:border-accent focus:outline-hidden"
              >
                <option value="" disabled>
                  요일 선택
                </option>
                {otherDays.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label} 일정 가져오기
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <TimeNumberField
              label="기상 시각"
              value={day.wake}
              onChange={(value) =>
                setWeekScheduleDay(activeDay, { wake: value })
              }
              min={0}
              max={WEEK_SCHEDULE_WAKE_MAX}
              step={WEEK_SCHEDULE_TIME_STEP}
            />
            <TimeNumberField
              label="취침 시각"
              value={day.sleep}
              onChange={(value) =>
                setWeekScheduleDay(activeDay, { sleep: value })
              }
              min={0}
              max={WEEK_SCHEDULE_SLEEP_MAX}
              step={WEEK_SCHEDULE_TIME_STEP}
            />
          </div>

          <ToggleRow
            label="학교 가는 날"
            checked={day.hasSchool}
            onChange={(checked) =>
              setWeekScheduleDay(activeDay, { hasSchool: checked })
            }
          />

          {day.hasSchool && (
            <div className="grid grid-cols-2 gap-4">
              <TimeNumberField
                label="등교 시각"
                value={day.schoolStart}
                onChange={(value) =>
                  setWeekScheduleDay(activeDay, { schoolStart: value })
                }
                min={0}
                max={WEEK_SCHEDULE_SCHOOL_TIME_MAX}
                step={WEEK_SCHEDULE_TIME_STEP}
              />
              <TimeNumberField
                label="하교 시각"
                value={day.schoolEnd}
                onChange={(value) =>
                  setWeekScheduleDay(activeDay, { schoolEnd: value })
                }
                min={0}
                max={WEEK_SCHEDULE_SCHOOL_TIME_MAX}
                step={WEEK_SCHEDULE_TIME_STEP}
              />
            </div>
          )}

          <div>
            <p className="mb-3 text-app-body font-semibold text-ink-strong">
              학원・과외
            </p>
            {day.academies.length > 0 && (
              <div className="flex flex-col gap-3">
                {day.academies.map((slot, index) => (
                  // 이 목록은 재정렬・삽입이 없고 index가 곧 학원 순번(등원1/등원2…)의
                  // 표시 라벨과 1:1이라 key로 써도 안전하다(추가는 항상 끝에, 삭제는
                  // removeAcademy가 그 아래 항목들을 한 칸씩 당긴다).
                  // biome-ignore lint/suspicious/noArrayIndexKey: 위 사유.
                  <div key={index} className="flex items-end gap-3">
                    <TimeNumberField
                      label={`학원 등원 ${index + 1}`}
                      value={slot.start}
                      onChange={(value) =>
                        updateAcademy(activeDay, index, { start: value })
                      }
                      min={0}
                      max={WEEK_SCHEDULE_ACADEMY_TIME_MAX}
                      step={WEEK_SCHEDULE_TIME_STEP}
                    />
                    <TimeNumberField
                      label={`학원 하원 ${index + 1}`}
                      value={slot.end}
                      onChange={(value) =>
                        updateAcademy(activeDay, index, { end: value })
                      }
                      min={0}
                      max={WEEK_SCHEDULE_ACADEMY_TIME_MAX}
                      step={WEEK_SCHEDULE_TIME_STEP}
                    />
                    <button
                      type="button"
                      onClick={() => removeAcademy(activeDay, index)}
                      aria-label={`학원 ${index + 1} 삭제`}
                      className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl border border-line text-ink-sub transition-colors hover:border-red-300 hover:text-red-500"
                    >
                      <X size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {canAddAcademy && (
              <button
                type="button"
                onClick={() => addAcademy(activeDay)}
                className="mt-3 flex h-11 items-center gap-1.5 rounded-full border border-dashed border-line px-4 text-app-label font-semibold text-ink-sub transition-colors hover:border-accent hover:text-accent"
              >
                <Plus size={15} strokeWidth={2.5} />
                학원 추가
              </button>
            )}
          </div>

          {/* QA 행293 — 실시간 계산 표시. 서버 저장값과 같은 순수 함수(calcAvailableHours)
              결과라 화면·저장 사이 불일치가 없다. */}
          <div className="rounded-xl bg-surface-03 px-5 py-4">
            <p className="text-app-body font-bold text-ink-strong">
              가용 자습시간 {available}h
            </p>
            <p className="mt-1 text-app-label text-ink-sub">
              (취침 − 기상) − 식사・정리 1.5h − 학교 − (학원 시간 + 이동{" "}
              {ACADEMY_COMMUTE_HOURS}h)로 계산돼요.
            </p>
          </div>
        </div>
      </QuestionCard>

      <WizardActions onPrev={goPrev} onNext={onFinish} nextDisabled={false} />
    </>
  );
}
