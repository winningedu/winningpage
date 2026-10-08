// 일괄 반영 뒤 임베딩 backfill 반복 호출 루프. admin-embed backfill 은 한 번에 최대
// 50건만 태우므로, 이번 회차에 새로 임베딩한 건수(embedded)가 0 이 될 때까지 부른다.
// 계속 실패하는 행은 embedded 에 잡히지 않아 루프를 붙잡지 않는다. 마지막 회차의
// failed 를 돌려줘 화면이 남은 실패 건수를 안내하게 한다. 호출 자체가 실패하면
// 그 회차에서 멈추고 메시지를 ok:false 로 돌려준다.

import type { ApiResult } from "../apiResult";

export type BackfillRound = { embedded: number; failed: number };

type BackfillSummary = { embedded: number; rounds: number; lastFailed: number };

export async function runBackfillUntilDone(
  callBackfill: () => Promise<ApiResult<BackfillRound>>,
  onProgress: (progress: { embedded: number; rounds: number }) => void,
): Promise<ApiResult<BackfillSummary>> {
  let embedded = 0;
  let rounds = 0;
  for (;;) {
    const round = await callBackfill();
    if (!round.ok) return round;
    rounds += 1;
    if (round.data.embedded <= 0) {
      return {
        ok: true,
        data: { embedded, rounds, lastFailed: round.data.failed },
      };
    }
    embedded += round.data.embedded;
    onProgress({ embedded, rounds });
  }
}
