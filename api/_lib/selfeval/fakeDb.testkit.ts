// 읽기 시작 시점을 재는 가짜 Db. 쿼리 체인을 await 하는 순간 시작으로 기록하고, 결과는 테스트가 넘겨 준다.

export type Started = { table: string; eq: Record<string, unknown> };

export function fakeDb(
  respond: (
    q: Started,
  ) => { data?: unknown; error?: { message: string }; count?: number } | "hold",
) {
  const started: Started[] = [];
  const held: ((v: unknown) => void)[] = [];
  const db = {
    from(table: string) {
      const q: Started = { table, eq: {} };
      const chain: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (
                onOk: (v: unknown) => unknown,
                onErr?: (e: unknown) => unknown,
              ) => {
                started.push(q);
                const out = respond(q);
                const base = { data: null, error: null, count: 0 };
                const p =
                  out === "hold"
                    ? new Promise((res) => held.push(res))
                    : Promise.resolve({ ...base, ...out });
                return p.then(onOk, onErr);
              };
            }
            if (prop === "eq") {
              return (k: string, v: unknown) => {
                q.eq[k] = v;
                return chain;
              };
            }
            return () => chain;
          },
        },
      );
      return chain;
    },
  };
  return {
    db: db as never,
    started,
    release: () => {
      for (const r of held.splice(0)) r({ data: [], error: null, count: 0 });
    },
  };
}
