import { CARD } from "@/components/growth/start/cardStyles";

// 시작 화면 통계 3칸(시안 01). 값을 모르는 칸은 그리지 않는다.
type Props = {
  quotaRemaining: number | null;
  quotaTotal: number | null;
  activityCount: number;
  openCount: number;
};

function Stat({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: number;
  unit: string;
  hint?: string;
}) {
  return (
    <div className={`${CARD} flex-1`}>
      <p className="text-app-label text-ink-sub">{label}</p>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="text-app-stat font-bold text-ink-strong">{value}</span>
        <span className="text-app-label text-ink-sub">{unit}</span>
      </p>
      {hint && <p className="mt-2 text-app-caption text-ink-sub">{hint}</p>}
    </div>
  );
}

export default function StartStats({
  quotaRemaining,
  quotaTotal,
  activityCount,
  openCount,
}: Props) {
  return (
    <div className="flex gap-4">
      {quotaRemaining !== null && (
        <div className={`${CARD} flex-1`}>
          <p className="text-app-label text-ink-sub">이용 가능 횟수</p>
          <p className="mt-3 flex items-baseline gap-1">
            <span className="text-app-stat font-bold text-ink-strong">
              {quotaRemaining}
            </span>
            {quotaTotal !== null && (
              <span className="text-app-label text-ink-sub">
                / {quotaTotal}회
              </span>
            )}
          </p>
          <p className="mt-2 text-app-caption text-ink-sub">
            생성에 성공하면 1회 차감돼요
          </p>
        </div>
      )}
      <Stat label="저장된 활동" value={activityCount} unit="건" />
      <Stat
        label="작성 중인 자기평가서"
        value={openCount}
        unit="건"
        hint="동시에 하나만 작성할 수 있어요"
      />
    </div>
  );
}
