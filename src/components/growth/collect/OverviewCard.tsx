import type { SourceCounts } from "@/lib/growth/api";
import { CollectSection, CountRow, NoticeBox } from "./CollectSection";
import { buildOverview } from "./collectLogic";

/** 분석 대상 요약 카드(No.47). 안내 문구는 서버 warnings 를 그대로 보여 준다. */
export function OverviewCard({
  bySource,
  warnings,
}: {
  bySource: SourceCounts;
  warnings: string[];
}) {
  const overview = buildOverview(bySource);
  return (
    <CollectSection title="분석 대상 요약">
      <div>
        <CountRow label="위닝 저장 활동" count={overview.winning} />
        <CountRow label="추가 업로드" count={overview.upload} />
        <CountRow label="직접 입력" count={overview.manual} />
        <CountRow label="분석 대상 합계" count={overview.total} strong />
      </div>
      {warnings.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {warnings.map((text) => (
            <NoticeBox key={text} tone="warn">
              {text}
            </NoticeBox>
          ))}
        </div>
      )}
    </CollectSection>
  );
}
