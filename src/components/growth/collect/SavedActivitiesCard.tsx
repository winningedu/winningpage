import type { SourceCounts } from "@/lib/growth/api";
import { CollectSection, CountRow, NoticeBox } from "./CollectSection";

/** 저장된 활동 카드(No.38, 39). 0건이면 시안 646:3001 의 안내를 위에 얹는다. */
export function SavedActivitiesCard({ bySource }: { bySource: SourceCounts }) {
  return (
    <CollectSection title="저장된 활동">
      {bySource.total === 0 && (
        <div className="mb-3">
          <NoticeBox>
            <p className="font-semibold">저장된 활동이 아직 없어요</p>
            <p className="mt-1 text-ink-sub">
              올리기와 직접 입력 중 편한 방법으로 채워요. 활동이 없으면
              실행계획은 활동을 만드는 과제부터 놓아요.
            </p>
          </NoticeBox>
        </div>
      )}
      <div>
        <CountRow label="위닝 수행평가" count={bySource.performance} />
        <CountRow label="위닝 자기평가서" count={bySource.self} />
        <CountRow label="위닝 심화탐구" count={bySource.deep} />
        <CountRow label="직접 입력" count={bySource.manual} />
        <CountRow label="합계" count={bySource.total} strong />
      </div>
    </CollectSection>
  );
}
