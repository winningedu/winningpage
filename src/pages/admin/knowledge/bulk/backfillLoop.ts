// 일괄 반영 뒤 임베딩 backfill 반복 호출 루프. admin-embed backfill 은 한 번에 최대
// 50건만 태우므로, 이번 회차에 새로 임베딩한 건수(embedded)가 0 이 될 때까지 부른다.
// 계속 실패하는 행은 embedded 에 잡히지 않아 루프를 붙잡지 않는다. 마지막 회차의
// failed 를 돌려줘 화면이 남은 실패 건수를 안내하게 한다.

export type BackfillRound = { embedded: number; failed: number };

export async function runBackfillUntilDone(
  callBackfill: () => Promise<BackfillRound>,
  onProgress: (progress: { embedded: number; rounds: number }) => void,
): Promise<{ embedded: number; rounds: number; lastFailed: number }> {
  let embedded = 0;
  let rounds = 0;
  for (;;) {
    const round = await callBackfill();
    rounds += 1;
    if (round.embedded <= 0) {
      return { embedded, rounds, lastFailed: round.failed };
    }
    embedded += round.embedded;
    onProgress({ embedded, rounds });
  }
}
